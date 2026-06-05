import type { SheetAbility } from '../../../shared/types.js';

/**
 * The eight 2024 weapon-mastery properties (plus Hew — the Great Weapon Master
 * feat, offered in the same format) as addable sheet entries. They live in the
 * character sheet's Spells & Abilities section and are searched alongside spells.
 *
 * A mastery triggers on any attack with a weapon whose `tags` overlap the
 * mastery's `appliesToTags` (e.g. a weapon tagged "greataxe" or "heavy") — so
 * there is no per-weapon binding; just tag your weapons. Effects that adjust an
 * attack's damage are automated — Graze (ability-mod damage on a miss), Cleave
 * (weapon damage minus the ability modifier, then one-shot off), and Hew
 * (proficiency-bonus damage on a hit). The rest are descriptive and resolved
 * manually (conditions, movement, extra attacks, effects on later rolls).
 */
export type MasteryEntry = Omit<SheetAbility, 'id' | 'source'>;

const MASTERIES: MasteryEntry[] = [
  {
    name: 'Graze',
    type: 'mastery',
    meta: 'Greatsword, Glaive',
    description:
      'If your attack roll misses a creature, you can deal damage to it equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and it can be increased only by increasing the ability modifier.',
    mastery: { appliesToTags: ['greatsword', 'glaive'], active: true, effect: { grazeOnMiss: true } },
  },
  {
    name: 'Cleave',
    type: 'mastery',
    meta: 'Greataxe, Halberd',
    description:
      'If you hit a creature with a melee attack using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon’s damage but no ability modifier. Once per turn. To use: after your normal hit, toggle this on and attack the second creature (make it the target) — on a hit it takes the weapon’s damage minus your ability modifier, and Cleave switches itself back off.',
    mastery: { appliesToTags: ['greataxe', 'halberd'], active: false, effect: { cleave: true } },
  },
  {
    name: 'Nick',
    type: 'mastery',
    meta: 'Dagger, Light Hammer, Sickle, Scimitar',
    description:
      'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn. (Resolve the extra attack manually.)',
    mastery: { appliesToTags: ['dagger', 'light hammer', 'sickle', 'scimitar'], active: false },
  },
  {
    name: 'Push',
    type: 'mastery',
    meta: 'Greatclub, Pike, Warhammer, Heavy Crossbow',
    description:
      'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from you if it is Large or smaller. (Apply the movement manually.)',
    mastery: { appliesToTags: ['greatclub', 'pike', 'warhammer', 'heavy crossbow'], active: false },
  },
  {
    name: 'Sap',
    type: 'mastery',
    meta: 'Mace, Spear, Flail, Longsword, Morningstar, War Pick',
    description:
      'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn. (Track the Disadvantage manually.)',
    mastery: {
      appliesToTags: ['mace', 'spear', 'flail', 'longsword', 'morningstar', 'war pick'],
      active: false,
    },
  },
  {
    name: 'Slow',
    type: 'mastery',
    meta: 'Club, Dart, Light Crossbow, Sling, Whip, Shortbow, Longbow',
    description:
      'If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If hit more than once, the Speed reduction doesn’t exceed 10 feet. (Apply the Speed change manually.)',
    mastery: {
      appliesToTags: ['club', 'dart', 'light crossbow', 'sling', 'whip', 'shortbow', 'longbow'],
      active: false,
    },
  },
  {
    name: 'Topple',
    type: 'mastery',
    meta: 'Battleaxe, Lance, Maul, Quarterstaff, Pike',
    description:
      'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 + ability modifier + proficiency bonus). On a failure, the creature has the Prone condition. (Roll the save / apply Prone manually.)',
    mastery: {
      appliesToTags: ['battleaxe', 'lance', 'maul', 'quarterstaff', 'pike'],
      active: false,
    },
  },
  {
    name: 'Vex',
    type: 'mastery',
    meta: 'Hand Crossbow, Longbow, Shortsword, Rapier, Scimitar',
    description:
      'If you hit a creature with this weapon and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn. (Apply the Advantage manually.)',
    mastery: {
      appliesToTags: ['hand crossbow', 'longbow', 'shortsword', 'rapier', 'scimitar'],
      active: false,
    },
  },
  {
    // The 2024 Great Weapon Master feat, offered in the same toggleable mastery
    // format. The proficiency-bonus damage is automated; the bonus attack is manual.
    name: 'Hew',
    type: 'mastery',
    meta: 'Heavy melee weapons (tag: heavy)',
    description:
      'Great Weapon Master. Damage: when you hit a creature with a Heavy weapon as part of the Attack action on your turn, you can deal extra damage to the target equal to your proficiency bonus (once per turn). While toggled on, that proficiency-bonus damage is added to your hits with any weapon tagged "heavy". Extra attack: immediately after you score a Critical Hit, or reduce a creature to 0 HP, with a Heavy weapon, you can make one attack with it as a Bonus Action (resolve that attack manually).',
    mastery: { appliesToTags: ['heavy'], active: true, effect: { profBonusDamage: true } },
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
