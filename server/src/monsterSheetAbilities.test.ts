import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createMonsterTemplate,
  instantiateMonster,
  copyMonster,
  getMonster,
  updateMonster,
  listRollLog,
} from './sessions.js';
import { resolveMonsterSheetAbility } from './combat.js';
import { db, migrateLegacyMonsterActions } from './db.js';
import { buildSnapshot } from './visibility.js';
import type { Monster, SheetAbility } from '../../shared/types.js';

const burst = (over: Partial<SheetAbility> = {}): SheetAbility => ({
  id: 'fb',
  name: 'Fire Burst',
  type: 'spell',
  level: 3,
  description: '',
  roll: { kind: 'save', dice: '8d6', save: 'DEX', baseLevel: 3, damageType: 'fire' },
  ...over,
});

describe('monster sheetAbilities', () => {
  it('round-trips through create/instantiate/copy/update, deep-copied per instance', () => {
    const s = createSession('MonAb');
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Mage',
      maxHp: 40,
      level: 5,
      stats: { WIS: 16 },
      sheetAbilities: [burst()],
    });
    expect(tmpl.sheetAbilities[0].name).toBe('Fire Burst');

    const inst = instantiateMonster(tmpl.id)!;
    expect(inst.sheetAbilities[0].id).toBe('fb'); // copied onto the instance

    // The instance owns its copy — mutating it leaves the template alone.
    updateMonster(inst.id, { sheetAbilities: [burst({ name: 'Changed' })] });
    expect(getMonster(inst.id)!.sheetAbilities[0].name).toBe('Changed');
    expect(getMonster(tmpl.id)!.sheetAbilities[0].name).toBe('Fire Burst');

    expect(copyMonster(tmpl.id)!.sheetAbilities[0].name).toBe('Fire Burst');
  });

  it('resolves a CR-based save ability (no slot spend, damage not auto-applied)', () => {
    const s = createSession('MonAb2');
    const m = instantiateMonster(
      createMonsterTemplate(s.id, {
        name: 'Adept',
        maxHp: 30,
        level: 5, // CR 5 → proficiency +3
        stats: { WIS: 16 }, // best casting mod +3
        sheetAbilities: [burst()],
      }).id,
    )!;
    const ok = resolveMonsterSheetAbility(
      s.id,
      'DM',
      getMonster(m.id)!,
      getMonster(m.id)!.sheetAbilities[0],
    );
    expect(ok).toBe(true);
    const entry = listRollLog(s.id).at(-1)!;
    expect(entry.apply?.save).toBe('DEX');
    expect(entry.apply?.dc).toBe(14); // 8 + prof(3) + WIS mod(3)
    expect(entry.total).toBeGreaterThanOrEqual(8); // 8d6, not auto-applied
  });

  it('honors an explicit roll.dc over the derived DC', () => {
    const s = createSession('MonAb3');
    const m = instantiateMonster(
      createMonsterTemplate(s.id, {
        name: 'Boss',
        maxHp: 50,
        level: 10,
        stats: { CHA: 20 },
        sheetAbilities: [burst({ roll: { kind: 'save', dice: '2d6', save: 'CON', dc: 17, baseLevel: 1 } })],
      }).id,
    )!;
    resolveMonsterSheetAbility(s.id, 'DM', getMonster(m.id)!, getMonster(m.id)!.sheetAbilities[0]);
    expect(listRollLog(s.id).at(-1)!.apply?.dc).toBe(17);
  });

  it('hides monster sheetAbilities from non-friendly players, shows them to friendly', () => {
    const s = createSession('MonAbVis');
    const map = createMap(s.id, { name: 'Hall' });
    setActiveMap(s.id, map.id);
    const enemy = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Lich', maxHp: 40, level: 5, sheetAbilities: [burst()] }).id,
    )!;
    createToken({ mapId: map.id, kind: 'monster', refId: enemy.id, x: 1, y: 1 });

    // Enemy tier: stripped.
    const pe = buildSnapshot(s.id, 'player')!.monsters.find((x) => x.id === enemy.id)!;
    expect('sheetAbilities' in pe).toBe(false);

    // Friendly tier: full stat block, abilities included (like a PC).
    updateMonster(enemy.id, { disposition: 'friendly' });
    const pf = buildSnapshot(s.id, 'player')!.monsters.find((x) => x.id === enemy.id) as Monster;
    expect(pf.sheetAbilities[0].name).toBe('Fire Burst');
  });
});

