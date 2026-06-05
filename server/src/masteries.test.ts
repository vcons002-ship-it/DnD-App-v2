import { describe, it, expect } from 'vitest';
import { searchMasteries, getMastery } from './masteries/srd.js';

describe('weapon mastery database', () => {
  it('offers per-weapon mastery entries showing the weapon mechanic', () => {
    // Entries are named "<Weapon> Mastery"; the weapon label is the mechanic.
    const longbow = getMastery('Longbow Mastery');
    expect(longbow?.type).toBe('mastery');
    expect(longbow?.mastery?.weaponLabel).toBe('Slow');
    expect(longbow?.mastery?.appliesToTags).toEqual(['longbow']);
    expect(longbow?.mastery?.effect).toBeUndefined(); // Slow is manual

    // Greataxe → Cleave (auto effect); Greatsword → Graze (auto, active).
    const greataxe = getMastery('Greataxe Mastery');
    expect(greataxe?.mastery?.weaponLabel).toBe('Cleave');
    expect(greataxe?.mastery?.effect?.cleave).toBe(true);
    expect(getMastery('Greatsword Mastery')?.mastery?.effect?.grazeOnMiss).toBe(true);
    expect(getMastery('Greatsword Mastery')?.mastery?.active).toBe(true);
  });

  it('searches by weapon name OR by mechanic', () => {
    expect(searchMasteries('longbow').some((m) => m.name === 'Longbow Mastery')).toBe(true);
    // "slow" finds every weapon whose mastery property is Slow.
    const slow = searchMasteries('slow');
    expect(slow.length).toBeGreaterThan(1);
    expect(slow.every((m) => m.mastery?.weaponLabel === 'Slow')).toBe(true);
    expect(getMastery('Nonexistent Mastery')).toBeNull();
  });

  it('keeps Great Weapon Master as a feat: GWM damage + melee-only Hew', () => {
    const gwm = getMastery('Great Weapon Master');
    expect(gwm?.mastery?.effect?.profBonusDamage).toBe(true);
    expect(gwm?.mastery?.active).toBe(true);
    expect(gwm?.mastery?.appliesToTags).toEqual(['heavy']);
    expect(gwm?.mastery?.weaponLabel).toBe('GWM');
    expect(gwm?.mastery?.meleeLabel).toBe('Hew');
    expect(searchMasteries('gwm').some((m) => m.name === 'Great Weapon Master')).toBe(true);
  });
});
