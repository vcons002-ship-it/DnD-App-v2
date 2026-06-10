import { describe, it, expect } from 'vitest';
import { parseRollCommand, rollDice } from '../../shared/dice.js';

describe('dice roller', () => {
  it('rolls within bounds and sums modifiers', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDice('2d6+3')!;
      expect(r.rolls).toHaveLength(2);
      expect(r.total).toBeGreaterThanOrEqual(5); // 1+1+3
      expect(r.total).toBeLessThanOrEqual(15); // 6+6+3
    }
  });

  it('handles bare dice, subtraction, and multiple terms', () => {
    const d20 = rollDice('d20')!;
    expect(d20.total).toBeGreaterThanOrEqual(1);
    expect(d20.total).toBeLessThanOrEqual(20);
    const mix = rollDice('1d8+2d4-1')!;
    expect(mix.rolls).toHaveLength(3);
    expect(mix.total).toBeGreaterThanOrEqual(1 + 2 - 1);
    expect(mix.total).toBeLessThanOrEqual(8 + 8 - 1);
  });

  it('rejects garbage', () => {
    expect(rollDice('')).toBeNull();
    expect(rollDice('hello')).toBeNull();
    expect(rollDice('2x6')).toBeNull();
    expect(rollDice('2d')).toBeNull();
  });

  it('caps expression size (term count + total dice) against pathological rolls', () => {
    // 150 one-die terms: each term is legal, the expression as a whole is not.
    expect(rollDice(Array(150).fill('1d6').join('+'))).toBeNull();
    // 11 × 100 dice = 1100 total dice > the 1000 cap.
    expect(rollDice(Array(11).fill('100d6').join('+'))).toBeNull();
    // Big-but-sane expressions still roll.
    expect(rollDice(Array(20).fill('1d6').join('+'))).not.toBeNull();
    expect(rollDice('8d6+5')).not.toBeNull();
  });

  it('advantage keeps the higher of two whole-expression rolls', () => {
    // Probabilistic but extremely safe over many tries.
    let advWins = 0;
    for (let i = 0; i < 300; i++) {
      const adv = rollDice('1d20', 'adv')!.total;
      const dis = rollDice('1d20', 'dis')!.total;
      if (adv >= dis) advWins++;
    }
    expect(advWins).toBeGreaterThan(150);
  });
});

describe('chat /roll command', () => {
  it('parses /roll and /r with optional adv/dis', () => {
    expect(parseRollCommand('/roll 2d8')).toEqual({ expr: '2d8', advantage: undefined });
    expect(parseRollCommand('/r 2d6+3 adv')).toEqual({ expr: '2d6+3', advantage: 'adv' });
    expect(parseRollCommand('  /ROLL d20 DIS ')).toEqual({ expr: 'd20', advantage: 'dis' });
  });

  it('returns null for ordinary chat text', () => {
    expect(parseRollCommand('hello there')).toBeNull();
    expect(parseRollCommand('roll 2d6')).toBeNull(); // no leading slash
    expect(parseRollCommand('/rollercoaster wheee')).toBeNull();
    expect(parseRollCommand('/roll')).toBeNull(); // no expression
  });
});
