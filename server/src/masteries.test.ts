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

    // Great Weapon Master: +prof damage on a hit, triggers on "heavy"; the weapon
    // shows "GWM" (damage, all heavy) plus "Hew" (extra attack, melee only).
    const gwm = getMastery('Great Weapon Master');
    expect(gwm?.type).toBe('mastery');
    expect(gwm?.mastery?.effect?.profBonusDamage).toBe(true);
    expect(gwm?.mastery?.active).toBe(true);
    expect(gwm?.mastery?.appliesToTags).toEqual(['heavy']);
    expect(gwm?.mastery?.weaponLabel).toBe('GWM');
    expect(gwm?.mastery?.meleeLabel).toBe('Hew');
    expect(searchMasteries('weapon master').some((m) => m.name === 'Great Weapon Master')).toBe(true);

    // A purely manual mastery has no auto effect.
    expect(getMastery('Push')?.mastery?.effect).toBeUndefined();
    expect(getMastery('Nonexistent')).toBeNull();
  });
});
