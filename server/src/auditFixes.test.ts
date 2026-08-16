// Regression tests for the 2026-07 code-audit fixes (docs/code-audit-2026-07.md).
import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  updateCharacter,
  createMonsterTemplate,
  instantiateMonster,
  duplicateToken,
  updateMonster,
  getMonster,
  getCharacter,
  getToken,
  applyDamage,
  setDeathSaves,
  updateMapGrid,
  getMap,
  addMapImage,
  addAnnotation,
  listMapImages,
  listAnnotations,
  listMaps,
  reorderMaps,
  listTokens,
  setTokenHidden,
  setTokenInCombat,
  rollAllInitiative,
  rollMissingInitiative,
  setLoot,
  addRollLog,
  getRollEntry,
  importMaps,
} from './sessions.js';
import { resolveForcedSave } from './combat.js';

function arena(name = 'Audit') {
  const s = createSession(name);
  const map = createMap(s.id, { name: 'M' });
  setActiveMap(s.id, map.id);
  return { s, map };
}

describe('H4/H5 — monster copy paths preserve the full stat block', () => {
  it('instantiateMonster keeps saveProficiencies, object state, and sheet abilities', () => {
    const { s } = arena();
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Archmage',
      maxHp: 40,
      stats: { INT: 20 },
      objectKind: 'chest',
      objectDc: 15,
    });
    // Fields only reachable via updateMonster / setLoot on the template.
    updateMonster(tmpl.id, {
      saveProficiencies: ['INT', 'WIS'],
      sheetAbilities: [
        { id: 'a1', name: 'Fireball', type: 'spell', description: '', level: 3 },
      ],
    });
    setLoot(tmpl.id, { gold: 50, items: [] });

    const inst = getMonster(instantiateMonster(tmpl.id)!.id)!;
    expect(inst.saveProficiencies).toEqual(['INT', 'WIS']); // the H4 bug
    expect(inst.sheetAbilities.map((a) => a.name)).toContain('Fireball');
    expect(inst.objectKind).toBe('chest');
    expect(inst.objectDc).toBe(15);
    expect(inst.loot?.gold).toBe(50);
  });

  it('duplicateToken clones sheet abilities + object state (not just name/HP)', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Cult Mage', maxHp: 20, stats: { INT: 16 } });
    updateMonster(tmpl.id, {
      saveProficiencies: ['INT'],
      sheetAbilities: [{ id: 'b1', name: 'Shield', type: 'spell', description: '', level: 1 }],
    });
    const inst = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });

    const copyTok = duplicateToken(tok.id)!;
    const copy = getMonster(copyTok.refId)!;
    expect(copy.sheetAbilities.map((a) => a.name)).toContain('Shield'); // the H5 bug
    expect(copy.saveProficiencies).toEqual(['INT']);
    // Deep-copied, not aliased: editing the copy doesn't touch the source.
    expect(copy.id).not.toBe(inst.id);
  });
});

describe('M2 — a crit vs a downed PC is two death-save failures', () => {
  it('applyDamage(crit) adds 2 failures, plain adds 1', () => {
    const { s } = arena();
    const a = createCharacter(s.id, { name: 'Downed A', stats: { CON: 10 } });
    const b = createCharacter(s.id, { name: 'Downed B', stats: { CON: 10 } });
    updateCharacter(a.id, { curHp: 0 });
    updateCharacter(b.id, { curHp: 0 });

    applyDamage('pc', a.id, 5); // non-crit hit while down → 1 failure
    expect(getCharacter(a.id)!.deathSaves.failures).toBe(1);

    applyDamage('pc', b.id, 5, undefined, true); // crit while down → 2 failures
    expect(getCharacter(b.id)!.deathSaves.failures).toBe(2);
  });

  it('a crit that reaches the 3rd failure kills (caps at 3)', () => {
    const { s } = arena();
    const c = createCharacter(s.id, { name: 'Downed C', stats: { CON: 10 } });
    updateCharacter(c.id, { curHp: 0 });
    setDeathSaves(c.id, 0, 2); // already 2 failures
    applyDamage('pc', c.id, 5, undefined, true); // +2 → capped at 3 (dead)
    expect(getCharacter(c.id)!.deathSaves.failures).toBe(3);
  });
});

