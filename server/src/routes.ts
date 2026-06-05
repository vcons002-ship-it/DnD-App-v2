import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { config } from './config.js';
import { newId } from './db.js';
import {
  createMap,
  createSession,
  getSessionByCode,
  listMaps,
  listSessions,
} from './sessions.js';
import { broadcastSnapshots, type IOServer } from './connections.js';
import { publicUrl } from './tunnel.js';
import { searchSrd, getSrd } from './creatures/srd.js';
import { geminiEnabled, lookupCreatureAI } from './creatures/gemini.js';
import { publicSettings, updateSettings } from './settings.js';
import {
  deleteLibraryCreature,
  deleteLibraryItem,
  getLibraryCreature,
  listLibraryItems,
  saveLibraryCreature,
  saveLibraryItem,
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

export function createApiRouter(io: IOServer): Router {
  const router = Router();

  // Create a new session; returns the shareable DM + player links.
  router.post('/sessions', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const session = createSession(name);
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
    const patch: { geminiApiKey?: string; geminiModel?: string } = {};
    if (typeof req.body?.geminiApiKey === 'string')
      patch.geminiApiKey = req.body.geminiApiKey;
    if (typeof req.body?.geminiModel === 'string')
      patch.geminiModel = req.body.geminiModel;
    res.json(updateSettings(patch));
  });

  // Creature search for the autofill box: SRD + the cross-session library.
  // Library hits surface homebrew/AI creatures without ever calling Gemini.
  router.get('/creatures', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const lib = searchLibraryCreatures(q);
    const libNames = new Set(lib.map((c) => c.name.toLowerCase()));
    const srd = searchSrd(q).filter((c) => !libNames.has(c.name.toLowerCase()));
    res.json({ results: [...lib, ...srd], aiAvailable: geminiEnabled() });
  });

  // Full creature lookup: exact SRD match, then library, then Gemini.
  router.post('/creatures/lookup', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const srd = getSrd(name);
    if (srd) return res.json(srd);
    const lib = getLibraryCreature(name);
    if (lib) return res.json(lib);
    const ai = await lookupCreatureAI(name);
    if (ai) return res.json(ai);
    return res.status(404).json({ error: 'Not found in SRD; AI unavailable.' });
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

  router.post('/library/items', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(saveLibraryItem({ ...req.body, name }));
  });

  router.delete('/library/items/:id', (req, res) => {
    deleteLibraryItem(req.params.id);
    res.status(204).end();
  });

  // DM uploads a custom token icon image; returns its served path.
  router.post('/icons', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'image required' });
    res.status(201).json({ icon: `/uploads/${req.file.filename}` });
  });

  // Lightweight existence check used by the join screen.
  router.get('/sessions/:code', (req, res) => {
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ code: session.code, name: session.name });
  });

  // DM uploads a map image (multipart) OR links a Google Slides URL.
  router.post('/sessions/:code/maps', upload.single('image'), (req, res) => {
    const session = getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const name =
      (typeof req.body?.name === 'string' && req.body.name.trim()) ||
      `Map ${listMaps(session.id).length + 1}`;
    const slidesUrl =
      typeof req.body?.slidesUrl === 'string' && req.body.slidesUrl.trim()
        ? req.body.slidesUrl.trim()
        : null;

    if (!req.file && !slidesUrl) {
      return res.status(400).json({ error: 'Provide an image file or slidesUrl' });
    }

    const map = createMap(session.id, {
      name,
      imagePath: req.file ? `/uploads/${req.file.filename}` : null,
      slidesUrl,
    });

    // Reflect the new map to connected DM client(s) without touching players.
    broadcastSnapshots(io, session.id);
    res.status(201).json(map);
  });

  return router;
}
