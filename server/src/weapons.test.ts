import { describe, it, expect } from 'vitest';
import { searchWeapons, getWeapon, weaponTags } from './weapons/srd.js';

describe('2024 weapon database', () => {
  it('looks up weapons with their dice, type, properties, and mastery', () => {
    const longsword = getWeapon('Longsword');
    expect(longsword?.kind).toBe('melee');
    expect(longsword?.damage).toBe('1d8');
    expect(longsword?.versatileDamage).toBe('1d10'); // versatile
    expect(longsword?.damageType).toBe('slashing');
    expect(longsword?.properties).toContain('versatile');
    expect(longsword?.mastery).toBe('Sap');

    const rapier = getWeapon('rapier');
    expect(rapier?.properties).toEqual(expect.arrayContaining(['finesse']));

    const longbow = getWeapon('Longbow');
    expect(longbow?.kind).toBe('ranged');
    expect(longbow?.properties).toEqual(expect.arrayContaining(['heavy', 'two-handed', 'ammunition']));
    expect(getWeapon('Nonexistent')).toBeNull();
  });

  it('derives sheet tags = type name + properties', () => {
    const tags = weaponTags(getWeapon('Halberd')!);
    expect(tags).toEqual(expect.arrayContaining(['halberd', 'heavy', 'reach', 'two-handed']));
  });

  it('searches by name, property, or mastery', () => {
    expect(searchWeapons('long').some((w) => w.name === 'Longsword')).toBe(true);
    expect(searchWeapons('finesse').every((w) => w.properties.includes('finesse'))).toBe(true);
    // Mastery search: every weapon whose mastery property is Cleave.
    const cleave = searchWeapons('cleave');
    expect(cleave.length).toBeGreaterThan(0);
    expect(cleave.every((w) => w.mastery === 'Cleave')).toBe(true);
  });
});
