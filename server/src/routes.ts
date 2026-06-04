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