describe('M1 — Apply-damage cannot be re-applied past its budget', () => {
  const magicMissile = (s: string) =>
    addRollLog(s, {
      roller: 'Mage',
      label: 'Magic Missile',
      expr: 'Magic Missile',
      total: 0,
      detail: '3 darts',
      apply: { amount: 0, dc: 0, darts: 3, dice: '1d1' }, // 1d1 → each dart = 1
    });

  it('a split spell spends each dart exactly once, then rejects further clicks', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 20, stats: { DEX: 10 } });
    const inst = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
    const entry = magicMissile(s.id);

    for (let i = 0; i < 5; i++) resolveForcedSave(s.id, entry.id, tok.id, undefined, 0);
    // 3 darts × 1 dmg = 3 total, NOT 5 (the extra clicks are rejected).
    expect(20 - getMonster(inst.id)!.curHp).toBe(3);
    expect(getRollEntry(entry.id)!.apply!.consumedDarts).toBe(3);
  });

  it('a save/auto-hit apply resolves each target at most once', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Straw', maxHp: 40, stats: { DEX: 10 } });
    const inst = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
    const entry = addRollLog(s.id, {
      roller: 'Mage',
      label: 'Blast',
      expr: 'Blast',
      total: 10,
      detail: 'auto-hit 10',
      apply: { amount: 10, dc: 0, damageType: 'fire' }, // save-less auto-hit
    });
    resolveForcedSave(s.id, entry.id, tok.id);
    resolveForcedSave(s.id, entry.id, tok.id); // second click on same target ignored
    expect(40 - getMonster(inst.id)!.curHp).toBe(10);
  });
});

describe('H6 — map scale keeps a fractional feet-per-square', () => {
  it('updateMapGrid stores the exact float (no integer rounding)', () => {
    const { s, map } = arena();
    updateMapGrid(map.id, 50, 1.6667, 100);
    expect(getMap(map.id)!.feetPerSquare).toBeCloseTo(1.6667, 3);
  });
});

