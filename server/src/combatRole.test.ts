import { describe, it, expect } from 'vitest';
import { deriveCombatRole } from '../../shared/combatRole.js';

describe('deriveCombatRole', () => {
  it('flags spellcasters as caster (wins over weapons)', () => {
    expect(
      deriveCombatRole({
        abilities: [
          { name: 'Spellcasting', description: 'The mage is a 9th-level spellcaster.' },
        ],
        weapons: [{ name: 'Dagger', kind: 'melee' }],
      }),
    ).toBe('caster');
    expect(deriveCombatRole({ className: 'Wizard' })).toBe('caster');
  });

  it('flags ranged weapons / attacks as ranged', () => {
    expect(
      deriveCombatRole({ weapons: [{ name: 'Longbow', kind: 'ranged' }] }),
    ).toBe('ranged');
    expect(
      deriveCombatRole({
        actions: [{ name: 'Crossbow', description: 'Ranged Weapon Attack: +5 to hit.' }],
      }),
    ).toBe('ranged');
    // PC weapons are plain strings.
    expect(deriveCombatRole({ weapons: ['Shortbow'] })).toBe('ranged');
  });

  it('defaults to melee', () => {
    expect(
      deriveCombatRole({
        weapons: [{ name: 'Greatsword', kind: 'melee' }],
        actions: [{ name: 'Slam', description: 'Melee Weapon Attack: +7 to hit.' }],
      }),
    ).toBe('melee');
    // Half-casters read as martial, not caster.
    expect(deriveCombatRole({ className: 'Paladin' })).toBe('melee');
  });
});
