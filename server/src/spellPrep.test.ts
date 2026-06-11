import { describe, it, expect } from 'vitest';
import {
  parseActionType,
  cantripsKnown,
  spellCapacity,
} from '../../shared/spellPrep.js';

describe('spellPrep helpers', () => {
  it('parses the action type from a casting-time meta', () => {
    expect(parseActionType('1 bonus action · 60 ft · V')).toBe('bonus');
    expect(parseActionType('1 reaction, which you take when…')).toBe('reaction');
    expect(parseActionType('1 action · 120 ft · V,S')).toBe('action');
    expect(parseActionType(undefined)).toBeUndefined();
    expect(parseActionType('10 minutes · Self')).toBeUndefined();
  });

  it('cantrips known scales by class & level; martials learn none', () => {
    expect(cantripsKnown('Wizard', 1)).toBe(4);
    expect(cantripsKnown('Wizard', 10)).toBe(6);
    expect(cantripsKnown('Cleric', 1)).toBe(3);
    expect(cantripsKnown('Fighter', 5)).toBe(0);
  });

  it('spell capacity: prepared casters use mod+level, known casters a table', () => {
    const wiz = spellCapacity('Wizard', 5, { INT: 18 }); // +4 + 5 = 9
    expect(wiz).toEqual({ kind: 'prepared', max: 9 });
    const cleric = spellCapacity('Cleric', 3, { WIS: 16 }); // +3 + 3 = 6
    expect(cleric).toEqual({ kind: 'prepared', max: 6 });
    const bard = spellCapacity('Bard', 1, {}); // known table → 4
    expect(bard).toEqual({ kind: 'known', max: 4 });
    expect(spellCapacity('Fighter', 5, {})).toBeNull();
  });
});
