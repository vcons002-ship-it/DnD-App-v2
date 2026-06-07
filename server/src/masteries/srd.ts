import type { SheetAbility, WeaponMastery } from '../../../shared/types.js';

/**
 * Weapon masteries (2024 rules), modeled per the books: a character gains
 * mastery in specific WEAPONS, and each weapon grants one mastery PROPERTY
 * (its mechanic). So the addable entries are named "<Weapon> Mastery"
 * (e.g. "Longbow Mastery") and carry that weapon's mechanic as `weaponLabel`
 * (e.g. "Slow"), which is what shows on the weapon's stat line.
 *
 * A mastery triggers on any attack with a weapon whose `tags` overlap its
 * `appliesToTags` (here, the weapon's type tag like "longbow") — so just tag
 * your weapons. Mechanics that adjust an attack's damage are automated (Graze,
 * Cleave); the rest are descriptive and resolved manually. Great Weapon Master
 * (a feat, not a weapon mastery) is offered in the same format.
 */
export type MasteryEntry = Omit<SheetAbility, 'id' | 'source'>;

/** The eight mastery properties — the mechanic a weapon grants. */
type Mechanic = { active: boolean; description: string; effect?: WeaponMastery['effect'] };

const MECHANICS: Record<string, Mechanic> = {
  Graze: {
    active: true,
    effect: { grazeOnMiss: true },
    description:
      'If your attack roll misses a creature, you can deal damage to it equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and it can be increased only by increasing the ability modifier.',
  },
  Cleave: {
    active: false,
    effect: { cleave: true },
    description:
      'If you hit a creature with a melee attack using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon’s damage but no ability modifier. Once per turn. To use: after your normal hit, toggle this on and attack the second creature (make it the target) — on a hit it takes the weapon’s damage minus your ability modifier, and Cleave switches itself back off.',
  },
  Nick: {
    active: false,
    description:
      'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn. (Resolve the extra attack manually.)',
  },
  Push: {
    active: false,
    description:
      'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from you if it is Large or smaller. (Apply the movement manually.)',
  },
  Sap: {
    active: false,
    description:
      'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn. (Track the Disadvantage manually.)',
  },
  Slow: {
    active: false,
    description:
      'If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. (Apply the Speed change manually.)',
  },
  Topple: {
    active: false,
    description:
      'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 + ability modifier + proficiency bonus). On a failure, the creature has the Prone condition. (Roll the save / apply Prone manually.)',
  },
  Vex: {
    active: false,
    description:
      'If you hit a creature with this weapon and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn. (Apply the Advantage manually.)',
  },
};

/** Each 2024 weapon and the mastery property it grants. */
const WEAPON_MASTERY: Record<string, keyof typeof MECHANICS> = {
  // Simple melee
  Club: 'Slow', Dagger: 'Nick', Greatclub: 'Push', Handaxe: 'Vex', Javelin: 'Slow',
  'Light Hammer': 'Nick', Mace: 'Sap', Quarterstaff: 'Topple', Sickle: 'Nick', Spear: 'Sap',
  // Simple ranged
  Dart: 'Vex', 'Light Crossbow': 'Slow', Shortbow: 'Vex', Sling: 'Slow',
  // Martial melee
  Battleaxe: 'Topple', Flail: 'Sap', Glaive: 'Graze', Greataxe: 'Cleave', Greatsword: 'Graze',
  Halberd: 'Cleave', Lance: 'Topple', Longsword: 'Sap', Maul: 'Topple', Morningstar: 'Sap',
  Pike: 'Push', Rapier: 'Vex', Scimitar: 'Nick', Shortsword: 'Vex', Trident: 'Topple',
  'War Pick': 'Sap', Warhammer: 'Push', Whip: 'Slow',
  // Martial ranged
  Blowgun: 'Vex', 'Hand Crossbow': 'Vex', 'Heavy Crossbow': 'Push', Longbow: 'Slow',
  Musket: 'Slow', Pistol: 'Vex',
};

const WEAPON_MASTERIES: MasteryEntry[] = Object.entries(WEAPON_MASTERY).map(([weapon, mech]) => {
  const m = MECHANICS[mech];
  return {
    name: `${weapon} Mastery`,
    type: 'mastery' as const,
    meta: `${weapon} · ${mech} mastery property`,
    description: m.description,
    mastery: {
      appliesToTags: [weapon.toLowerCase()],
      active: m.active,
      weaponLabel: mech,
      effect: m.effect,
    },
  };
});

/** The 2024 Great Weapon Master feat — in the same toggleable format. */
const GREAT_WEAPON_MASTER: MasteryEntry = {
  name: 'Great Weapon Master',
  type: 'mastery',
  meta: 'Feat · Heavy weapons (tag: heavy)',
  description:
    'Damage (GWM): when you hit a creature with a Heavy weapon as part of the Attack action on your turn, you can deal extra damage to the target equal to your proficiency bonus (once per turn). While toggled on, that proficiency-bonus damage is added automatically to your hits with any weapon tagged "heavy" (melee or ranged). Extra attack (Hew): immediately after you score a Critical Hit, or reduce a creature to 0 HP, with a Heavy MELEE weapon, you can make one attack with it as a Bonus Action (resolve that attack manually).',
  mastery: {
    appliesToTags: ['heavy'],
    active: true,
    effect: { profBonusDamage: true },
    weaponLabel: 'GWM',
    meleeLabel: 'Hew',
  },
};

const MASTERIES: MasteryEntry[] = [...WEAPON_MASTERIES, GREAT_WEAPON_MASTER];

const matchesQuery = (m: MasteryEntry, q: string): boolean =>
  m.name.toLowerCase().includes(q) ||
  (m.mastery?.weaponLabel ?? '').toLowerCase().includes(q) ||
  (m.meta ?? '').toLowerCase().includes(q) || // "… mastery property" → findable by "mastery"
  (q.length >= 4 && 'mastery'.includes(q)); // category match without flooding on short queries

/**
 * Search masteries by weapon name ("longbow") OR by mechanic ("slow"), so you
 * can add the entry for your weapon or browse everything with a given property.
 */
export function searchMasteries(query: string, limit = 12): MasteryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return MASTERIES.slice(0, limit);
  const matches = MASTERIES.filter((m) => matchesQuery(m, q));
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) lookup by entry name (e.g. "Longbow Mastery"). */
export function getMastery(name: string): MasteryEntry | null {
  const q = name.trim().toLowerCase();
  return MASTERIES.find((m) => m.name.toLowerCase() === q) ?? null;
}
