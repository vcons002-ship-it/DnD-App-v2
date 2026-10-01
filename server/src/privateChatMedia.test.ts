import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import { db, newId } from './db.js';
import { createChatImageRouter, chatImageForSend, getChatImage, privateChatDir } from './chatImages.js';
import { chatAccessToken, chatMediaConnection, dropConn, getConn, setConn, type Conn } from './connections.js';
import { addChatMessage, createSession } from './sessions.js';
import { exportSession, importSession } from './backup.js';
import { getSessionByCode } from './sessions.js';
import type { ChatPrivacy } from './privateChat.js';

let server: Server, base: string, png: Buffer;
const connections: string[] = [];
beforeAll(async () => {
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#8432c8' } }).png().toBuffer();
  const app = express();
  app.use('/api/chat-images', createChatImageRouter());
  app.use('/uploads', express.static(config.uploadsDir));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => { for (const id of connections.splice(0)) dropConn(id); });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

function connect(sessionId: string, role: Conn['role'], playerId: string | null) {
  const id = newId();
  setConn(id, { sessionId, role, playerId, viewMapId: null });
  connections.push(id);
  return { id, token: chatAccessToken(id)!, conn: getConn(id)! };
}
function world() {
  const session = createSession('Private image permissions');
  return { session, a: connect(session.id, 'player', 'image-owner-a'), b: connect(session.id, 'player', 'image-owner-b'), c: connect(session.id, 'player', 'image-owner-c'), dm: connect(session.id, 'dm', null) };
}
async function upload(token: string, bytes: Buffer = png, type = 'image/png', name = 'Private map.png') {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(bytes)], { type }), name);
  return fetch(`${base}/api/chat-images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}
const get = (id: string, token?: string) => fetch(`${base}/api/chat-images/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
function attach(sessionId: string, image: { id: string; name: string }, privacy: ChatPrivacy, dmOnly = false) {
  return addChatMessage(sessionId, 'Alice', 'player', 'Secret image', dmOnly, [], { privacy, image });
}

describe('private image authentication and audiences', () => {
  it('keeps a live token through map changes and revokes it on disconnect or authentication-context changes', () => {
    const f = world(), key = f.dm.token;
    setConn(f.dm.id, { ...f.dm.conn, viewMapId: 'another-map' });
    expect(chatAccessToken(f.dm.id)).toBe(key);
    expect(chatMediaConnection(key)?.viewMapId).toBe('another-map');
    setConn(f.dm.id, { ...f.dm.conn, role: 'player', playerId: 'new-key' });
    expect(chatAccessToken(f.dm.id)).not.toBe(key);
    expect(chatMediaConnection(key)).toBeUndefined();
    const freshKey = chatAccessToken(f.dm.id)!;
    dropConn(f.dm.id);
    expect(chatMediaConnection(freshKey)).toBeUndefined();
  });

  it('authenticates before accepting uploads and stores valid bytes outside public uploads', async () => {
    const f = world();
    expect((await upload('f'.repeat(64))).status).toBe(401);
    expect(db.prepare('SELECT * FROM chat_images WHERE session_id = ?').all(f.session.id)).toEqual([]);
    const response = await upload(f.a.token);
    expect(response.status).toBe(200);
    const image = await response.json() as { id: string; name: string };
    expect(Object.keys(image).sort()).toEqual(['id', 'name']);
    expect(JSON.stringify(image)).not.toContain(f.a.token);
    const stored = getChatImage(image.id)!;
    expect(fs.readFileSync(path.join(privateChatDir(), stored.file_name))).toEqual(png);
    expect(fs.existsSync(path.join(config.uploadsDir, stored.file_name))).toBe(false);
    expect((await fetch(`${base}/uploads/${stored.file_name}`)).status).toBe(404);
    const own = await get(image.id, f.a.token);
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toContain('no-store');
    expect(own.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await own.arrayBuffer())).toEqual(png);
    expect((await get(image.id)).status).toBe(401);
    expect((await get(image.id, f.b.token)).status).toBe(404);
    expect((await get(image.id, f.dm.token)).status).toBe(404);
  });

  it('rejects player uploads without a durable identity before writing private files', async () => {
    const f = world(), anonymous = connect(f.session.id, 'player', null);
    expect((await upload(anonymous.token)).status).toBe(403);
    expect(db.prepare('SELECT * FROM chat_images WHERE session_id = ?').all(f.session.id)).toEqual([]);
  });

  it('permits only persisted P2P participants and the original uploader to read a player-only image', async () => {
    const f = world(), response = await upload(f.a.token), image = await response.json() as { id: string; name: string };
    attach(f.session.id, image, { channel: 'whisper', audience: ['image-owner-a', 'image-owner-b'], participants: [], includesDm: false });
    expect((await get(image.id, f.a.token)).status).toBe(200);
    expect((await get(image.id, f.b.token)).status).toBe(200);
    expect((await get(image.id, f.c.token)).status).toBe(404);
    expect((await get(image.id, f.dm.token)).status).toBe(404);
    const foreign = connect(createSession('Foreign campaign').id, 'dm', null);
    expect((await get(image.id, foreign.token)).status).toBe(404);
    expect(chatImageForSend(f.b.conn, image.id)).toBeUndefined();
    expect(chatImageForSend(f.dm.conn, image.id)).toBeUndefined();
    expect(chatImageForSend(f.a.conn, image.id)).toEqual(image);
    dropConn(f.b.id);
    expect((await get(image.id, f.b.token)).status).toBe(401);
    const returning = connect(f.session.id, 'player', 'image-owner-b');
    expect((await get(image.id, returning.token)).status).toBe(200);
  });

  it('allows Party players and excludes the DM, while DM-including whispers allow their two participants', async () => {
    const f = world();
    const party = await (await upload(f.a.token)).json() as { id: string; name: string };
    attach(f.session.id, party, { channel: 'party', audience: [], participants: [], includesDm: false });
    expect((await get(party.id, f.c.token)).status).toBe(200);
    expect((await get(party.id, f.dm.token)).status).toBe(404);
    const dmImage = await (await upload(f.dm.token)).json() as { id: string; name: string };
    attach(f.session.id, dmImage, { channel: 'whisper', audience: ['image-owner-a'], participants: [], includesDm: true });
    expect((await get(dmImage.id, f.dm.token)).status).toBe(200);
    expect((await get(dmImage.id, f.a.token)).status).toBe(200);
    expect((await get(dmImage.id, f.b.token)).status).toBe(404);
  });

  it('does not expose restored player-only attachments to the DM or source browser keys', async () => {
    const f = world(), image = await (await upload(f.a.token)).json() as { id: string; name: string };
    attach(f.session.id, image, { channel: 'party', audience: [], participants: [], includesDm: false });
    const restored = getSessionByCode(importSession(exportSession(f.session.code)!).code)!;
    const stored = db.prepare('SELECT * FROM chat_images WHERE session_id = ?').get(restored.id) as { id: string };
    const dm = connect(restored.id, 'dm', null), player = connect(restored.id, 'player', 'image-owner-a');
    expect((await get(stored.id, dm.token)).status).toBe(404);
    expect((await get(stored.id, player.token)).status).toBe(404);
    expect((await get(image.id, dm.token)).status).toBe(404);
    expect(chatImageForSend(dm.conn, stored.id)).toBeUndefined();
  });

  it('rejects active image content and corrupt bytes despite a claimed PNG name and MIME', async () => {
    const f = world();
    const script = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><script>alert(1)</script></svg>');
    expect((await upload(f.a.token, script, 'image/png', 'secret.png')).status).toBe(400);
    expect((await upload(f.a.token, Buffer.from('not an image'), 'image/png', 'secret.png')).status).toBe(400);
    expect(db.prepare('SELECT * FROM chat_images WHERE session_id = ?').all(f.session.id)).toEqual([]);
  });
});
