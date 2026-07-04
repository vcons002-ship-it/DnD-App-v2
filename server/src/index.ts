import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { config } from './config.js';
import { loadSettings } from './settings.js';
import { refreshOllama } from './ai/ollama.js';
import { seedLibraryItems } from './library.js';
import { createApiRouter } from './routes.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { startBackupScheduler } from './backupScheduler.js';
import { startTunnel, publicUrl } from './tunnel.js';
import type { IOServer } from './connections.js';

// Last-resort crash guards. Socket handlers already run inside a per-event
// try/catch (see socketHandlers.ts) and async routes catch internally, but a
// stray rejection in a background probe or a future code path should log and
// keep the server (and the live session) up rather than exit the process.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

loadSettings(); // apply any DM-saved API key / model overrides on top of env
// Probe the local Ollama server in the background so the UI's "AI available"
// signal is accurate without blocking boot (re-probed on each settings save).
void refreshOllama().then((up) => up && console.log('  Local Ollama reachable for AI.'));
const seeded = seedLibraryItems(); // one-time fill of the cross-session item library
if (seeded) console.log(`  Seeded ${seeded} SRD items into the item library.`);
startBackupScheduler(); // periodic on-disk backups of every session (default: bi-weekly)

const app = express();
app.set('trust proxy', true); // we sit behind the Cloudflare Tunnel
app.use(express.json());

const server = http.createServer(app);
const io: IOServer = new Server(server, {
  // Behind a tunnel the Origin varies; the session code is the real gate.
  cors: { origin: true, credentials: true },
});

app.use('/uploads', express.static(config.uploadsDir));
app.use('/api', createApiRouter(io));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve the built client (SPA) in production; Vite handles dev separately.
// Caching matters here: Vite emits content-HASHED asset filenames (safe to
// cache forever), but `index.html` references those hashes and MUST be
// revalidated every load — otherwise a phone keeps loading yesterday's bundle
// after the host rebuilds, and new features silently never appear on that
// device. So: immutable for /assets, no-cache for the HTML shell.
if (fs.existsSync(config.clientDist)) {
  app.use(
    express.static(config.clientDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  // SPA fallback: serve index.html for any unmatched GET (client-side routing).
  // A catch-all MIDDLEWARE rather than `app.get('*')` — Express 5 / path-to-regexp
  // v8 no longer accepts a bare `*` route pattern.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: config.clientDist });
  });
} else {
  // Without a built client there's no SPA to serve, so every page (incl. /dm and
  // /join) 404s — over a tunnel that looks like "the tunnel didn't go through".
  // Make the cause loud instead of silent.
  console.warn(
    '\n  ⚠ No built client found at client/dist — /dm and /join will 404.\n' +
      '    Run `npm run build` (or use start.bat, which builds first). If you\n' +
      "    want hot-reload dev instead, use start-dev.bat and open :5173.\n",
  );
}

registerSocketHandlers(io);

server.listen(config.port, async () => {
  console.log(`\n  DnD-App-v2 server listening on http://localhost:${config.port}`);
  await startTunnel();
  const base = publicUrl();
  console.log('\n  ──────────────────────────────────────────────');
  console.log('  Share these links with your table:');
  console.log(`  DM:      ${base}/dm`);
  console.log(`  Players: ${base}/join`);
  console.log('  (Create a session in the DM view to get a join code.)');
  console.log('  ──────────────────────────────────────────────');
  // The DM secret is required to open the DM console (players never need it).
  // Show it here so the host can copy it; hide it only when the DM supplied
  // their own via DM_PASSPHRASE (already known to them, don't echo to logs).
  if (config.dmSecretSource === 'env') {
    console.log('  DM secret:  (using your DM_PASSPHRASE env var)');
  } else {
    console.log(`  DM secret:  ${config.dmPassphrase}`);
    console.log('              Enter this on the DM screen to log in.');
    console.log('              (Saved in server/data/dm-secret.txt — keep it private.)');
  }
  console.log('  Players just need the session code — no secret.');
  console.log('  ──────────────────────────────────────────────\n');
});
