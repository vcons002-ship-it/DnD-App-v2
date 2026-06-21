import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${newId()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype.startsWith('image/')),
});

// Rulebook PDF upload: kept in memory so we can parse it, not stored as a file.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)),
});

export function createApiRouter(io: IOServer): Router {
  const router = Router();

  // Create a new session; returns the shareable DM + player links. An optional
  // `code` lets the DM pick a memorable, stable link (e.g. "TAVERN").
  router.post('/sessions', (req, res) => {
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

  // Saved-session directory for the DM resume screen.
  router.get('/sessions', (_req, res) => {
    res.json(listSessions());
  });

  // Edit a saved session from the DM landing page: rename and/or change its join
  // code. Data is keyed by session id, so changing the code preserves everything
  // (only links to the previous code stop working). Gated by the DM passphrase
  // when one is configured, like the other DM-only mutations.
  router.patch('/sessions/:code', (req, res) => {
    if (config.dmPassphrase && req.body?.dmPassphrase !== config.dmPassphrase) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
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
    if (config.dmPassphrase && req.body?.dmPassphrase !== config.dmPassphrase) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    deleteSession(session.id);
    res.json({ ok: true });
  });

  // ---- DM-editable runtime settings (API key / model) ----
  // The raw key is never returned — only whether one is set.
  router.get('/settings', (_req, res) => {
    res.json(publicSettings());
  });

  router.post('/settings', (req, res) => {
    // Gate behind the DM passphrase when one is configured (matches the DM join
    // gate); otherwise this is a local-trust action like the rest of the app.
    if (
      config.dmPassphrase &&
      req.body?.dmPassphrase !== config.dmPassphrase
    ) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
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
      if (negative === undefined) negative = DEFAULT_MAP_NEGATIVE;
    }
    const result = await generateImage(finalPrompt, {
      width,
      height,
      negative,
      ...(isMap && config.comfyMapLora.trim()
        ? { injectLora: { name: config.comfyMapLora.trim() } }
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
    if (config.dmPassphrase && req.headers['x-dm-passphrase'] !== config.dmPassphrase) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
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
    if (config.dmPassphrase && req.headers['x-dm-passphrase'] !== config.dmPassphrase) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
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
  router.post('/spells/lookup', async (req, res) => {
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
    deleteLibraryItem(req.params.id);
    res.status(204).end();
  });

  // AI-generate one item from a free-text prompt and RETURN it (not saved). The
  // caller drops it into an inventory/container; saving to the library is a
  // separate, explicit choice. Key-gated: 503 when no key / generation failed.
  router.post('/items/generate', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    const item = await generateItemAI(prompt);
    if (!item) return res.status(503).json({ error: 'AI unavailable' });
    res.status(201).json(item);
  });

  // AI-fill a shop popup from a description → a list of priced items dropped into
  // the decal shop editor (NOT auto-saved). Key-gated: 503 when unavailable.
  router.post('/shops/generate', async (req, res) => {
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
    if (config.dmPassphrase && req.body?.dmPassphrase !== config.dmPassphrase) {
      return res.status(403).json({ error: 'Incorrect DM passphrase' });
    }
    const session = getSessionByCode(req.params.code);
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
