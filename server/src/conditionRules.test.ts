import { describe, it, expect } from 'vitest';
import { conditionRule, CONDITION_RULES } from '../../shared/conditionRules.js';
import { recapSession } from './assistant/index.js';

// The standard conditions the UI offers (client/src/lib/conditions.ts) — kept in
// sync here so the server build doesn't import a client file.
const STANDARD_CONDITIONS = [
  'Blinded', 'Charmed', 'Dead', 'Deafened', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
];

describe('conditionRule', () => {
  it('returns rules text for standard conditions (case-insensitive)', () => {
    expect(conditionRule('Prone')).toMatch(/crawl/i);
    expect(conditionRule('poisoned')).toMatch(/disadvantage/i);
    expect(conditionRule('PARALYZED')).toMatch(/critical hit/i);
  });

  it('returns empty string for unknown / custom labels', () => {
    expect(conditionRule('On Fire')).toBe('');
    expect(conditionRule('')).toBe('');
  });

  it('covers every standard condition the UI offers (except custom buffs)', () => {
    for (const label of STANDARD_CONDITIONS) {
      expect(CONDITION_RULES[label.toLowerCase()], `missing rule for ${label}`).toBeTruthy();
    }
  });
});

describe('recapSession', () => {
  it('returns null for an empty transcript without calling a backend', async () => {
    expect(await recapSession('   ')).toBeNull();
  });
});
