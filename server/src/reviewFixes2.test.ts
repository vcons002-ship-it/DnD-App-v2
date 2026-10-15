import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from './config.js';
import { createApiRouter } from './routes.js';
import { createSession } from './sessions.js';
import type { IOServer } from './connections.js';

describe('map uploads check the DM secret before storing anything', () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter({} as IOServer));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('refuses an unauthenticated upload without writing it to disk', async () => {
    const session = createSession('Upload gate');
    const before = new Set(fs.readdirSync(config.uploadsDir));
    const form = new FormData();
    form.append('name', 'Sneaky');
    form.append('image', new Blob([new Uint8Array(512 * 1024)], { type: 'video/mp4' }), 'big.mp4');
    const res = await fetch(`${base}/api/sessions/${session.code}/maps`, { method: 'POST', body: form });
    expect(res.status).toBe(403);
    const added = fs.readdirSync(config.uploadsDir).filter((f) => !before.has(f));
    expect(added).toEqual([]);
  });

  it('answers 403 before the body has even finished arriving', async () => {
    const session = createSession('Upload gate stream');
    // A multipart body that never completes: the refusal must not wait for it.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(`${base}/api/sessions/${session.code}/maps`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(250 * 1024 * 1024) },
      }, (res) => { resolve(res.statusCode ?? 0); req.destroy(); });
      req.on('error', () => {});
      req.write('--x\r\nContent-Disposition: form-data; name="image"; filename="big.mp4"\r\nContent-Type: video/mp4\r\n\r\n');
      req.write(Buffer.alloc(64 * 1024));
      setTimeout(() => reject(new Error('no response while the body was still streaming')), 3000);
    });
    expect(status).toBe(403);
  });
});

describe('deleting a session clears its character-creator records', () => {
  it('removes stat rolls and creation requests with the session', async () => {
    const { db } = await import('./db.js');
    const { deleteSession } = await import('./sessions.js');
    const { rollCreatorStats } = await import('./characterCreator.js');
    const session = createSession('Creator cleanup');
    rollCreatorStats(session.id, 'p', { rollId: 'cleanup-roll-0000001', className: 'fighter', name: 'Hero' });
    db.prepare('INSERT INTO character_creation_requests VALUES(?,?,?,?)').run(session.id, 'p', 'cleanup-request-00001', 'x');
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE session_id=?`).get(session.id) as { n: number }).n;
    expect(count('character_stat_rolls')).toBe(1);
    deleteSession(session.id);
    expect(count('character_stat_rolls')).toBe(0);
    expect(count('character_creation_requests')).toBe(0);
  });
});
