import { describe, it, expect } from 'vitest';
import {
  cantripExtraSteps,
  effectiveDice,
  spellAttackBonus,
  spellSaveDC,
} from '../../shared/spellMath.js';

describe('spell math', () => {
  it('upcasts leveled spells by one scaleDice per slot above base', () => {
    const fireball = { dice: '8d6', scaleDice: '1d6', baseLevel: 3 };
    expect(effectiveDice(fireball, { castLevel: 3 })).toBe('8d6');
    expect(effectiveDice(fireball, { castLevel: 5 })).toBe('8d6+1d6+1d6');
    // Casting below base level can't reduce the dice.
    expect(effectiveDice(fireball, { castLevel: 1 })).toBe('8d6');
  });

  it('scales cantrips by caster-level tiers (5/11/17), not slot level', () => {
    const firebolt = { dice: '1d10', scaleDice: '1d10', baseLevel: 0 };
    expect(cantripExtraSteps(1)).toBe(0);
    expect(cantripExtraSteps(5)).toBe(1);
    expect(cantripExtraSteps(11)).toBe(2);
    expect(cantripExtraSteps(17)).toBe(3);
    expect(effectiveDice(firebolt, { casterLevel: 1 })).toBe('1d10');
    expect(effectiveDice(firebolt, { casterLevel: 11 })).toBe('1d10+1d10+1d10');
  });

  it('returns base dice unchanged when there is nothing to scale', () => {
    expect(effectiveDice({ dice: '1d8', baseLevel: 1 }, { castLevel: 5 })).toBe('1d8');
    expect(effectiveDice({ dice: '', scaleDice: '1d6', baseLevel: 1 })).toBe('');
  });

  it('derives spell attack bonus and save DC from level + best caster stat', () => {
    const stats = { INT: 18, WIS: 10, CHA: 8 }; // INT mod +4
    // Level 5 → proficiency +3; +4 mod.
    expect(spellAttackBonus(5, stats)).toBe(7);
    expect(spellSaveDC(5, stats)).toBe(15); // 8 + 3 + 4
  });
});
