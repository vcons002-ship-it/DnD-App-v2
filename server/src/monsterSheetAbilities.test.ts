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
