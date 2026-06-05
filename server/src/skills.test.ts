import { describe, it, expect } from 'vitest';
import {
  abilityMod,
  proficiencyBonus,
  skillBonus,
  SKILLS,
} from '../../shared/skills.js';

describe('skills math', () => {
  it('computes ability modifiers (5e)', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(16)).toBe(3);
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(undefined)).toBe(0);
  });

  it('scales proficiency bonus by level', () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(17)).toBe(6);
  });

  it('adds proficiency bonus only when proficient', () => {
    const stats = { DEX: 16 }; // +3
    expect(skillBonus(stats, 'DEX', 5, false)).toBe(3); // mod only
    expect(skillBonus(stats, 'DEX', 5, true)).toBe(6); // +3 prof at level 5
  });

  it('has the 18 standard skills', () => {
    expect(SKILLS).toHaveLength(18);
    expect(SKILLS.map((s) => s.name)).toContain('Perception');
  });
});
