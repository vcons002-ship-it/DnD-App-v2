import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { newId } from './db.js';
import {
  changeSessionCode,
  createMap,
  createSession,
  deleteSession,
  getSessionByCode,
  listMaps,
  listMapsForImport,
  listSessions,
  normalizeSessionCode,
  renameSession,
  SessionCodeError,
} from './sessions.js';
import { broadcastSnapshots, type IOServer } from './connections.js';
import { publicUrl } from './tunnel.js';
import { searchSrd, getSrd } from './creatures/srd.js';
import {
  lookupCreatureAI,
  generateItemAI,
  generateShopItemsAI,
  geminiEnabled,
} from './creatures/gemini.js';
import { aiAvailable, listOllamaModels } from './ai/gateway.js';
import {
  refreshComfy,
  listComfyModels,
  listComfyLoras,
  generateImage,
  frameMapPrompt,
  DEFAULT_MAP_NEGATIVE,
} from './ai/comfy.js';
import { searchSpells, getSpell, getAllSpells } from './spells/srd.js';
import { searchFeatures, getFeature } from './features/srd.js';
import { lookupSpellAI } from './spells/gemini.js';
import { searchMasteries, getMastery } from './masteries/srd.js';
import { searchManeuvers, getManeuver } from './maneuvers/srd.js';
import { searchWeapons } from './weapons/srd.js';
import { searchNaturalAttacks } from './attacks/natural.js';
import { publicSettings, updateSettings } from './settings.js';
import { exportSession, importSession, type SessionBundle } from './backup.js';
import { rulebookInfo, setRulebookFromPdf, clearRulebook } from './assistant/index.js';
import { getRulebookChunks } from './assistant/rulebook.js';
import {
  deleteLibraryCharacter,
  deleteLibraryCreature,
  deleteLibraryItem,
  getLibraryCreature,
  getLibraryItemByName,
  listLibraryItems,
  saveLibraryCharacter,
  saveLibraryCreature,
  saveLibraryItem,
  searchLibraryCharacters,
  searchLibraryCreatures,
} from './library.js';

