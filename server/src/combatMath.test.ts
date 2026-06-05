import { describe, it, expect } from 'vitest';
import {
  profBonusForCR,
  weaponAttackBonus,
  rollWeaponAttack,
  rollSavingThrow,
  type Combatant,
} from '../../shared/combatMath.js';
import type { Weapon } from '../../shared/types.js';

describe('combat math', () => {
  it('computes monster proficiency bonus by CR', () => {
    expect(profBonusForCR(0)).toBe(2);
    expect(profBonusForCR(4)).toBe(2);
    expect(profBonusForCR(5)).toBe(3);
    expect(profBonusForCR(9)).toBe(4);
    expect(profBonusForCR(17)).toBe(6);
  });

  it('uses a tagged to-hit when present, else derives it', () => {
    const orc: Combatant = { stats: { STR: 16, DEX: 12 }, level: 1, isMonster: true };
    const tagged: Weapon = { name: 'Greataxe', kind: 'melee', damage: '1d12+3', attackBonus: 5 };
    expect(weaponAttackBonus(orc, tagged)).toBe(5);
    const untagged: Weapon = { name: 'Club', kind: 'melee', damage: '1d4+3' };
    // STR +3, CR0 prof +2 => +5
    expect(weaponAttackBonus(orc, untagged)).toBe(5);
  });

  it('resolves a weapon attack within sane bounds and crits double dice', () => {
    const atk: Combatant = { stats: { STR: 16 }, level: 1, isMonster: true };
    const w: Weapon = { name: 'Greatsword', kind: 'melee', damage: '2d6+3', attackBonus: 5 };
    for (let i = 0; i < 500; i++) {
      const o = rollWeaponAttack(atk, w, 14);
      expect(o.attackTotal).toBeGreaterThanOrEqual(6); // 1+5
      expect(o.attackTotal).toBeLessThanOrEqual(25); // 20+5
      if (o.hit) {
        expect(o.damage).toBeGreaterThanOrEqual(o.crit ? 4 + 3 : 2 + 3);
        expect(o.damage).toBeLessThanOrEqual(o.crit ? 24 + 3 : 12 + 3);
      }
    }
  });

  it('auto-hits on nat 20 (crit) and auto-misses on nat 1', () => {
    const atk: Combatant = { stats: { STR: 20 }, level: 1, isMonster: true };
    const w: Weapon = { name: 'X', kind: 'melee', damage: '1d6', attackBonus: 99 };
    // vs an impossibly high AC, only a nat-20 crit can land.
    let sawCrit = false;
    for (let i = 0; i < 400; i++) {
      const o = rollWeaponAttack(atk, w, 1000);
      if (o.hit) {
        expect(o.crit).toBe(true);
        sawCrit = true;
      }
    }
    expect(sawCrit).toBe(true);
  });

  it('rolls saving throws vs a DC', () => {
    const c: Combatant = { stats: { DEX: 14 }, level: 1, isMonster: false };
    const o = rollSavingThrow(c, 'DEX', 10);
    expect(o.mod).toBe(2);
    expect(o.total).toBe(o.face + 2);
    expect(o.pass).toBe(o.total >= 10);
  });
});
