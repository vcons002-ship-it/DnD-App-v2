import { describe, it, expect } from 'vitest';
import { searchMasteries, getMastery } from './masteries/srd.js';

describe('weapon mastery database', () => {
  it('exposes the standard masteries and marks Graze as auto-effecting', () => {
    const all = searchMasteries('');
    const names = all.map((m) => m.name);
    expect(names).toEqual(
      expect.arrayContaining(['Graze', 'Cleave', 'Push', 'Sap', 'Topple', 'Vex']),
    );
    expect(all.every((m) => m.type === 'mastery')).toBe(true);

    const graze = getMastery('graze');
    expect(graze?.mastery?.effect?.grazeOnMiss).toBe(true);
    expect(graze?.mastery?.active).toBe(true);

    // Cleave rolls the second-creature damage; triggers on greataxe/halberd tags.
    expect(getMastery('Cleave')?.mastery?.effect?.cleave).toBe(true);
    expect(getMastery('Cleave')?.mastery?.appliesToTags).toEqual(['greataxe', 'halberd']);

    // Hew (2024 Great Weapon Master) adds proficiency-bonus damage on a hit and
    // triggers on any weapon tagged "heavy".
    const hew = getMastery('Hew');
    expect(hew?.type).toBe('mastery');
    expect(hew?.mastery?.effect?.profBonusDamage).toBe(true);
    expect(hew?.mastery?.active).toBe(true);
    expect(hew?.mastery?.appliesToTags).toEqual(['heavy']);
    expect(searchMasteries('hew').some((m) => m.name === 'Hew')).toBe(true);

    // A purely manual mastery has no auto effect.
    expect(getMastery('Push')?.mastery?.effect).toBeUndefined();
    expect(getMastery('Nonexistent')).toBeNull();
  });
});
