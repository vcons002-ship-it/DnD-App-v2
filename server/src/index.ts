import http from 'node:http';
import fs from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { config } from './config.js';
import { loadSettings } from './settings.js';
import { seedLibraryItems } from './library.js';
import { createApiRouter } from './routes.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { startTunnel, publicUrl } from './tunnel.js';
import type { IOServer } from './connections.js';

loadSettings(); // apply any DM-saved API key / model overrides on top of env
const seeded = seedLibraryItems(); // one-time fill of the cross-session item library
if (seeded) console.log(`  Seeded ${seeded} SRD items into the item library.`);

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
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.get('*', (_req, res) =>
    res.sendFile('index.html', { root: config.clientDist }),
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
  console.log('  ──────────────────────────────────────────────\n');
});
