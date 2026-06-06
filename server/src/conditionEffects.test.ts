import { describe, it, expect } from 'vitest';
import { attackAdvantage, saveAdvantage } from '../../shared/conditionEffects.js';

describe('attackAdvantage', () => {
  it('a prone target grants melee advantage but ranged disadvantage', () => {
    expect(attackAdvantage([], ['Prone'], 'melee').state).toBe('adv');
    expect(attackAdvantage([], ['Prone'], 'ranged').state).toBe('dis');
  });

  it('a restrained/paralyzed target grants advantage', () => {
    expect(attackAdvantage([], ['Restrained'], 'melee').state).toBe('adv');
    expect(attackAdvantage([], ['Paralyzed'], 'ranged').state).toBe('adv');
  });

  it('a blinded/poisoned/frightened attacker has disadvantage', () => {
    expect(attackAdvantage(['Poisoned'], [], 'melee').state).toBe('dis');
    expect(attackAdvantage(['Frightened'], [], 'ranged').state).toBe('dis');
  });

  it('an invisible attacker has advantage; an invisible target gives disadvantage', () => {
    expect(attackAdvantage(['Invisible'], [], 'melee').state).toBe('adv');
    expect(attackAdvantage([], ['Invisible'], 'melee').state).toBe('dis');
  });

  it('advantage and disadvantage cancel to a straight roll (5e)', () => {
    // Attacker poisoned (dis) vs a prone target in melee (adv) → cancel.
    const r = attackAdvantage(['Poisoned'], ['Prone'], 'melee');
    expect(r.state).toBeUndefined();
    expect(r.reasons).toContain('cancel');
  });

  it('folds a manually-requested adv/dis into the result', () => {
    // Manual disadvantage cancels a prone-target melee advantage.
    expect(attackAdvantage([], ['Prone'], 'melee', 'dis').state).toBeUndefined();
    // Manual advantage alone still yields advantage.
    expect(attackAdvantage([], [], 'melee', 'adv').state).toBe('adv');
  });

  it('is a no-op with no conditions and no manual request', () => {
    expect(attackAdvantage([], [], 'melee').state).toBeUndefined();
  });
});

describe('saveAdvantage', () => {
  it('restrained gives disadvantage on DEX saves only', () => {
    expect(saveAdvantage(['Restrained'], 'DEX').state).toBe('dis');
    expect(saveAdvantage(['Restrained'], 'STR').state).toBeUndefined();
  });
});