// Only these raster extensions are ever written to /uploads. Critically this
// EXCLUDES .svg/.html — an uploaded SVG/HTML with embedded script would be
// served same-origin by express.static and execute in the app's origin
// (stored XSS). The stored filename is a fresh UUID + a whitelisted extension,
// so the client-supplied name can't smuggle one either.
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.jpe') ext = '.jpg';
    if (!ALLOWED_IMAGE_EXT.has(ext)) ext = '.png';
    cb(null, `${newId()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Both the declared mime AND the extension must be a known raster type.
    cb(null, ALLOWED_IMAGE_MIME.has(file.mimetype) && ALLOWED_IMAGE_EXT.has(ext));
  },
});

/** True if `ip` is loopback / private / link-local (incl. the cloud metadata
 *  address 169.254.169.254) — anything an SSRF should never be allowed to reach. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped IPv6
  return mapped ? isPrivateIp(mapped[1]) : false;
}

/** Resolve a hostname and reject if it (or any A/AAAA record) is private —
 *  blocks SSRF to internal services / cloud metadata via the URL fetcher. */
async function hostIsBlocked(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIP(h)) return isPrivateIp(h);
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // unresolvable → don't fetch
  }
}

/** Verify the DM secret on a REST request (header OR body field). Returns true
 *  when authorized; otherwise writes a 403 and returns false. The secret is
 *  mandatory (config.dmPassphrase is always set), so this always enforces. */
function requireDm(req: Request, res: Response): boolean {
  const supplied =
    (typeof req.headers['x-dm-passphrase'] === 'string'
      ? (req.headers['x-dm-passphrase'] as string)
      : undefined) ??
    (typeof req.body?.dmPassphrase === 'string' ? req.body.dmPassphrase : undefined);
  if (supplied === config.dmPassphrase) return true;
  res.status(403).json({ error: 'DM secret required.' });
  return false;
}

/** Tiny in-memory fixed-window rate limiter (per client IP + key). Guards the
 *  ungated, resource-spending endpoints (local image gen, remote image fetch)
 *  from runaway loops without pulling in a dependency. Returns true when the
 *  request should be rejected (and writes a 429). */
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(req: Request, res: Response, key: string, max: number, windowMs: number): boolean {
  const id = `${key}:${req.ip ?? 'unknown'}`;
  const now = Date.now();
  const b = rlBuckets.get(id);
  if (!b || now >= b.resetAt) {
    rlBuckets.set(id, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (b.count >= max) {
    res.status(429).json({ error: 'Too many requests — slow down a moment.' });
    return true;
  }
  b.count++;
  return false;
}

// Rulebook PDF upload: kept in memory so we can parse it, not stored as a file.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)),
});

// Session-backup upload: a (potentially large, base64-image-laden) JSON bundle
// held in memory just long enough to parse + import.
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

export function createApiRouter(io: IOServer): Router {
  const router = Router();

  // Create a new session; returns the shareable DM + player links. An optional
  // `code` lets the DM pick a memorable, stable link (e.g. "TAVERN").
  router.post('/sessions', (req, res) => {
    if (!requireDm(req, res)) return; // only the DM creates sessions
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const code = typeof req.body?.code === 'string' ? req.body.code : undefined;
    let session;
    try {
      session = createSession(name, code);
    } catch (err) {
      if (err instanceof SessionCodeError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
    const base = publicUrl();
    res.json({
      code: session.code,
      dmUrl: `${base}/dm?code=${session.code}`,
      playerUrl: `${base}/join?code=${session.code}`,
    });
  });

  // Saved-session directory for the DM resume screen. DM-only: this lists EVERY
  // session's join code, so leaving it open let anyone enumerate all campaigns
  // (the "code is the gate" model depended on codes staying secret). Players no
  // longer use this — they join by shared link/code, not by browsing the list.
  router.get('/sessions', (req, res) => {
    if (!requireDm(req, res)) return;
    res.json(listSessions());
  });

  // Edit a saved session from the DM landing page: rename and/or change its join
  // code. Data is keyed by session id, so changing the code preserves everything
  // (only links to the previous code stop working). Gated by the DM passphrase
  // when one is configured, like the other DM-only mutations.
  router.patch('/sessions/:code', (req, res) => {
    if (!requireDm(req, res)) return;
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const newCode = typeof req.body?.code === 'string' ? req.body.code : undefined;
    try {
      if (name !== undefined && name.trim()) renameSession(session.id, name);
      let code = session.code;
      if (newCode !== undefined && normalizeSessionCode(newCode) !== session.code) {
        code = changeSessionCode(session.id, newCode);
      }
      return res.json({ code });
    } catch (err) {
      if (err instanceof SessionCodeError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  // Preview another session's maps (with token counts) for the import picker.
  router.get('/sessions/:code/maps', (req, res) => {
    res.json(listMapsForImport(req.params.code));
  });

  // Delete a saved session and all of its data (cascade). Gated by the DM
  // passphrase when configured.
  router.delete('/sessions/:code', (req, res) => {
    if (!requireDm(req, res)) return;
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    deleteSession(session.id);
    res.json({ ok: true });
  });

  // ---- Backup & restore ----
  // Download a self-contained JSON backup of one session (rows + inlined images).
  router.get('/sessions/:code/export', (req, res) => {
    if (!requireDm(req, res)) return;
    const bundle = exportSession(req.params.code);
    if (!bundle) return res.status(404).json({ error: 'Session not found.' });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="session-${req.params.code}.json"`,
    );
    res.json(bundle);
  });

  // Restore a backup as a NEW session (never overwrites an existing one). An
  // optional `code` field picks the new join code; otherwise one is generated.
  router.post('/sessions/import', backupUpload.single('file'), (req, res) => {
    if (!requireDm(req, res)) return;
    const file = (req as { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No backup file uploaded.' });
    let bundle: SessionBundle;
    try {
      bundle = JSON.parse(file.buffer.toString('utf8')) as SessionBundle;
    } catch {
      return res.status(400).json({ error: 'That file is not valid JSON.' });
    }
    const code = typeof req.body?.code === 'string' ? req.body.code : undefined;
    try {
      const result = importSession(bundle, code); // a brand-new session; nobody's connected
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof SessionCodeError) {
        return res.status(409).json({ error: err.message });
      }
      return res.status(422).json({
        error: `Could not import that backup: ${(err as Error).message}`,
      });
    }
  });

  // ---- DM-editable runtime settings (API key / model) ----
  // The raw key is never returned — only whether one is set.
  router.get('/settings', (_req, res) => {
    res.json(publicSettings());
  });

  router.post('/settings', (req, res) => {
    // DM-only: writes the Gemini key and the Ollama/Comfy URLs (server-side
    // fetched → an unauthenticated write is both key-tampering and SSRF).
    if (!requireDm(req, res)) return;
    const patch: {
      geminiApiKey?: string;
      geminiModel?: string;
      ollamaUrl?: string;
      ollamaModel?: string;
      aiMode?: 'gemini' | 'local';
      comfyUrl?: string;
      comfyModel?: string;
      comfyWorkflow?: string;
      comfyMapStyle?: string;
      comfyMapLora?: string;
      comfyMapLoraTrigger?: string;
      comfyMapLoraStrength?: number;
      comfyMapLoraNode?: string;
    } = {};
    if (typeof req.body?.geminiApiKey === 'string')
      patch.geminiApiKey = req.body.geminiApiKey;
    if (typeof req.body?.geminiModel === 'string')
      patch.geminiModel = req.body.geminiModel;
    if (typeof req.body?.ollamaUrl === 'string') patch.ollamaUrl = req.body.ollamaUrl;
    if (typeof req.body?.ollamaModel === 'string')
      patch.ollamaModel = req.body.ollamaModel;
    if (req.body?.aiMode === 'gemini' || req.body?.aiMode === 'local')
      patch.aiMode = req.body.aiMode;
    if (typeof req.body?.comfyUrl === 'string') patch.comfyUrl = req.body.comfyUrl;
    if (typeof req.body?.comfyModel === 'string') patch.comfyModel = req.body.comfyModel;
    if (typeof req.body?.comfyWorkflow === 'string') patch.comfyWorkflow = req.body.comfyWorkflow;
    if (typeof req.body?.comfyMapStyle === 'string') patch.comfyMapStyle = req.body.comfyMapStyle;
    if (typeof req.body?.comfyMapLora === 'string') patch.comfyMapLora = req.body.comfyMapLora;
    if (typeof req.body?.comfyMapLoraTrigger === 'string')
      patch.comfyMapLoraTrigger = req.body.comfyMapLoraTrigger;
    if (typeof req.body?.comfyMapLoraStrength === 'number')
      patch.comfyMapLoraStrength = req.body.comfyMapLoraStrength;
    if (typeof req.body?.comfyMapLoraNode === 'string')
      patch.comfyMapLoraNode = req.body.comfyMapLoraNode;
    res.json(updateSettings(patch));
  });

  // Available AI backends for the chat's quick model dropdown: locally-pulled
  // Ollama models + whether Gemini is usable, plus the configured defaults.
  router.get('/ai/models', async (_req, res) => {
    res.json({
      ollamaModels: await listOllamaModels(),
      defaultOllamaModel: config.ollamaModel,
      geminiAvailable: geminiEnabled(),
      aiMode: config.aiMode,
    });
  });

  // ---- Local ComfyUI image generation (token art, maps, decals) ----
  // Status + installed checkpoints, so the UI shows the generate controls only
  // when a local ComfyUI is actually reachable.
  router.get('/comfy/status', async (_req, res) => {
    const reachable = await refreshComfy();
    res.json({
      reachable,
      models: reachable ? await listComfyModels() : [],
      loras: reachable ? await listComfyLoras() : [],
      defaultModel: config.comfyModel,
      url: config.comfyUrl,
      usingWorkflow: !!config.comfyWorkflow.trim(),
    });
  });

  // Generate one image from a prompt and return its saved /uploads path. `kind`
  // picks sensible dimensions (token/decal square, map landscape); width/height
  // override it. 503 when ComfyUI is unreachable / generation failed.
  router.post('/comfy/generate', async (req, res) => {
    // Player-usable (token art), so not DM-gated — but rate-limited so a loop
    // can't hammer the local GPU. ComfyUI is local, so no cloud cost.
    if (rateLimited(req, res, 'comfy', 12, 60_000)) return;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    const kind = req.body?.kind;
    const isMap = kind === 'map';
    const dims = isMap
      ? { width: 1216, height: 832 }
      : { width: 768, height: 768 }; // token / decal / default
    const width = Number(req.body?.width) || dims.width;
    const height = Number(req.body?.height) || dims.height;
    let negative = typeof req.body?.negative === 'string' ? req.body.negative : undefined;
    // Maps need overhead framing (base models render a scene otherwise) + a
    // negative that rejects characters / perspective / region-or-city maps.
    let finalPrompt = prompt;
    if (isMap) {
      finalPrompt = frameMapPrompt(prompt, config.comfyMapStyle);
      // Auto-prepend the map LoRA's trigger word (set once in Settings) so the DM
      // never has to type it. Harmless if the LoRA isn't actually installed.
      const trigger = config.comfyMapLora.trim() ? config.comfyMapLoraTrigger.trim() : '';
      if (trigger) finalPrompt = `${trigger}, ${finalPrompt}`;
      if (negative === undefined) negative = DEFAULT_MAP_NEGATIVE;
    }
    const result = await generateImage(finalPrompt, {
      width,
      height,
      negative,
      ...(isMap && config.comfyMapLora.trim()
        ? {
            injectLora: {
              name: config.comfyMapLora.trim(),
              strength: config.comfyMapLoraStrength,
              node: config.comfyMapLoraNode.trim() || undefined,
            },
          }
        : {}),
    });
    if ('error' in result) return res.status(503).json({ error: result.error });
    res.status(201).json({ path: result.path });
  });

  // ---- Rules-assistant rulebook PDF (DM-only grounding override) ----
  // The uploaded book is parsed into searchable chunks and takes precedence over
  // the bundled SRD digest when the assistant answers.
  router.get('/rulebook', (_req, res) => {
    res.json(rulebookInfo());
  });

  // Full chunk text for the toolbar reader/search (DM backup reference).
  router.get('/rulebook/content', (_req, res) => {
    res.json(getRulebookChunks());
  });

  router.post('/rulebook', pdfUpload.single('pdf'), async (req, res) => {
    if (!requireDm(req, res)) return;
    const file = (req as { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No PDF uploaded' });
    const info = await setRulebookFromPdf(file.buffer, file.originalname);
    if (!info)
      return res
        .status(422)
        .json({ error: 'Could not extract text from that PDF (is it a scanned image?)' });
    res.json(info);
  });

  router.delete('/rulebook', (req, res) => {
    if (!requireDm(req, res)) return;
    clearRulebook();
    res.json({ ok: true });
  });

  // Creature search for the autofill box: SRD + the cross-session library.
  // Library hits surface homebrew/AI creatures without ever calling Gemini.
  router.get('/creatures', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const lib = searchLibraryCreatures(q);
    const libNames = new Set(lib.map((c) => c.name.toLowerCase()));
    const srd = searchSrd(q).filter((c) => !libNames.has(c.name.toLowerCase()));
    res.json({ results: [...lib, ...srd], aiAvailable: aiAvailable() });
  });

  // Full creature lookup: library first (a DM's saved/edited copy is
  // authoritative and shadows the SRD, matching search), then SRD, then Gemini.
  router.post('/creatures/lookup', async (req, res) => {
    if (!requireDm(req, res)) return; // DM autofill tool; may spend the Gemini key
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const lib = getLibraryCreature(name);
    if (lib) return res.json(lib);
    const srd = getSrd(name);
    if (srd) return res.json(srd);
    const ai = await lookupCreatureAI(name);
    if (ai) return res.json(ai);
    return res.status(404).json({ error: 'Not found in SRD; AI unavailable.' });
  });

  // Canonical 2024 weapons for the weapon editor's "from book" picker.
  router.get('/weapons', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: searchWeapons(q) });
  });

  // Common creature natural attacks (Bite, Claw…) for the creature attack picker.
  router.get('/attacks', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: searchNaturalAttacks(q) });
  });

  // Spell/ability/mastery search for the character-sheet "add" menu: local lists
  // first (no network), with AI available as a fallback for anything missing.
  router.get('/spells', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({
      results: [
        ...searchSpells(q),
        ...searchFeatures(q),
        ...searchMasteries(q),
        ...searchManeuvers(q),
      ],
      aiAvailable: aiAvailable(),
    });
  });

  // The full spell list for the Spellbook browser (class filter + keyword search
  // happen client-side over this). Spells only — masteries/maneuvers have their
  // own pickers.
  router.get('/spells/all', (_req, res) => {
    res.json({ results: getAllSpells() });
  });

  // Battle Master maneuvers for the character-sheet "add" picker.
  router.get('/maneuvers', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: searchManeuvers(q, 50) });
  });

  // Full lookup: local spells, then masteries, then maneuvers, then Gemini (spells only).
  // Player-reachable (managing their own spells), so NOT DM-gated — but the AI
  // fallback spends the Gemini key, so cap the request rate per client to stop a
  // miss-loop from draining the quota.
  router.post('/spells/lookup', async (req, res) => {
    if (rateLimited(req, res, 'spell-ai', 30, 60_000)) return;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const spell = getSpell(name);
    if (spell) return res.json({ ...spell, source: 'srd' });
    const feature = getFeature(name);
    if (feature) return res.json({ ...feature, source: 'srd' });
    const mastery = getMastery(name);
    if (mastery) return res.json({ ...mastery, source: 'srd' });
    const maneuver = getManeuver(name);
    if (maneuver) return res.json({ ...maneuver, source: 'srd' });
    const ai = await lookupSpellAI(name);
    if (ai) return res.json(ai);
    return res.status(404).json({ error: 'Not found locally; AI unavailable.' });
  });

  // Batch, LOCAL-ONLY resolution (no AI) of names → structured rollable entries.
  // Used by the sheet import to turn parsed spell/mastery NAMES into proper
  // rollable abilities for everything in the local DB. Returns a name→entry map.
  router.post('/spells/resolve', (req, res) => {
    const names: string[] = Array.isArray(req.body?.names)
      ? req.body.names.filter((n: unknown) => typeof n === 'string').slice(0, 200)
      : [];
    const resolved: Record<string, unknown> = {};
    for (const name of names) {
      const key = name.trim().toLowerCase();
      if (key in resolved) continue;
      const hit = getSpell(name) ?? getFeature(name) ?? getMastery(name) ?? getManeuver(name);
      if (hit) resolved[key] = { ...hit, source: 'srd' };
    }
    res.json({ resolved });
  });

  // ---- Cross-session library (DM-curated creatures + items) ----
  router.get('/library/creatures', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(searchLibraryCreatures(q, 50));
  });

  router.post('/library/creatures', (req, res) => {
    if (!requireDm(req, res)) return; // creature curation is a DM action
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const overwrite = req.query.overwrite === 'true';
    const result = saveLibraryCreature({ ...req.body, name }, overwrite);
    if ('conflict' in result) {
      // 409: an entry with this name already exists; return it for the dialog.
      return res.status(409).json({ existing: result.conflict });
    }
    res.status(201).json(result.saved);
  });

  router.delete('/library/creatures/:name', (req, res) => {
    if (!requireDm(req, res)) return; // deletes wipe a cross-campaign resource
    deleteLibraryCreature(req.params.name);
    res.status(204).end();
  });

  router.get('/library/items', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(listLibraryItems(q));
  });

  // Manual save to the item library (custom OR AI-generated items go through the
  // same explicit path). A same-named entry yields 409 + the existing item so the
  // client can prompt rename/overwrite, mirroring the creature/character flow.
  router.post('/library/items', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const overwrite = req.query.overwrite === 'true';
    if (!overwrite) {
      const existing = getLibraryItemByName(name);
      if (existing) return res.status(409).json({ existing });
    }
    res.status(201).json(saveLibraryItem({ ...req.body, name }));
  });

  router.delete('/library/items/:id', (req, res) => {
    if (!requireDm(req, res)) return; // deletes wipe a cross-campaign resource
    deleteLibraryItem(req.params.id);
    res.status(204).end();
  });

  // AI-generate one item from a free-text prompt and RETURN it (not saved). The
  // caller drops it into an inventory/container; saving to the library is a
  // separate, explicit choice. Key-gated: 503 when no key / generation failed.
  router.post('/items/generate', async (req, res) => {
    if (!requireDm(req, res)) return; // DM loot authoring; spends the Gemini key
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    const item = await generateItemAI(prompt);
    if (!item) return res.status(503).json({ error: 'AI unavailable' });
    res.status(201).json(item);
  });

  // AI-fill a shop popup from a description → a list of priced items dropped into
  // the decal shop editor (NOT auto-saved). Key-gated: 503 when unavailable.
  router.post('/shops/generate', async (req, res) => {
    if (!requireDm(req, res)) return; // DM shop authoring; spends the Gemini key
    const description = typeof req.body?.description === 'string' ? req.body.description : '';
    if (!description.trim()) return res.status(400).json({ error: 'description required' });
    const items = await generateShopItemsAI(description);
    if (!items) return res.status(503).json({ error: 'AI unavailable' });
    res.status(201).json({ items });
  });

  // Cross-session character library (players + DM save/load full sheets).
  router.get('/library/characters', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(searchLibraryCharacters(q, 50));
  });

  router.post('/library/characters', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const overwrite = req.query.overwrite === 'true';
    const result = saveLibraryCharacter({ ...req.body, name }, overwrite);
    if ('conflict' in result) {
      return res.status(409).json({ existing: result.conflict });
    }
    res.status(201).json(result.saved);
  });

  router.delete('/library/characters/:name', (req, res) => {
    deleteLibraryCharacter(req.params.name);
    res.status(204).end();
  });

  // DM uploads a custom token icon image; returns its served path.
  router.post('/icons', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'image required' });
    res.status(201).json({ icon: `/uploads/${req.file.filename}` });
  });

  // Fetch a remote image into uploads (paste of an <img> copied from a web
  // page / Google Slides puts only its URL on the clipboard, not pixel data).
  // http(s) only, image/* only, size-capped — same limits as direct uploads.
  router.post('/icons/from-url', async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'invalid url' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'http(s) urls only' });
    }
    if (rateLimited(req, res, 'from-url', 30, 60_000)) return;
    // SSRF guard: never let this fetch loopback / private / link-local hosts
    // (e.g. 169.254.169.254 cloud metadata, or an internal service on the VM).
    if (await hostIsBlocked(parsed.hostname)) {
      return res.status(400).json({ error: 'that url is not allowed' });
    }
    try {
      const r = await fetch(parsed, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          // Some image CDNs (googleusercontent included) refuse requests
          // without a browser-ish UA.
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
        },
      });
      const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!r.ok) {
        console.warn(`[icons/from-url] ${parsed.hostname} returned ${r.status}`);
        const why =
          r.status === 401 || r.status === 403
            ? `source returned ${r.status} — the image likely requires a login`
            : `source returned ${r.status}`;
        return res.status(422).json({ error: why });
      }
      if (!type.startsWith('image/')) {
        return res
          .status(422)
          .json({ error: `source sent ${type || 'no content-type'}, not an image` });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'image too large' });
      }
      const ext = `.${(type.split('/')[1] || 'png').split(/[;+]/)[0]}`;
      const filename = `${newId()}${ext}`;
      fs.writeFileSync(path.join(config.uploadsDir, filename), buf);
      res.status(201).json({ icon: `/uploads/${filename}` });
    } catch (err) {
      console.warn(`[icons/from-url] fetch failed for ${parsed.hostname}:`, err);
      res.status(422).json({ error: 'could not reach that url' });
    }
  });

  // Lightweight existence check used by the join screen.
  router.get('/sessions/:code', (req, res) => {
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ code: session.code, name: session.name });
  });

  // DM uploads a map image (multipart) OR links a Google Slides URL. Gated by
  // the DM passphrase when one is configured (this is the one REST route that
  // mutates live session state — every socket-side map mutation is DM-gated).
  router.post('/sessions/:code/maps', upload.single('image'), (req, res) => {
    if (!requireDm(req, res)) return;
    const session = getSessionByCode(String(req.params.code));
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const name =
      (typeof req.body?.name === 'string' && req.body.name.trim()) ||
      `Map ${listMaps(session.id).length + 1}`;
    const slidesUrl =
      typeof req.body?.slidesUrl === 'string' && req.body.slidesUrl.trim()
        ? req.body.slidesUrl.trim()
        : null;
    // An already-saved uploads image (e.g. a ComfyUI-generated map). Validate the
    // shape AND that the file exists, so the body can't point at an arbitrary path.
    const rawPath = typeof req.body?.imagePath === 'string' ? req.body.imagePath.trim() : '';
    const existingPath =
      /^\/uploads\/[\w.-]+$/.test(rawPath) &&
      fs.existsSync(path.join(config.uploadsDir, path.basename(rawPath)))
        ? rawPath
        : null;

    if (!req.file && !slidesUrl && !existingPath) {
      return res.status(400).json({ error: 'Provide an image file, slidesUrl, or imagePath' });
    }

    const map = createMap(session.id, {
      name,
      imagePath: req.file ? `/uploads/${req.file.filename}` : existingPath,
      slidesUrl,
    });

    // Reflect the new map to connected DM client(s) without touching players.
    broadcastSnapshots(io, session.id);
    res.status(201).json(map);
  });

  return router;
}
