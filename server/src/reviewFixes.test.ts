import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from './config.js';
import { db, parseJsonColumn } from './db.js';
import { createApiRouter } from './routes.js';
import { createCharacter, createSession, getCharacter } from './sessions.js';
import { buildSnapshot } from './visibility.js';
import { fetchRemoteImage, imageExtForMime, isPrivateIp } from './remoteImage.js';
import type { IOServer } from './connections.js';

const listen = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};
const close = (server: Server) =>
  new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));

describe('remote image fetch (/api/icons/from-url)', () => {
  let server: Server, base: string;
  beforeAll(async () => {
    // A stand-in "remote" host. Loopback is allowed here only because the test
    // injects its own block-check; the real guard refuses 127.0.0.1.
    const app = express();
    app.get('/png', (_q, r) => r.type('image/png').send(Buffer.from([1, 2, 3])));
    app.get('/html', (_q, r) => r.set('content-type', 'image/.html').send('<script>x</script>'));
    app.get('/traversal', (_q, r) =>
      r.set('content-type', 'image/\\..\\..\\client\\dist\\index.html').send('x'),
    );
    app.get('/svg', (_q, r) => r.type('image/svg+xml').send('<svg/>'));
    app.get('/big', (_q, r) => r.type('image/png').send(Buffer.alloc(2048)));
    app.get('/to-metadata', (_q, r) => r.redirect(302, 'http://metadata.test/latest/'));
    app.get('/to-png', (_q, r) => r.redirect(302, '/png'));
    app.get('/loop', (_q, r) => r.redirect(302, '/loop'));
    ({ server, base } = await listen(app));
  });
  afterAll(() => close(server));

  const onlyBlock = (bad: string) => async (h: string) => h === bad;
  const get = (p: string, max = 1024) =>
    fetchRemoteImage(new URL(base + p), max, { blocked: onlyBlock('metadata.test') });

  it('maps only allowlisted raster types to a fixed extension', () => {
    expect(imageExtForMime('image/png')).toBe('.png');
    expect(imageExtForMime('image/jpeg; charset=binary')).toBe('.jpg');
    expect(imageExtForMime('image/.html')).toBeNull();
    expect(imageExtForMime('image/svg+xml')).toBeNull();
    expect(imageExtForMime('image/\\..\\..\\x')).toBeNull();
    expect(imageExtForMime(null)).toBeNull();
  });

  it('stores a normal image under its fixed extension', async () => {
    const got = await get('/png');
    expect(got).toMatchObject({ ok: true, ext: '.png' });
  });

  it('refuses crafted content types instead of using them as the extension', async () => {
    for (const p of ['/html', '/traversal', '/svg']) {
      const got = await get(p);
      expect(got.ok, p).toBe(false);
    }
  });

  it('re-checks the SSRF guard on every redirect hop', async () => {
    expect(await get('/to-metadata')).toMatchObject({ ok: false, status: 400 });
    expect(await get('/to-png')).toMatchObject({ ok: true, ext: '.png' });
    expect(await get('/loop')).toMatchObject({ ok: false, status: 422 });
  });

  it('enforces the size cap while streaming', async () => {
    expect(await get('/big', 1024)).toMatchObject({ ok: false, status: 413 });
  });

  it('treats IPv6 forms that embed a private IPv4 as private', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateIp('64:ff9b::a9fe:a9fe')).toBe(true);
    expect(isPrivateIp('2002:7f00:1::')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('2606:4700::1111')).toBe(false);
  });
});

describe('library write gates', () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter({} as IOServer));
    ({ server, base } = await listen(app));
  });
  afterAll(() => close(server));

  const dm = { 'x-dm-passphrase': config.dmPassphrase };
  const post = (p: string, body: object, headers: Record<string, string> = {}) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('lets anyone add a character but only the DM overwrite or delete one', async () => {
    const name = `Review Fix Hero ${Date.now()}`;
    expect((await post('/api/library/characters', { name, level: 1 })).status).toBe(201);
    expect((await post('/api/library/characters', { name, level: 2 })).status).toBe(409);
    expect((await post('/api/library/characters?overwrite=true', { name, level: 2 })).status).toBe(403);
    expect((await post('/api/library/characters?overwrite=true', { name, level: 2 }, dm)).status).toBe(201);
    const del = (h: Record<string, string> = {}) =>
      fetch(`${base}/api/library/characters/${encodeURIComponent(name)}`, { method: 'DELETE', headers: h });
    expect((await del()).status).toBe(403);
    expect((await del(dm)).status).toBe(204);
  });

  it('lets anyone add an item but only the DM overwrite one', async () => {
    const name = `Review Fix Item ${Date.now()}`;
    const item = { name, description: 'x', qtyDefault: 1, modifiers: [] };
    expect((await post('/api/library/items', item)).status).toBe(201);
    expect((await post('/api/library/items?overwrite=true', item)).status).toBe(403);
    expect((await post('/api/library/items?overwrite=true', item, dm)).status).toBe(201);
  });
});

describe('corrupt JSON columns', () => {
  it('parseJsonColumn falls back instead of throwing', () => {
    expect(parseJsonColumn('[1,2]', [], 't')).toEqual([1, 2]);
    expect(parseJsonColumn('{oops', [], 't')).toEqual([]);
    expect(parseJsonColumn(null, { a: 1 }, 't')).toEqual({ a: 1 });
  });

  it('one corrupt character cell does not make the session unloadable', () => {
    const session = createSession('Corrupt cell');
    const hero = createCharacter(session.id, { name: 'Broken Bob' });
    db.prepare("UPDATE characters SET conditions = '{not json', stats = 'nope' WHERE id = ?").run(hero.id);
    const loaded = getCharacter(hero.id)!;
    expect(loaded.conditions).toEqual([]);
    expect(loaded.stats.str).toBe(10);
    expect(() => buildSnapshot(session.id, 'dm', null)).not.toThrow();
  });
});
