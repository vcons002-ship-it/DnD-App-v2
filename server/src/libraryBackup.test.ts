import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from './config.js';
import { db } from './db.js';
import { exportLibrary, importLibrary, type LibraryBundle } from './backup.js';
import {
  getLibraryCharacter,
  getLibraryCreature,
  getLibraryItemByName,
  saveLibraryCharacter,
  saveLibraryCreature,
  saveLibraryItem,
} from './library.js';
import { createApiRouter } from './routes.js';
import type { IOServer } from './connections.js';

// The shared test DB holds other suites' library entries; every assertion here
// is scoped to these uniquely named ones.
const tag = `LibBackup${Date.now()}`;
const names = { creature: `${tag} Owlbear`, character: `${tag} Druk`, item: `${tag} Rope` };
const iconFile = `${tag}-icon.png`;
const iconBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const mine = (bundle: LibraryBundle): LibraryBundle => ({
  ...bundle,
  creatures: bundle.creatures.filter((r) => r.name === names.creature),
  characters: bundle.characters.filter((r) => r.name === names.character),
  items: bundle.items.filter((r) => r.name === names.item),
});
const wipe = () => {
  db.prepare('DELETE FROM library_creatures WHERE name = ?').run(names.creature);
  db.prepare('DELETE FROM library_characters WHERE name = ?').run(names.character);
  db.prepare('DELETE FROM library_items WHERE name = ?').run(names.item);
};

beforeAll(() => {
  fs.writeFileSync(path.join(config.uploadsDir, iconFile), iconBytes);
  saveLibraryCreature({ name: names.creature, maxHp: 59, icon: `/uploads/${iconFile}` } as never, false);
  saveLibraryCharacter({ name: names.character, level: 5, icon: `/uploads/${iconFile}` }, false, 'owner-browser');
  saveLibraryItem({ name: names.item, description: '50 ft of hempen rope' });
});

describe('library backup', () => {
  it('exports every library entry with the images it uses, and restores them after a wipe', () => {
    const bundle = mine(exportLibrary());
    expect(bundle.kind).toBe('library');
    expect(bundle.creatures).toHaveLength(1);
    expect(bundle.characters).toHaveLength(1);
    expect(bundle.items).toHaveLength(1);
    expect(Buffer.from(bundle.assets[iconFile], 'base64')).toEqual(iconBytes);

    wipe();
    expect(getLibraryCreature(names.creature)).toBeNull();
    const result = importLibrary(bundle);
    expect(result).toEqual({
      creatures: { added: 1, replaced: 0, skipped: 0 },
      characters: { added: 1, replaced: 0, skipped: 0 },
      items: { added: 1, replaced: 0, skipped: 0 },
    });
    const creature = getLibraryCreature(names.creature)!;
    expect(creature.maxHp).toBe(59);
    // Images come back as fresh files (never the original path) with the same bytes.
    expect(creature.icon).toMatch(/^\/uploads\//);
    expect(creature.icon).not.toBe(`/uploads/${iconFile}`);
    expect(fs.readFileSync(path.join(config.uploadsDir, path.basename(creature.icon!)))).toEqual(iconBytes);
    expect(getLibraryCharacter(names.character)!.level).toBe(5);
    expect(getLibraryItemByName(names.item)!.description).toBe('50 ft of hempen rope');
    // The saver's ownership survives, so they can still overwrite their own sheet.
    expect(db.prepare('SELECT owner_player_id FROM library_characters WHERE name = ?').get(names.character))
      .toEqual({ owner_player_id: 'owner-browser' });
  });

  it('keeps entries that already exist unless asked to replace them', () => {
    const bundle = mine(exportLibrary());
    const edited = { ...bundle, items: bundle.items.map((r) => ({ ...r, description: 'old copy' })) };
    const kept = importLibrary(edited);
    expect(kept.items).toEqual({ added: 0, replaced: 0, skipped: 1 });
    expect(getLibraryItemByName(names.item)!.description).toBe('50 ft of hempen rope');

    const before = getLibraryItemByName(names.item)!.id;
    const replaced = importLibrary(edited, { replace: true });
    expect(replaced.items).toEqual({ added: 0, replaced: 1, skipped: 0 });
    expect(getLibraryItemByName(names.item)).toMatchObject({ id: before, description: 'old copy' });
  });

  it('rejects a corrupt bundle without changing anything', () => {
    expect(() => importLibrary({ kind: 'library', version: 1, creatures: 'nope' } as never)).toThrow(/corrupt/);
    expect(() => importLibrary({ version: 1 } as never)).toThrow(/corrupt/);
    expect(getLibraryCreature(names.creature)).not.toBeNull();
  });
});

describe('library backup routes', () => {
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
  const dm = { 'x-dm-passphrase': config.dmPassphrase };

  it('downloads and restores the library for the DM only', async () => {
    expect((await fetch(`${base}/api/library/export`)).status).toBe(403);
    const download = await fetch(`${base}/api/library/export`, { headers: dm });
    expect(download.status).toBe(200);
    const bundle = mine((await download.json()) as LibraryBundle);
    wipe();

    const upload = (headers: Record<string, string>) => {
      const form = new FormData();
      form.append('file', new Blob([JSON.stringify(bundle)], { type: 'application/json' }), 'library.json');
      return fetch(`${base}/api/sessions/import`, { method: 'POST', headers, body: form });
    };
    expect((await upload({})).status).toBe(403);
    const restored = await upload(dm);
    expect(restored.status).toBe(201);
    expect(((await restored.json()) as { library: { creatures: { added: number } } }).library.creatures.added).toBe(1);
    expect(getLibraryCreature(names.creature)).not.toBeNull();
  });
});
