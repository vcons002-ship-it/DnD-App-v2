import { describe, it, expect } from 'vitest';
import {
  profBonusForCR,
  weaponAttackBonus,
  rollWeaponAttack,
  rollSavingThrow,
  rollD20Detail,
  damageMultiplier,
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

  it('uses DEX for finesse melee weapons and STR otherwise', () => {
    // PC: STR 12 (+1), DEX 18 (+4); level 1 → proficiency +2.
    const c: Combatant = { stats: { STR: 12, DEX: 18 }, level: 1, isMonster: false };
    const finesse: Weapon = { name: 'Rapier', kind: 'melee', tags: ['finesse'] };
    const plain: Weapon = { name: 'Mace', kind: 'melee' };
    expect(weaponAttackBonus(c, finesse)).toBe(6); // DEX +4 + prof +2
    expect(weaponAttackBonus(c, plain)).toBe(3); // STR +1 + prof +2
  });

  it('honors an attackAbility override for to-hit AND damage (e.g. Shillelagh → WIS)', () => {
    // STR 8 (−1), DEX 8 (−1), WIS 18 (+4); level 1 → proficiency +2.
    const c: Combatant = { stats: { STR: 8, DEX: 8, WIS: 18 }, level: 1, isMonster: false };
    const club: Weapon = { name: 'Shillelagh Club', kind: 'melee', damage: '1d8', attackAbility: 'WIS' };
    // To-hit uses WIS (+4) + prof (+2) = +6, not STR.
    expect(weaponAttackBonus(c, club)).toBe(6);
    // Damage adds the WIS modifier too (1d8 + 4 → 5..12 on a non-crit hit).
    for (let i = 0; i < 200; i++) {
      const o = rollWeaponAttack({ ...c, isMonster: false }, club, 1);
      if (o.hit && !o.crit) {
        expect(o.damage).toBeGreaterThanOrEqual(5);
        expect(o.damage).toBeLessThanOrEqual(12);
      }
    }
  });

  it('uses versatile (2H) damage dice when wielded two-handed', () => {
    const atk: Combatant = { stats: { STR: 10 }, level: 1, isMonster: true }; // mod 0
    const w: Weapon = {
      name: 'Longsword', kind: 'melee', damage: '2d1', versatileDamage: '6d1', attackBonus: 100,
    };
    for (let i = 0; i < 200; i++) {
      const oneH = rollWeaponAttack(atk, w, 1);
      const twoH = rollWeaponAttack(atk, w, 1, undefined, { twoHanded: true });
      if (oneH.hit && !oneH.crit) expect(oneH.damage).toBe(2);
      if (twoH.hit && !twoH.crit) {
        expect(twoH.damage).toBe(6);
        expect(twoH.detail).toContain('(2H)');
      }
    }
  });

  it('shows both dice and the chosen face under advantage/disadvantage', () => {
    for (let i = 0; i < 200; i++) {
      const straight = rollD20Detail();
      expect(straight.detail).toMatch(/^d20\[\d+\]$/);
      const adv = rollD20Detail('adv');
      expect(adv.detail).toMatch(/^d20\[\d+,\d+\]→adv \d+$/);
      expect(adv.detail.endsWith(`adv ${adv.face}`)).toBe(true);
      const dis = rollD20Detail('dis');
      expect(dis.detail).toMatch(/^d20\[\d+,\d+\]→dis \d+$/);
    }
  });

  it('writes a compact labelled damage breakdown with bracketed sources', () => {
    // PC longsword 1d8, STR 16 (+3), +1 magic vs AC 1 → almost always a hit.
    const pc: Combatant = { stats: { STR: 16 }, level: 1, isMonster: false };
    const w: Weapon = { name: 'Longsword', kind: 'melee', damage: '1d8', attackBonus: 99, magicBonus: 1 };
    let sawHit = false;
    for (let i = 0; i < 100 && !sawHit; i++) {
      const o = rollWeaponAttack(pc, w, 1);
      if (o.hit && !o.crit) {
        sawHit = true;
        // e.g. "… dmg (1d8[5]+3[STR]+1[MAGIC])"
        expect(o.detail).toMatch(/dmg \(1d8\[\d+\]\+3\[STR\]\+1\[MAGIC\]\)/);
      }
    }
    expect(sawHit).toBe(true);
  });

  it('adds a weapon magic bonus to damage (once, not doubled on a crit)', () => {
    const atk: Combatant = { stats: { STR: 16 }, level: 1, isMonster: true };
    // "1d1" is a constant 1 die; +2 magic → 1 + 2 = 3 on a normal hit, and on a
    // crit the dice (only) double: 1 + 1 + 2 = 4 (magic added once).
    const w: Weapon = { name: 'Mace +2', kind: 'melee', damage: '1d1', attackBonus: 100, magicBonus: 2 };
    for (let i = 0; i < 300; i++) {
      const o = rollWeaponAttack(atk, w, 1);
      if (o.hit) {
        expect(o.damage).toBe(o.crit ? 4 : 3);
        expect(o.detail).toContain('[MAGIC]');
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

  it('adds the proficiency bonus to a proficient save', () => {
    // CON 14 (+2); level 5 → proficiency +3.
    const c: Combatant = { stats: { CON: 14 }, level: 5, isMonster: false };
    expect(rollSavingThrow(c, 'CON', 10, undefined, true).mod).toBe(5); // +2 +3
    expect(rollSavingThrow(c, 'CON', 10, undefined, false).mod).toBe(2);
  });

  it('applies resistance (½) and vulnerability (×2) by damage type', () => {
    expect(damageMultiplier('fire', ['fire'], [])).toBe(0.5);
    expect(damageMultiplier('Fire', [], ['fire'])).toBe(2); // case-insensitive
    expect(damageMultiplier('cold', ['fire'], [])).toBe(1);
    expect(damageMultiplier(undefined, ['fire'], [])).toBe(1);
    expect(damageMultiplier('fire', ['fire'], ['fire'])).toBe(1); // both → normal
  });
});
