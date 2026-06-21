import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/**
 * Minimal client for a LOCAL ComfyUI server's HTTP API — in-app txt2img so the DM
 * can generate token art, maps and decals without leaving the table. Posts a
 * standard txt2img graph to `/prompt`, polls `/history/{id}`, fetches the produced
 * image from `/view`, and saves it under `uploads/` (returning a `/uploads/...`
 * path the app already serves). Fail-safe: every call no-ops cleanly when ComfyUI
 * isn't reachable, so the feature simply stays hidden.
 */

let reachable = false;
export const comfyReachable = (): boolean => reachable;

/** Probe the ComfyUI server (GET /system_stats) and cache whether it's up. */
export async function refreshComfy(): Promise<boolean> {
  if (!config.comfyUrl) return (reachable = false);
  try {
    const r = await fetch(`${config.comfyUrl}/system_stats`, {
      signal: AbortSignal.timeout(2500),
    });
    return (reachable = r.ok);
  } catch {
    return (reachable = false);
  }
}

/** Read the option list for a loader node's filename input (e.g. UNETLoader →
 *  unet_name, CheckpointLoaderSimple → ckpt_name). Empty when ComfyUI/the node
 *  isn't reachable. */
export async function listLoaderOptions(nodeClass: string, inputName: string): Promise<string[]> {
  if (!config.comfyUrl) return [];
  try {
    const r = await fetch(`${config.comfyUrl}/object_info/${nodeClass}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as Record<string, { input?: Record<string, Record<string, unknown>> }>;
    const slots = data?.[nodeClass]?.input ?? {};
    // The option list is the first element of the input's tuple: [ [names...], {opts} ].
    const tuple = (slots.required?.[inputName] ?? slots.optional?.[inputName]) as
      | [unknown]
      | undefined;
    const names = Array.isArray(tuple) ? tuple[0] : undefined;
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** List installed checkpoints (for the built-in SD graph's checkpoint picker). */
export async function listComfyModels(): Promise<string[]> {
  return listLoaderOptions('CheckpointLoaderSimple', 'ckpt_name');
}

/** List installed LoRAs (for the map-LoRA picker). Same file list whichever LoRA
 *  node exposes it; fall back if the model-only variant isn't registered. */
export async function listComfyLoras(): Promise<string[]> {
  const a = await listLoaderOptions('LoraLoaderModelOnly', 'lora_name');
  return a.length ? a : listLoaderOptions('LoraLoader', 'lora_name');
}

// Loader node classes → the filename input(s) we should validate against ComfyUI.
const LOADER_FILENAME_INPUTS: Record<string, string[]> = {
  CheckpointLoaderSimple: ['ckpt_name'],
  UNETLoader: ['unet_name'],
  CLIPLoader: ['clip_name'],
  DualCLIPLoader: ['clip_name1', 'clip_name2'],
  TripleCLIPLoader: ['clip_name1', 'clip_name2', 'clip_name3'],
  VAELoader: ['vae_name'],
  LoraLoader: ['lora_name'],
  LoraLoaderModelOnly: ['lora_name'],
};

/** Best installed file for a requested name — exact, else a SAFE near-match (an
 *  added suffix like `-fp8`, or a shared stem), never a loose guess. Returns null
 *  when nothing is close enough (so `qwen_3_4b` never silently becomes `qwen_3_8b`). */
export function bestModelMatch(requested: string, available: string[]): string | null {
  if (available.includes(requested)) return requested;
  const stem = (s: string) =>
    (s.split(/[\\/]/).pop() ?? s).replace(/\.[^.]+$/, '').toLowerCase();
  const rs = stem(requested);
  const scored = available
    .map((a) => {
      const as = stem(a);
      let score = -1;
      if (as === rs) score = 100; // same name, different folder/extension
      else if (as.startsWith(rs)) score = 80 - (as.length - rs.length); // installed adds a suffix (-fp8)
      else if (rs.startsWith(as)) score = 60 - (rs.length - as.length); // request adds a suffix
      return { a, score };
    })
    .filter((c) => c.score >= 0)
    .sort((x, y) => y.score - x.score);
  return scored.length ? scored[0].a : null;
}

// Nodes whose output slot 0 is the MODEL — where a model-only LoRA splices in.
const MODEL_PRODUCER_CLASSES = new Set([
  'UNETLoader',
  'CheckpointLoaderSimple',
  'CheckpointLoader',
  'CheckpointLoaderNF4',
  'UnetLoaderGGUF',
  'UNETLoaderGGUF',
]);

/** Splice a model-only LoRA into `graph` (for map generation) with NO JSON editing
 *  by the DM: find the model producer (UNet/checkpoint loader), insert a
 *  `LoraLoaderModelOnly` after it, and rewire every model consumer through it.
 *  Returns false (a clean no-op) when there isn't exactly one clearly-used model
 *  node — so an unusual custom workflow just generates without the LoRA instead of
 *  breaking. Pure (no network): the caller resolves the installed filename first. */
export function injectMapLora(
  graph: Record<string, unknown>,
  loraName: string,
  strength = 1.0,
): boolean {
  const nodes = Object.entries(graph) as [
    string,
    { class_type?: string; inputs?: Record<string, unknown> },
  ][];
  const isModelLink = (v: unknown, id: string) =>
    Array.isArray(v) && v.length === 2 && v[0] === id && v[1] === 0;
  // Model producers whose model output is actually consumed by a `model` input.
  const used = nodes
    .filter(([, n]) => n.class_type && MODEL_PRODUCER_CLASSES.has(n.class_type))
    .filter(([pid]) => nodes.some(([, n]) => n.inputs && isModelLink(n.inputs.model, pid)));
  if (used.length !== 1) return false; // zero or ambiguous → skip safely
  const srcId = used[0][0];
  let loraId = '__map_lora';
  while (graph[loraId]) loraId += '_x';
  // Rewire existing model consumers to the LoRA's output (the LoRA node, added
  // below, keeps the original producer as ITS input).
  for (const [, n] of nodes) {
    if (n.inputs && isModelLink(n.inputs.model, srcId)) n.inputs.model = [loraId, 0];
  }
  graph[loraId] = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: [srcId, 0], lora_name: loraName, strength_model: strength },
  };
  return true;
}

type LoaderIssue = { node: string; nodeClass: string; input: string; requested: string; available: string[] };

/** Rewrite loader filenames in `graph` to match what ComfyUI actually has, so a
 *  preset that says `flux-2-klein-4b` still works when the install is
 *  `flux-2-klein-4b-fp8`. Returns inputs that couldn't be matched (caller surfaces
 *  a clear "not installed; available: …" error instead of a cryptic failure). */
async function resolveLoaderFilenames(
  graph: Record<string, unknown>,
): Promise<{ unresolved: LoaderIssue[] }> {
  const cache = new Map<string, string[]>();
  const unresolved: LoaderIssue[] = [];
  for (const [nodeId, raw] of Object.entries(graph)) {
    const node = raw as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = node.class_type ? LOADER_FILENAME_INPUTS[node.class_type] : undefined;
    if (!inputs || !node.inputs) continue;
    for (const inp of inputs) {
      const cur = node.inputs[inp];
      if (typeof cur !== 'string') continue;
      const key = `${node.class_type}:${inp}`;
      if (!cache.has(key)) cache.set(key, await listLoaderOptions(node.class_type!, inp));
      const available = cache.get(key)!;
      if (!available.length) continue; // can't validate (offline / unknown node) — leave as-is
      const match = bestModelMatch(cur, available);
      if (match && match !== cur) {
        console.warn(`  [comfy] ${key}: '${cur}' → '${match}' (matched installed file)`);
        node.inputs[inp] = match;
      } else if (!match) {
        unresolved.push({ node: nodeId, nodeClass: node.class_type!, input: inp, requested: cur, available });
      }
    }
  }
  return { unresolved };
}

const DEFAULT_NEGATIVE =
  'blurry, low quality, lowres, jpeg artifacts, watermark, signature, text, ' +
  'deformed, extra limbs, bad anatomy, frame, border';

// Battle-map framing. Base diffusion models aren't trained on top-down VTT maps,
// so a bare "ruined temple" prompt yields a scene/illustration. We wrap the DM's
// description in an overhead-map frame (and a negative that rejects the common
// failure modes: characters, perspective, and region/city/world maps). `{prompt}`
// marks where the description lands. Both are overridable from Settings.
export const DEFAULT_MAP_STYLE =
  "top-down bird's-eye-view battle map for a tabletop RPG, seen from straight " +
  'above (orthographic overhead view), of {prompt}; highly detailed terrain and ' +
  'ground textures, walls, furniture and objects clearly readable from above, ' +
  'even consistent lighting, no characters or creatures, no grid lines, no text or labels';

export const DEFAULT_MAP_NEGATIVE =
  'characters, people, creatures, monsters, tokens, perspective, isometric, side ' +
  'view, eye-level, 3d render, photograph, portrait, world map, region map, ' +
  'overland map, city map, hex grid, grid lines, text, labels, legend, compass, ' +
  'watermark, border, frame';

/** Wrap a map description with battle-map framing (configurable via comfyMapStyle;
 *  `{prompt}` marks where the description goes, otherwise the frame is appended). */
export function frameMapPrompt(userPrompt: string, style?: string): string {
  const s = (style ?? '').trim() || DEFAULT_MAP_STYLE;
  return s.includes('{prompt}') ? s.split('{prompt}').join(userPrompt) : `${userPrompt}, ${s}`;
}

/** Build the standard ComfyUI txt2img graph (API format) with the prompt injected. */
function buildGraph(opts: {
  model: string;
  prompt: string;
  negative: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
}): Record<string, unknown> {
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: opts.model } },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: opts.width, height: opts.height, batch_size: 1 },
    },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: opts.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: opts.negative, clip: ['4', 1] } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: opts.seed,
        steps: opts.steps,
        cfg: opts.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'dndvtt', images: ['8', 0] } },
  };
}

/**
 * Build a graph from the DM's custom workflow template (ComfyUI **API format**)
 * by substituting placeholders. String placeholders are JSON-escaped so the
 * result stays valid JSON; numeric ones drop in bare. Returns null on bad JSON
 * (we DON'T fall back to the SD graph — the DM configured this for a reason, and
 * a silent fallback would run the wrong model / fail on a missing checkpoint).
 */
export function applyWorkflowTemplate(
  tmpl: string,
  v: { prompt: string; negative: string; width: number; height: number; seed: number },
): Record<string, unknown> | null {
  const esc = (s: string) => JSON.stringify(s).slice(1, -1); // escape, strip quotes
  const out = tmpl
    .split('%prompt%').join(esc(v.prompt))
    .split('%negative%').join(esc(v.negative))
    .split('%seed%').join(String(v.seed))
    .split('%width%').join(String(v.width))
    .split('%height%').join(String(v.height));
  try {
    const parsed = JSON.parse(out);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch (err) {
    console.warn('  [comfy] custom workflow is not valid JSON after substitution:', (err as Error).message);
  }
  return null;
}

export type ComfyImageOpts = {
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  /** Splice this model-only LoRA into the graph (map generation); skipped if the
   *  file isn't installed or the graph has no clear model node. */
  injectLora?: { name: string; strength?: number };
};

/** Either a saved image path or a human-readable reason it failed (shown to the DM). */
export type ComfyResult = { path: string } | { error: string };

/**
 * Generate one image from `prompt` and save it under uploads. Returns the
 * `/uploads/...` path, or a specific `error` (unreachable, no checkpoint, a
 * filename ComfyUI doesn't have, a rejected workflow, or a timeout).
 */
export async function generateImage(
  prompt: string,
  opts: ComfyImageOpts = {},
): Promise<ComfyResult> {
  const base = config.comfyUrl;
  if (!base) return { error: 'ComfyUI URL is not set in Settings.' };
  if (!prompt.trim()) return { error: 'Empty prompt.' };
  const clientId = randomUUID();
  const cleanPrompt = prompt.trim().slice(0, 2000);
  const negative = (opts.negative ?? DEFAULT_NEGATIVE).slice(0, 2000);
  const width = clampDim(opts.width, 768);
  const height = clampDim(opts.height, 768);
  const seed = Math.floor(Math.random() * 2 ** 31);

  let graph: Record<string, unknown> | null;
  if (config.comfyWorkflow.trim()) {
    // The DM supplied their own workflow (e.g. a Flux / SD3 / Mistral-encoder
    // graph the built-in SD graph can't run) — substitute the prompt into it.
    graph = applyWorkflowTemplate(config.comfyWorkflow, {
      prompt: cleanPrompt,
      negative,
      width,
      height,
      seed,
    });
    if (!graph) return { error: 'Your custom workflow is not valid JSON (after placeholder substitution).' };
  } else {
    // Built-in SD1.5/SDXL txt2img graph. Pick the checkpoint: configured, else
    // the first installed.
    let model = config.comfyModel.trim();
    if (!model) {
      model = (await listComfyModels())[0] ?? '';
      if (!model) return { error: 'No checkpoint is installed in ComfyUI.' };
    }
    graph = buildGraph({
      model,
      prompt: cleanPrompt,
      negative,
      width,
      height,
      steps: Math.min(60, Math.max(8, opts.steps ?? 25)),
      cfg: Math.min(20, Math.max(1, opts.cfg ?? 7)),
      seed,
    });
  }

  // Optional map LoRA — spliced in here (before filename resolution, so the LoRA
  // name is matched too). Fails gracefully: a missing LoRA / unsupported node /
  // odd graph just generates without it, never an error.
  if (opts.injectLora?.name) {
    const loras = await listComfyLoras();
    const match = loras.length ? bestModelMatch(opts.injectLora.name, loras) : null;
    if (!match) {
      console.warn(`  [comfy] map LoRA '${opts.injectLora.name}' not installed — generating without it`);
    } else if (!injectMapLora(graph, match, opts.injectLora.strength ?? 1.0)) {
      console.warn('  [comfy] map LoRA: no single model node to attach to — generating without it');
    }
  }

  // Make loader filenames match what's actually installed (so a preset naming
  // `flux-2-klein-4b` works on a `…-4b-fp8` install); bail with a clear message
  // when a referenced model genuinely isn't there.
  const { unresolved } = await resolveLoaderFilenames(graph);
  if (unresolved.length) {
    const u = unresolved[0];
    return {
      error:
        `ComfyUI has no ${u.input} named "${u.requested}". ` +
        `Installed: ${u.available.join(', ') || '(none)'}. ` +
        `Edit the workflow JSON in Settings to use one of those.`,
    };
  }

  try {
    const queued = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: clientId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!queued.ok) {
      return { error: await describeRejection(queued) };
    }
    const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
    if (!promptId) return { error: 'ComfyUI did not queue the job.' };

    // Poll history until the run produces an image (CPU generation can be slow).
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await sleep(1500);
      const h = await fetch(`${base}/history/${promptId}`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (!h || !h.ok) continue;
      const hist = (await h.json()) as Record<
        string,
        { outputs?: Record<string, { images?: ComfyImageRef[] }>; status?: { status_str?: string } }
      >;
      const entry = hist?.[promptId];
      if (!entry) continue;
      const img = firstImage(entry.outputs);
      if (img) {
        const saved = await saveFromView(base, img);
        return saved ? { path: saved } : { error: 'The generated image could not be retrieved from ComfyUI.' };
      }
      if (entry.status?.status_str === 'error') {
        return { error: 'ComfyUI errored while running the workflow — see its console for details.' };
      }
    }
    return { error: 'ComfyUI generation timed out.' };
  } catch (err) {
    return { error: `Could not reach ComfyUI: ${(err as Error).message}` };
  }
}

/** Turn a non-OK /prompt response into a useful message (ComfyUI puts the real
 *  reason in `node_errors[*].errors[*].details`). */
async function describeRejection(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string }; node_errors?: Record<string, { errors?: { details?: string; message?: string }[] }> }
    | null;
  const parts: string[] = [];
  for (const [nid, ne] of Object.entries(body?.node_errors ?? {})) {
    for (const e of ne.errors ?? []) parts.push(`node ${nid}: ${e.details || e.message}`);
  }
  const detail = parts.join('; ') || body?.error?.message || `ComfyUI returned ${res.status}`;
  console.warn(`  [comfy] /prompt rejected: ${detail}`);
  return `ComfyUI rejected the workflow — ${detail}`;
}

type ComfyImageRef = { filename?: string; subfolder?: string; type?: string };

function firstImage(outputs?: Record<string, { images?: ComfyImageRef[] }>): ComfyImageRef | null {
  for (const node of Object.values(outputs ?? {})) {
    const img = node.images?.find((i) => i.filename);
    if (img) return img;
  }
  return null;
}

/** Fetch the produced image from /view and persist it under uploads. */
async function saveFromView(base: string, img: ComfyImageRef): Promise<string | null> {
  const qs = new URLSearchParams({
    filename: img.filename ?? '',
    subfolder: img.subfolder ?? '',
    type: img.type ?? 'output',
  });
  const r = await fetch(`${base}/view?${qs}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > 30 * 1024 * 1024) return null;
  const ext = path.extname(img.filename ?? '').toLowerCase() || '.png';
  const filename = `comfy-${randomUUID()}${ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

const clampDim = (v: number | undefined, fallback: number): number => {
  const n = Math.round(v ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  // Snap to a multiple of 8 (latent grid), bounded to sane SD sizes.
  return Math.min(1536, Math.max(256, Math.round(n / 8) * 8));
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
