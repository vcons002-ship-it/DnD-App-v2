import { describe, it, expect } from 'vitest';
import { searchNaturalAttacks } from './attacks/natural.js';

describe('natural attacks library', () => {
  it('returns a default list when the query is empty', () => {
    const all = searchNaturalAttacks('');
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.natural === true)).toBe(true);
  });

  it('searches by name (prefix-first) and damage type', () => {
    const bite = searchNaturalAttacks('bite');
    expect(bite[0]?.name).toBe('Bite');
    expect(bite[0]).toMatchObject({ kind: 'melee', damage: '1d6', damageType: 'piercing' });

    const slashing = searchNaturalAttacks('slashing');
    expect(slashing.length).toBeGreaterThan(0);
    expect(slashing.every((a) => a.damageType === 'slashing')).toBe(true);
  });
});
