import { describe, it, expect } from 'vitest';
import {
  attackAdvantage,
  saveAdvantage,
  saveAutoFail,
  checkAdvantage,
  autoCritFromConditions,
  impliedConditions,
} from '../../shared/conditionEffects.js';

const WITHIN = true;
const BEYOND = false;

describe('attackAdvantage', () => {
  it('a prone target grants advantage WITHIN 5 ft but disadvantage BEYOND it', () => {
    expect(attackAdvantage([], ['Prone'], WITHIN).state).toBe('adv');
    expect(attackAdvantage([], ['Prone'], BEYOND).state).toBe('dis');
  });

  it('a restrained/paralyzed target grants advantage', () => {
    expect(attackAdvantage([], ['Restrained'], WITHIN).state).toBe('adv');
    expect(attackAdvantage([], ['Paralyzed'], BEYOND).state).toBe('adv');
  });

  it('a blinded/poisoned/frightened attacker has disadvantage', () => {
    expect(attackAdvantage(['Poisoned'], [], WITHIN).state).toBe('dis');
    expect(attackAdvantage(['Frightened'], [], BEYOND).state).toBe('dis');
  });

  it('an invisible attacker has advantage; an invisible target gives disadvantage', () => {
    expect(attackAdvantage(['Invisible'], [], WITHIN).state).toBe('adv');
    expect(attackAdvantage([], ['Invisible'], WITHIN).state).toBe('dis');
  });

  it('advantage and disadvantage cancel to a straight roll (5e)', () => {
    // Attacker poisoned (dis) vs a prone target within 5 ft (adv) → cancel.
    const r = attackAdvantage(['Poisoned'], ['Prone'], WITHIN);
    expect(r.state).toBeUndefined();
    expect(r.reasons).toContain('cancel');
  });

  it('folds a manually-requested adv/dis into the result', () => {
    expect(attackAdvantage([], ['Prone'], WITHIN, 'dis').state).toBeUndefined();
    expect(attackAdvantage([], [], WITHIN, 'adv').state).toBe('adv');
  });

  it('is a no-op with no conditions and no manual request', () => {
    expect(attackAdvantage([], [], WITHIN).state).toBeUndefined();
  });
});

describe('autoCritFromConditions', () => {
  it('paralyzed/unconscious target within 5 ft → auto-crit', () => {
    expect(autoCritFromConditions(['Paralyzed'], WITHIN)).toBe('paralyzed');
    expect(autoCritFromConditions(['Unconscious'], WITHIN)).toBe('unconscious');
  });
  it('no auto-crit from beyond 5 ft, or for other conditions', () => {
    expect(autoCritFromConditions(['Paralyzed'], BEYOND)).toBeNull();
    expect(autoCritFromConditions(['Stunned'], WITHIN)).toBeNull(); // stunned ≠ auto-crit
    expect(autoCritFromConditions([], WITHIN)).toBeNull();
  });
});

describe('impliedConditions (cascading)', () => {
  it('Unconscious implies Incapacitated + Prone', () => {
    expect(impliedConditions('Unconscious')).toEqual(['Incapacitated', 'Prone']);
  });
  it('Paralyzed/Stunned/Petrified imply Incapacitated', () => {
    for (const c of ['Paralyzed', 'Stunned', 'Petrified'])
      expect(impliedConditions(c)).toContain('Incapacitated');
  });
  it('plain conditions imply nothing', () => {
    expect(impliedConditions('Poisoned')).toEqual([]);
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
