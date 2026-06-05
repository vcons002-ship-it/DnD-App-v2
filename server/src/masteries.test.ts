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

    // Cleave now rolls the second-creature damage.
    expect(getMastery('Cleave')?.mastery?.effect?.cleave).toBe(true);

    // Great Weapon Master is offered in the same toggleable format (+10 on hit).
    const gwm = getMastery('Great Weapon Master');
    expect(gwm?.type).toBe('mastery');
    expect(gwm?.mastery?.effect?.bonusDamage).toBe('10');
    expect(gwm?.mastery?.active).toBe(false);
    expect(searchMasteries('great').some((m) => m.name === 'Great Weapon Master')).toBe(true);

    // A purely manual mastery has no auto effect.
    expect(getMastery('Push')?.mastery?.effect).toBeUndefined();
    expect(getMastery('Nonexistent')).toBeNull();
  });
});
