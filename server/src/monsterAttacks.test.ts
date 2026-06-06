import { describe, it, expect } from 'vitest';
import { weaponsFromActions, bakeMonsterAttack } from '../../shared/monsterAttacks.js';

describe('weaponsFromActions', () => {
  it('parses Goblin attacks into melee + ranged weapons', () => {
    const { weapons, actions } = weaponsFromActions([
      { name: 'Scimitar', description: '+4 to hit, 1d6+2 slashing.' },
      { name: 'Shortbow', description: '+4 to hit, range 80/320, 1d6+2 piercing.' },
    ]);
    expect(actions).toHaveLength(0);
    expect(weapons).toHaveLength(2);
    expect(weapons[0]).toMatchObject({ name: 'Scimitar', kind: 'melee', damage: '1d6+2', attackBonus: 4, damageType: 'slashing' });
    expect(weapons[1]).toMatchObject({ name: 'Shortbow', kind: 'ranged', damage: '1d6+2', attackBonus: 4, damageType: 'piercing' });
  });

  it('keeps non-attack actions (Multiattack) out of weapons', () => {
    const { weapons, actions } = weaponsFromActions([
      { name: 'Multiattack', description: 'One beak and one claws attack.' },
      { name: 'Beak', description: '+7 to hit, 1d10+5 piercing.' },
      { name: 'Claws', description: '+7 to hit, 2d8+5 slashing.' },
    ]);
    expect(weapons.map((w) => w.name)).toEqual(['Beak', 'Claws']);
    expect(weapons[1]).toMatchObject({ damage: '2d8+5', attackBonus: 7, kind: 'melee' });
    expect(actions.map((a) => a.name)).toEqual(['Multiattack']);
  });

  it('takes only the first damage clause and ignores save-based actions', () => {
    const { weapons, actions } = weaponsFromActions([
      { name: 'Bite', description: '+10 to hit, 2d10+6 piercing plus 1d6 fire.' },
      { name: 'Fire Breath (Recharge 5–6)', description: '30-ft. cone, DC 17 DEX, 16d6 fire (half on save).' },
    ]);
    expect(weapons).toHaveLength(1);
    expect(weapons[0]).toMatchObject({ name: 'Bite', damage: '2d10+6', damageType: 'piercing', attackBonus: 10 });
    expect(actions.map((a) => a.name)).toEqual(['Fire Breath (Recharge 5–6)']); // save, no "to hit"
  });
});

describe('bakeMonsterAttack', () => {
  it('bakes the ability mod + CR to-hit for a finesse weapon (bandit shortsword)', () => {
    // Bandit: DEX 16 (+3), CR 1/8 → prof +2. Finesse uses the better of STR/DEX.
    const w = bakeMonsterAttack(
      { name: 'Shortsword', kind: 'melee', damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'] },
      { STR: 11, DEX: 16 },
      0.125,
    );
    expect(w).toMatchObject({ name: 'Shortsword', kind: 'melee', damage: '1d6+3', attackBonus: 5, damageType: 'piercing' });
  });

  it('uses STR for a non-finesse natural attack and bakes negative mods', () => {
    // STR 8 (-1), CR 1 → prof +2.
    const w = bakeMonsterAttack(
      { name: 'Bite', kind: 'melee', damage: '1d6', damageType: 'piercing', range: 'reach 5 ft', properties: [] },
      { STR: 8, DEX: 14 },
      1,
    );
    expect(w).toMatchObject({ name: 'Bite', damage: '1d6-1', attackBonus: 1, range: 'reach 5 ft' });
  });

  it('omits the +0 modifier from the damage string', () => {
    const w = bakeMonsterAttack(
      { name: 'Slam', kind: 'melee', damage: '2d6', properties: [] },
      { STR: 10 },
      2,
    );
    expect(w.damage).toBe('2d6');
    expect(w.attackBonus).toBe(2); // 0 + profBonusForCR(2)=2
  });
});
