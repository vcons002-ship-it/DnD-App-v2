import { describe, it, expect } from 'vitest';
import {
  attackAdvantage,
  saveAdvantage,
  saveAutoFail,
  checkAdvantage,
} from '../../shared/conditionEffects.js';

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

describe('saveAutoFail', () => {
  it('paralyzed/stunned/unconscious/petrified auto-fail STR & DEX saves', () => {
    for (const c of ['Paralyzed', 'Stunned', 'Unconscious', 'Petrified']) {
      expect(saveAutoFail([c], 'DEX')).toBe(c.toLowerCase());
      expect(saveAutoFail([c], 'STR')).toBe(c.toLowerCase());
    }
  });

  it('does NOT auto-fail CON/INT/WIS/CHA saves', () => {
    for (const ab of ['CON', 'INT', 'WIS', 'CHA'])
      expect(saveAutoFail(['Paralyzed'], ab)).toBeNull();
  });

  it('returns null for conditions that do not auto-fail', () => {
    expect(saveAutoFail(['Restrained'], 'DEX')).toBeNull();
    expect(saveAutoFail([], 'DEX')).toBeNull();
  });
});

describe('checkAdvantage', () => {
  it('poisoned and frightened impose disadvantage on ability checks', () => {
    expect(checkAdvantage(['Poisoned']).state).toBe('dis');
    expect(checkAdvantage(['Frightened']).state).toBe('dis');
  });

  it('other conditions and no conditions roll straight', () => {
    expect(checkAdvantage(['Restrained']).state).toBeUndefined();
    expect(checkAdvantage([]).state).toBeUndefined();
  });

  it('a manual advantage cancels condition disadvantage', () => {
    expect(checkAdvantage(['Poisoned'], 'adv').state).toBeUndefined();
  });
});
