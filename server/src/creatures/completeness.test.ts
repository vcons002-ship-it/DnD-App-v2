import { describe, expect, it } from 'vitest';
import { creatureGaps, missingCreatureFields } from './completeness.js';
import { getSrd } from './srd.js';
import { starterCreatures } from './starterLibrary.js';
import { creatureSize, resolveMonsterModelType } from '../../../shared/monsterAppearance.js';

describe('creature completeness repair', () => {
  it('fills partial scores and missing attacks without replacing HP, art, AC or edited scores', () => {
    const original = { name: 'Cultist', stats: { STR: 19 }, maxHp: 91, armorClass: 9, icon: '/custom.png' };
    const patch = missingCreatureFields(original, getSrd('Cultist')!);
    expect(patch.stats).toMatchObject({ STR: 19, DEX: 12, CON: 10, INT: 10, WIS: 11, CHA: 10 });
    expect(patch.weapons?.[0]).toMatchObject({ name: 'Scimitar', damage: '1d6+1', attackBonus: 3 });
    expect(patch).not.toHaveProperty('maxHp'); expect(patch).not.toHaveProperty('armorClass');
    expect(patch).not.toHaveProperty('icon');
    const repaired = { ...original, ...patch };
    expect(creatureGaps(repaired)).toEqual([]);
    expect(missingCreatureFields(repaired, getSrd('Cultist')!)).toEqual({});
  });
  it('keeps custom weapons and valid zero CR and prefers attacks already written on the token', () => {
    const source = getSrd('Goblin')!;
    const current = { ...source, level: 0, weapons: [{ name: 'Custom bow', kind: 'ranged' as const, damage: '3d6', attackBonus: 0 }] };
    expect(missingCreatureFields(current, source)).toEqual({});
    const patch = missingCreatureFields({ name: 'Goblin', actions: [{ name: 'Custom bite', description: '+7 to hit, 2d8+4 piercing.' }] }, source);
    expect(patch.weapons?.[0].name).toBe('Custom bite');
  });
  it('exempts utility markers and objects', () => {
    for (const token of [{ name: 'Mage Hand' }, { name: 'Chest', objectKind: 'chest' as const }, { name: 'Medium sized boat token' }]) {
      expect(creatureGaps(token)).toEqual([]);
      expect(missingCreatureFields(token, getSrd('Goblin')!)).toEqual({});
    }
  });
  it('repairs imported dice text and incomplete weapon fields without changing existing attack bonuses', () => {
    const source = getSrd('Guard')!;
    const patch = missingCreatureFields({ ...source, stats: { ...source.stats, STR: 16 }, weapons: [
      { name: 'Longsword', kind: 'melee', attackBonus: 0 },
      { name: 'Custom bow', kind: 'ranged', damage: '2d8+2 piercing damage', attackBonus: 4 },
    ] }, source);
    expect(patch.weapons).toEqual([
      { name: 'Longsword', kind: 'melee', attackBonus: 0, damage: '1d8+3', damageType: 'slashing' },
      { name: 'Custom bow', kind: 'ranged', damage: '2d8+2', attackBonus: 4, damageType: 'piercing' },
    ]);
  });
  it('ships complete new creatures with distinct families and correct combat sizes', () => {
    for (const c of starterCreatures()) expect(creatureGaps(c), c.name).toEqual([]);
    expect(resolveMonsterModelType({ name: 'Brown Bear 2' })).toBe('brown-bear');
    expect(creatureSize({ name: 'Owlbear' })).toBe('large');
    expect(creatureSize({ name: 'Bugbear' })).toBe('medium');
  });
});