describe('M5 — importMaps carries image tiles + annotations', () => {
  it('a composed map imports its tiles, decals, and full-fidelity tokens', () => {
    const src = arena('Src');
    const dst = createSession('Dst');
    // A tile + a decal on the source map, and an image-shaped token.
    addMapImage(src.s.id, {
      mapId: src.map.id,
      imagePath: '/uploads/tile.png',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
    addAnnotation(src.s.id, {
      mapId: src.map.id,
      kind: 'image',
      color: '#fff',
      url: '/uploads/decal.png',
      createdBy: 'DM',
    });
    const ch = createCharacter(src.s.id, { name: 'Hero', stats: {} });
    createToken({ mapId: src.map.id, kind: 'pc', refId: ch.id, x: 5, y: 5, shape: 'image' });

    expect(importMaps(dst.id, src.s.code, [src.map.id])).toBe(1);

    // The import created exactly one new map in dst — assert its content survived.
    const newMap = listMaps(dst.id)[0]!;
    expect(listMapImages(newMap.id).map((i) => i.imagePath)).toEqual(['/uploads/tile.png']); // was dropped
    expect(listAnnotations(newMap.id).map((a) => a.kind)).toEqual(['image']); // was dropped
    expect(listTokens(newMap.id)[0]!.shape).toBe('image'); // reduced-column bug lost this
  });
});

describe('DM map ordering', () => {
  it('reorders maps, keeps legacy order until touched, and puts new maps last', () => {
    const s = createSession('MapOrder');
    const a = createMap(s.id, { name: 'A' });
    const b = createMap(s.id, { name: 'B' });
    const c = createMap(s.id, { name: 'C' });
    // Untouched: creation order (legacy saves have sort_order 0 and rely on the
    // created_at tiebreak, so an existing campaign's order is unchanged).
    expect(listMaps(s.id).map((m) => m.name)).toEqual(['A', 'B', 'C']);

    reorderMaps(s.id, [c.id, a.id, b.id]);
    expect(listMaps(s.id).map((m) => m.name)).toEqual(['C', 'A', 'B']);

    // A map added after a reorder lands at the END, not the front.
    const d = createMap(s.id, { name: 'D' });
    expect(listMaps(s.id).map((m) => m.name)).toEqual(['C', 'A', 'B', 'D']);
    expect(d.id).toBeTruthy();
  });

  it('ignores unknown ids and keeps omitted maps (a stale list cannot drop one)', () => {
    const s = createSession('MapOrder2');
    const a = createMap(s.id, { name: 'A' });
    const b = createMap(s.id, { name: 'B' });
    const c = createMap(s.id, { name: 'C' });
    // Client only knew about C (stale list) and sent a foreign id too.
    reorderMaps(s.id, ['not-a-map', c.id]);
    const names = listMaps(s.id).map((m) => m.name);
    expect(names[0]).toBe('C'); // the listed one moves to the front
    expect(names).toHaveLength(3); // A and B survive, in their prior order
    expect(names.slice(1)).toEqual(['A', 'B']);
    expect([a.id, b.id].every(Boolean)).toBe(true);
  });

  it('does not touch another session\'s maps', () => {
    const s1 = createSession('MapOrderS1');
    const s2 = createSession('MapOrderS2');
    const foreign = createMap(s2.id, { name: 'Foreign' });
    const x = createMap(s1.id, { name: 'X' });
    const y = createMap(s1.id, { name: 'Y' });
    reorderMaps(s1.id, [foreign.id, y.id, x.id]); // foreign id is ignored
    expect(listMaps(s1.id).map((m) => m.name)).toEqual(['Y', 'X']);
    expect(listMaps(s2.id).map((m) => m.name)).toEqual(['Foreign']);
  });
});

describe('initiative pulls in only the intended combatants', () => {
  const setup = () => {
    const { s, map } = arena('Init');
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    const spawn = (opts: { hidden?: boolean } = {}) => {
      const inst = instantiateMonster(tmpl.id)!;
      const t = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
      if (opts.hidden) setTokenHidden(t.id, true);
      return t.id;
    };
    return { s, map, spawn };
  };
  const initOf = (mapId: string, tokenId: string) =>
    listTokens(mapId).find((t) => t.id === tokenId)!.initiative;

  it('rolls for visible creatures but leaves hidden ones out of the fight', () => {
    const { map, spawn } = setup();
    const seen = spawn();
    const ambush = spawn({ hidden: true });
    rollAllInitiative(map.id);
    expect(initOf(map.id, seen)).not.toBeNull();
    expect(initOf(map.id, ambush)).toBeNull(); // was dragged in before
  });

  it('an ambusher joins once revealed via "Add rolls", without re-rolling the party', () => {
    const { map, spawn } = setup();
    const seen = spawn();
    const ambush = spawn({ hidden: true });
    rollAllInitiative(map.id);
    const partyInit = initOf(map.id, seen);

    setTokenHidden(ambush, false); // the trap springs
    rollMissingInitiative(map.id);
    expect(initOf(map.id, ambush)).not.toBeNull();
    expect(initOf(map.id, seen)).toBe(partyInit); // existing order untouched
  });

  it('honors the DM override in both directions', () => {
    const { map, spawn } = setup();
    const bystander = spawn(); // visible, but not a fighter
    const stalker = spawn({ hidden: true }); // invisible, but IS a fighter
    setTokenInCombat(bystander, false);
    setTokenInCombat(stalker, true);
    rollAllInitiative(map.id);
    expect(initOf(map.id, bystander)).toBeNull();
    expect(initOf(map.id, stalker)).not.toBeNull();
  });

  it('marking a token OUT mid-combat drops it from the order', () => {
    const { map, spawn } = setup();
    const t = spawn();
    rollAllInitiative(map.id);
    expect(initOf(map.id, t)).not.toBeNull();
    setTokenInCombat(t, false);
    expect(initOf(map.id, t)).toBeNull();
  });

  it('objects never roll, however they are marked', () => {
    const { s, map } = arena('InitObj');
    const chest = createMonsterTemplate(s.id, { name: 'Chest', maxHp: 1, objectKind: 'chest' });
    const inst = instantiateMonster(chest.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
    setTokenInCombat(tok.id, true); // even forced in
    rollAllInitiative(map.id);
    expect(listTokens(map.id).find((t) => t.id === tok.id)!.initiative).toBeNull();
  });
});
