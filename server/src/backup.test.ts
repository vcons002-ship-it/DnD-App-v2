import { describe, it, expect } from 'vitest';
import { exportSession, importSession } from './backup.js';
import {
  createSession,
  getSessionByCode,
  createMap,
  setActiveMap,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  createToken,
  listMaps,
  listTokens,
  listCharacters,
  listMonsters,
  addRollLog,
  claimCharacter,
} from './sessions.js';

describe('session export / import', () => {
  it('round-trips a full session into a fresh, independent one', () => {
    const src = createSession('Backup Src');
    const map = createMap(src.id, { name: 'Arena' });
    setActiveMap(src.id, map.id);
    const hero = createCharacter(src.id, { name: 'Aria', maxHp: 22 });
    claimCharacter(hero.id, 'live-socket', 'browser-1'); // live claim must NOT carry over
    const tmpl = createMonsterTemplate(src.id, { name: 'Goblin', maxHp: 7 });
    const gob = instantiateMonster(tmpl.id)!;
    createToken({ mapId: map.id, kind: 'pc', refId: hero.id, x: 10, y: 10 });
    createToken({ mapId: map.id, kind: 'monster', refId: gob.id, x: 20, y: 20 });
    addRollLog(src.id, { roller: 'Aria', label: 'Attack', expr: '1d20+5', total: 18, detail: 'hit' });

    const bundle = exportSession(src.code)!;
    expect(bundle.version).toBe(1);
    expect(bundle.maps).toHaveLength(1);
    expect(bundle.tokens).toHaveLength(2);
    expect(bundle.rollLog).toHaveLength(1);

    const { code } = importSession(bundle);
    expect(code).not.toBe(src.code);
    const dst = getSessionByCode(code)!;
    expect(dst.id).not.toBe(src.id);

    // Same shape, fresh independent ids.
    const dstMaps = listMaps(dst.id);
    expect(dstMaps).toHaveLength(1);
    expect(dstMaps[0].id).not.toBe(map.id);
    expect(dst.activeMapId).toBe(dstMaps[0].id); // active map remapped

    const dstChars = listCharacters(dst.id);
    expect(dstChars.map((c) => c.name)).toContain('Aria');
    const aria = dstChars.find((c) => c.name === 'Aria')!;
    expect(aria.id).not.toBe(hero.id);
    expect(aria.claimedBy).toBeNull(); // live claim dropped

    const dstMons = listMonsters(dst.id);
    expect(dstMons.some((m) => m.name.includes('Goblin'))).toBe(true);

    const dstToks = listTokens(dstMaps[0].id);
    expect(dstToks).toHaveLength(2);
    // Token refs point at the NEW creatures, not the source's.
    const pcTok = dstToks.find((t) => t.kind === 'pc')!;
    expect(pcTok.refId).toBe(aria.id);
    const monTok = dstToks.find((t) => t.kind === 'monster')!;
    expect(dstMons.some((m) => m.id === monTok.refId)).toBe(true);
  });

  it('leaves the source session untouched and honors a custom code', () => {
    const src = createSession('Backup Src 2');
    createMap(src.id, { name: 'Field' });
    const before = listMaps(src.id).map((m) => m.id).sort();

    // Random code so re-runs (tests share one persistent on-disk DB) don't clash.
    const custom = 'R' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const bundle = exportSession(src.code)!;
    const { code } = importSession(bundle, custom);
    expect(code).toBe(custom.toUpperCase());

    // Source unchanged.
    const after = listMaps(src.id).map((m) => m.id).sort();
    expect(after).toEqual(before);
    // A second import with the same custom code is rejected.
    expect(() => importSession(bundle, custom)).toThrow();
  });

  it('returns null for a missing session code', () => {
    expect(exportSession('NOPE')).toBeNull();
  });

  it('drops the durable owner on import (M6) and rejects a bad bundle version', () => {
    const src = createSession('Backup Owner');
    const map = createMap(src.id, { name: 'M' });
    setActiveMap(src.id, map.id);
    const hero = createCharacter(src.id, { name: 'Owned', maxHp: 10 });
    claimCharacter(hero.id, 'sock-1', 'browser-XYZ'); // sets ownerId = browser-XYZ
    const bundle = exportSession(src.code)!;

    const { code } = importSession(bundle);
    const dst = getSessionByCode(code)!;
    const imported = listCharacters(dst.id).find((c) => c.name === 'Owned')!;
    // M6: the ownership drop used a typo'd column key (owner_id), so the durable
    // owner_player_id was imported verbatim — a restored copy auto-reclaimed players.
    expect(imported.ownerId).toBeNull();
    expect(imported.claimedBy).toBeNull();

    // A future/corrupt bundle version must be rejected, not silently imported.
    expect(() => importSession({ ...bundle, version: 2 } as never)).toThrow();
  });
});
