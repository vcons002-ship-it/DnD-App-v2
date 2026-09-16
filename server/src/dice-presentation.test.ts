import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollDice } from '../../shared/dice.js';
import { rollD20Detail, rollWeaponAttack } from '../../shared/combatMath.js';
import { checkReveal, diceReveal } from '../../shared/rollReveal.js';
import { withRollComparison } from '../../shared/dicePresentation.js';
import type { RollReveal, Weapon } from '../../shared/types.js';

afterEach(() => vi.restoreAllMocks());

describe('both server-recorded advantage/disadvantage candidates', () => {
  it.each(['adv', 'dis'] as const)('keeps complete multi-term %s sets, including negative dice, without changing the result', (mode) => {
    const random = vi.spyOn(Math, 'random');
    for (const n of [0, 0.9, 0.5, 0.8, 0.5, 0.5, 0.1, 0.1]) random.mockReturnValueOnce(n);
    const result = rollDice('2d6+1d4-1d8+3', mode)!;
    const original = diceReveal('Hero', result);
    const before = JSON.stringify(original);
    const rendered = withRollComparison(original, result.detail);
    expect(rendered.comparison).toEqual({
      kind: 'dice', mode, kept: mode === 'adv' ? 1 : 0,
      sets: [
        { total: 6, dice: [{ sides: 6, value: 1 }, { sides: 6, value: 6 }, { sides: 4, value: 3 }, { sides: 8, value: 7, negative: true }] },
        { total: 11, dice: [{ sides: 6, value: 4 }, { sides: 6, value: 4 }, { sides: 4, value: 1 }, { sides: 8, value: 1, negative: true }] },
      ],
    });
    expect(rendered.damage).toBe(result.total);
    expect(rendered.damageDice).toEqual(original.damageDice);
    expect(rendered.damageMods).toEqual(original.damageMods);
    expect(JSON.stringify(original)).toBe(before);
    expect(random).toHaveBeenCalledTimes(8); // presentation never rolls anything
  });

  it.each(['adv', 'dis'] as const)('uses the existing first-set-wins rule on %s ties', (mode) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = rollDice('2d6+3', mode)!;
    const rendered = withRollComparison(diceReveal('Hero', result), result.detail);
    expect(rendered.comparison?.kept).toBe(0);
    expect(rendered.comparison?.sets[0]).toEqual(rendered.comparison?.sets[1]);
  });

  it('preserves both percentile results, including 100', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.43);
    const result = rollDice('1d100', 'adv')!;
    const rendered = withRollComparison(diceReveal('Hero', result), result.detail);
    expect(rendered.comparison?.sets.map((set) => set.dice)).toEqual([
      [{ sides: 100, value: 100 }], [{ sides: 100, value: 44 }],
    ]);
  });

  it.each(['adv', 'dis'] as const)('reads actual server d20 %s detail for checks and saves', (mode) => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.8);
    const result = rollD20Detail(mode);
    const reveal = checkReveal({ who: 'Hero', title: 'DEX save', face: result.face, total: result.face + 3, steps: [{ label: 'DEX', value: 3 }] });
    const rendered = withRollComparison(reveal, `Hero — DEX save: ${result.detail} (+3) = ${result.face + 3}`);
    expect(rendered.comparison?.sets.map((set) => set.dice[0].value)).toEqual([3, 17]);
    expect(rendered.comparison?.kept).toBe(mode === 'adv' ? 1 : 0);
    expect(rendered.attackTotal).toBe(reveal.attackTotal);
  });

  it('reads the actual weapon attack format while leaving hit/damage data alone', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.9).mockReturnValue(0.5);
    const out = rollWeaponAttack({ stats: { STR: 16 }, level: 6, isMonster: false }, { name: 'Sword', kind: 'melee', damage: '1d6' } as Weapon, 12, 'adv');
    const reveal: RollReveal = { kind: 'attack', attacker: 'Hero', d20: out.face, outcome: 'hit', attackTotal: out.attackTotal, damage: out.damage, damageDice: out.damageDiceSteps };
    const rendered = withRollComparison(reveal, out.detail);
    expect(rendered.comparison?.sets.map((set) => set.total)).toEqual([5, 19]);
    expect(rendered.comparison?.kept).toBe(1);
    expect(rendered.damage).toBe(out.damage);
    expect(rendered.damageDice).toEqual(out.damageDiceSteps);
  });

  it('handles d20 ties without disguising the discarded equal face', () => {
    const reveal: RollReveal = { kind: 'check', attacker: 'Hero', d20: 12, outcome: 'none' };
    const rendered = withRollComparison(reveal, 'Hero: d20[12,12]→dis 12 = 12');
    expect(rendered.comparison?.kept).toBe(0);
    expect(rendered.comparison?.sets.map((set) => set.total)).toEqual([12, 12]);
  });

  it('falls back unchanged for old, malformed, inconsistent, or absent detail', () => {
    const reveal: RollReveal = { kind: 'check', attacker: 'Hero', d20: 12, outcome: 'none' };
    for (const detail of ['', 'd20[12]', 'd20[0,12]→adv 12', 'd20[12,99]→dis 12', 'd20[12,18]→adv 12', 'd20[1,2]→adv 2']) {
      expect(withRollComparison(reveal, detail)).toBe(reveal);
    }
    const dice: RollReveal = { kind: 'dice', attacker: 'Hero', damage: 6, damageDice: [{ label: '1d6', value: 6, faces: [6] }], outcome: 'none' };
    for (const detail of [
      '1d6[2] (=2) / 1d6[6] (=7) → adv 7',
      '1d6[2] (=2) / 1d6[5] (=5) → adv 6',
      '1d6[2] (=2) / 1d8[6] (=6) → adv 6',
      '1d6[2] (=2) / 2d6[6] (=6) → adv 6',
      '1d6[2] (=2) / 1d6[99] (=6) → adv 6',
      '1d6[2] (=2) / 1d6[6]trailing (=6) → adv 6',
      '1d6[2]+1 (=3) / 1d6[5]+1 (=6) → adv 6',
    ]) expect(withRollComparison(dice, detail)).toBe(dice);
  });
});
