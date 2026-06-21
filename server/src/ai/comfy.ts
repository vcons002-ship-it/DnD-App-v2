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

/** List installed checkpoints (CheckpointLoaderSimple → ckpt_name options). */
export async function listComfyModels(): Promise<string[]> {
  if (!config.comfyUrl) return [];
  try {
    const r = await fetch(`${config.comfyUrl}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as Record<string, unknown>;
    // Shape: { CheckpointLoaderSimple: { input: { required: { ckpt_name: [[names...]] } } } }
    const info = data?.CheckpointLoaderSimple as
      | { input?: { required?: { ckpt_name?: [string[]] } } }
      | undefined;
    const names = info?.input?.required?.ckpt_name?.[0];
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

const DEFAULT_NEGATIVE =
  'blurry, low quality, lowres, jpeg artifacts, watermark, signature, text, ' +
  'deformed, extra limbs, bad anatomy, frame, border';

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
};

/**
 * Generate one image from `prompt` and save it under uploads. Returns the
 * `/uploads/...` path, or null if ComfyUI is unreachable / no checkpoint is
 * installed / generation failed or timed out.
 */
export async function generateImage(
  prompt: string,
  opts: ComfyImageOpts = {},
): Promise<string | null> {
  const base = config.comfyUrl;
  if (!base || !prompt.trim()) return null;
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
    if (!graph) return null;
  } else {
    // Built-in SD1.5/SDXL txt2img graph. Pick the checkpoint: configured, else
    // the first installed.
    let model = config.comfyModel.trim();
    if (!model) {
      model = (await listComfyModels())[0] ?? '';
      if (!model) {
        console.warn('  [comfy] no checkpoint installed — cannot generate');
        return null;
      }
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

  try {
    const queued = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: clientId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!queued.ok) {
      console.warn(`  [comfy] /prompt returned ${queued.status}: ${await queued.text().catch(() => '')}`);
      return null;
    }
    const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
    if (!promptId) return null;

    // Poll history until the run produces an image (CPU generation can be slow).
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await sleep(1500);
      const h = await fetch(`${base}/history/${promptId}`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (!h || !h.ok) continue;
      const hist = (await h.json()) as Record<string, { outputs?: Record<string, { images?: ComfyImageRef[] }> }>;
      const entry = hist?.[promptId];
      if (!entry) continue;
      const img = firstImage(entry.outputs);
      if (img) return await saveFromView(base, img);
    }
    console.warn('  [comfy] generation timed out');
    return null;
  } catch (err) {
    console.warn('  [comfy] generation failed:', (err as Error).message);
    return null;
  }
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