describe('legacy action merge (ONE rollable system)', () => {
  it('converts free-text actions at creation: weapons split out, the rest become abilities', () => {
    const s = createSession('Merge1');
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Young Drake',
      maxHp: 60,
      level: 4,
      stats: { STR: 18, CHA: 14 },
      actions: [
        { name: 'Multiattack', description: 'The drake makes two attacks.' },
        { name: 'Bite', description: 'Melee Weapon Attack: +6 to hit, 2d10+4 piercing damage.' },
        {
          name: 'Fire Breath',
          description: 'DC 14 Dexterity saving throw, 7d6 fire damage (half on save).',
        },
      ],
    });

    // Stored monsters keep `actions` empty — everything has a real home now.
    expect(tmpl.actions).toEqual([]);
    // The weapon-like attack became a rollable weapon…
    expect(tmpl.weapons).toHaveLength(1);
    expect(tmpl.weapons[0]).toMatchObject({ name: 'Bite', attackBonus: 6, damage: '2d10+4' });
    // …and the rest became sheet abilities (rolls scraped where possible).
    const names = tmpl.sheetAbilities.map((a) => a.name);
    expect(names).toEqual(['Multiattack', 'Fire Breath']);
    const breath = tmpl.sheetAbilities.find((a) => a.name === 'Fire Breath')!;
    expect(breath.roll).toMatchObject({ kind: 'save', dice: '7d6', dc: 14, save: 'DEX' });
    expect(tmpl.sheetAbilities.find((a) => a.name === 'Multiattack')!.roll).toBeUndefined();

    // Instances inherit the converted shape.
    const inst = instantiateMonster(tmpl.id)!;
    expect(inst.actions).toEqual([]);
    expect(inst.sheetAbilities.map((a) => a.name)).toEqual(['Multiattack', 'Fire Breath']);
  });

  it('migrates a legacy saved row (actions JSON) into weapons + sheetAbilities once', () => {
    const s = createSession('Merge2');
    // A pre-merge monster row, written the way old saves stored it. (Random id —
    // the suite's on-disk DB persists across runs.)
    const legacyId = `legacy-merge-${Math.random().toString(36).slice(2)}`;
    db.prepare(
      `INSERT INTO monsters (id, session_id, name, max_hp, cur_hp, actions, weapons, sheet_abilities)
       VALUES (?, ?, 'Old Ogre', 59, 59, ?, '[]', '[]')`,
    ).run(
      legacyId,
      s.id,
      JSON.stringify([
        { name: 'Greatclub', description: '+6 to hit, 2d8+4 bludgeoning damage.' },
        { name: 'Roar', description: 'DC 12 Wisdom saving throw, 2d6 psychic damage.' },
      ]),
    );

    migrateLegacyMonsterActions();
    const m = getMonster(legacyId)!;
    expect(m.actions).toEqual([]);
    expect(m.weapons[0]).toMatchObject({ name: 'Greatclub', attackBonus: 6 });
    expect(m.sheetAbilities).toHaveLength(1);
    expect(m.sheetAbilities[0]).toMatchObject({ name: 'Roar', type: 'ability' });
    expect(m.sheetAbilities[0].roll).toMatchObject({ kind: 'save', dc: 12, save: 'WIS' });

    // Idempotent: a second run changes nothing (no duplicates).
    migrateLegacyMonsterActions();
    expect(getMonster(legacyId)!.sheetAbilities).toHaveLength(1);
  });
});

describe('hpNote disposition shaping for players', () => {
  it('players see friendly/neutral/PC HP changes but never enemy ones', () => {
    const s = createSession('HpNote');
    const map = createMap(s.id, { name: 'M' });
    setActiveMap(s.id, map.id);
    const caster = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Imp', maxHp: 20, level: 5, stats: { CHA: 16 } }).id,
    )!;
    const enemy = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 100, armorClass: 1 }).id,
    )!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: enemy.id, x: 0, y: 0 });
    const zap: SheetAbility = {
      id: 'z',
      name: 'Zap',
      type: 'ability',
      description: '',
      roll: { kind: 'attack', dice: '10d1', damageType: 'fire' },
    };
    // AC 1 → nearly always hits; loop past the rare nat-1 miss.
    for (let i = 0; i < 60; i++) {
      updateMonster(enemy.id, { curHp: 100 });
      resolveMonsterSheetAbility(s.id, 'DM', caster, zap, undefined, undefined, tok.id);
      if (listRollLog(s.id).at(-1)!.hpNote) break;
    }
    expect(buildSnapshot(s.id, 'dm')!.rollLog.at(-1)!.hpNote?.text).toContain('HP');
    // Default disposition is enemy → the note is stripped for players.
    expect(buildSnapshot(s.id, 'player')!.rollLog.at(-1)!.hpNote).toBeUndefined();
    // Friendly (HP visible to players) → the note shows. (Neutral now hides like
    // enemy — only friendly creatures expose HP to players.)
    updateMonster(enemy.id, { disposition: 'friendly' });
    expect(
      buildSnapshot(s.id, 'player')!.rollLog.at(-1)!.hpNote?.text,
    ).toContain('HP');
  });
});
