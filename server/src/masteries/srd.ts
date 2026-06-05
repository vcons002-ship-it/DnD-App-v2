import type { SheetAbility } from '../../../shared/types.js';

/**
 * The eight 2024 weapon-mastery properties (plus the Great Weapon Master feat,
 * offered in the same toggleable format) as addable sheet entries. They live in
 * the character sheet's Spells & Abilities section and are searched alongside
 * spells. Effects that adjust an attack's damage are automated — Graze
 * (ability-mod damage on a miss), Cleave (rolls the second-creature damage), and
 * a generic on-hit damage bonus (Great Weapon Master's +10). The rest are
 * descriptive and resolved manually (conditions, movement, effects on later rolls).
 */
export type MasteryEntry = Omit<SheetAbility, 'id' | 'source'>;

const MASTERIES: MasteryEntry[] = [
  {
    name: 'Graze',
    type: 'mastery',
    meta: 'Greatsword, Glaive',
    description:
      'If your attack roll misses a creature, you can deal damage to it equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and it can be increased only by increasing the ability modifier.',
    mastery: { weapon: '', active: true, effect: { grazeOnMiss: true } },
  },
  {
    name: 'Cleave',
    type: 'mastery',
    meta: 'Greataxe, Halberd',
    description:
      'If you hit a creature with a melee attack using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon’s damage (no ability modifier). Once per turn. While toggled on, a hit rolls that second-creature damage (the weapon’s dice, no ability modifier) for you to apply manually.',
    mastery: { weapon: '', active: false, effect: { cleave: true } },
  },
  {
    name: 'Nick',
    type: 'mastery',
    meta: 'Dagger, Light Hammer, Sickle, Scimitar',
    description:
      'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn. (Resolve the extra attack manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    name: 'Push',
    type: 'mastery',
    meta: 'Greatclub, Pike, Warhammer, Heavy Crossbow',
    description:
      'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from you if it is Large or smaller. (Apply the movement manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    name: 'Sap',
    type: 'mastery',
    meta: 'Mace, Spear, Flail, Longsword, Morningstar, War Pick',
    description:
      'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn. (Track the Disadvantage manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    name: 'Slow',
    type: 'mastery',
    meta: 'Club, Dart, Light Crossbow, Sling, Whip, Shortbow',
    description:
      'If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If hit more than once, the Speed reduction doesn’t exceed 10 feet. (Apply the Speed change manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    name: 'Topple',
    type: 'mastery',
    meta: 'Battleaxe, Lance, Maul, Quarterstaff, Pike',
    description:
      'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 + ability modifier + proficiency bonus). On a failure, the creature has the Prone condition. (Roll the save / apply Prone manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    name: 'Vex',
    type: 'mastery',
    meta: 'Hand Crossbow, Longbow, Shortsword, Rapier, Scimitar',
    description:
      'If you hit a creature with this weapon and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn. (Apply the Advantage manually.)',
    mastery: { weapon: '', active: false },
  },
  {
    // Not a mastery property — the Great Weapon Master feat's power-attack damage,
    // offered in the same toggleable format (weapon binding + on/off + effect).
    name: 'Great Weapon Master',
    type: 'mastery',
    meta: 'Feat · Heavy melee weapons',
    description:
      'While toggled on, your hits with the bound Heavy weapon deal +10 damage (the Great Weapon Master power attack). Toggle off to attack normally. The classic −5 to-hit tradeoff is not applied automatically.',
    mastery: { weapon: '', active: false, effect: { bonusDamage: '10' } },
  },
];

/** Search the local mastery list (prefix-first, then substring). */
export function searchMasteries(query: string, limit = 12): MasteryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return MASTERIES.slice(0, limit);
  const matches = MASTERIES.filter((m) => m.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) local mastery lookup. */
export function getMastery(name: string): MasteryEntry | null {
  const q = name.trim().toLowerCase();
  return MASTERIES.find((m) => m.name.toLowerCase() === q) ?? null;
}
