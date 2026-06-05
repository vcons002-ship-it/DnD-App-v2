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

  // SRD creature search (offline) for the monster autofill box.
  router.get('/creatures', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: searchSrd(q), aiAvailable: geminiEnabled() });
  });

  // Full creature lookup: exact SRD match, else Gemini (if a key is set).
  router.post('/creatures/lookup', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name required' });
    const srd = getSrd(name);
    if (srd) return res.json(srd);
    const ai = await lookupCreatureAI(name);
    if (ai) return res.json(ai);
    return res.status(404).json({ error: 'Not found in SRD; AI unavailable.' });
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
