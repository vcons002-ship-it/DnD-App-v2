import type { SheetAbility } from '../../../shared/types.js';

/**
 * Racial (species) traits, kept DELIBERATELY separate from `features/srd.ts`.
 *
 * A player who gets Savage Attacks from their Half-Orc shouldn't have to find it
 * filed under "Feat" — where it isn't even the same mechanic (the Savage Attacker
 * FEAT rerolls the damage dice and keeps the better; the Half-Orc TRAIT adds one
 * extra die on a crit). Same reasoning as class features living in their own
 * module: the label a player reads has to match where the ability came from.
 *
 * Both rules editions are covered and each entry says which it's from, because
 * 2024 removed Half-Orc and Half-Elf as species and promoted Orc to one of its
 * own — a table part-way through the switch needs to see both.
 *
 * Traits with real mechanics carry a `stance`/`roll`/`useCounter`; the rest are
 * descriptive, exactly as the curated class features are. Descriptions are short
 * original paraphrases of SRD rules, not verbatim text.
 */
export type RaceTrait = Omit<SheetAbility, 'id' | 'source'> & {
  /** Species this belongs to, e.g. "Half-Orc". Drives the "my race" search. */
  race: string;
  /** Which rules edition it comes from. */
  edition: '2014' | '2024';
};

/** Build the shared bits so every entry is labelled and searchable the same way. */
const trait = (
  race: string,
  edition: '2014' | '2024',
  a: Omit<SheetAbility, 'id' | 'source' | 'school' | 'tags'> & { tags?: string[] },
): RaceTrait => ({
  ...a,
  race,
  edition,
  // The add-picker renders `school` as the subtitle, so this is what a player
  // actually reads next to the trait's name.
  school: `${race} trait (${edition})`,
  tags: [
    'race',
    'racial',
    'trait',
    race.toLowerCase(),
    ...race.toLowerCase().split('-'),
    edition,
    ...(a.tags ?? []),
  ],
});

const RACE_TRAITS: RaceTrait[] = [
  // ---- Orc (2024) ---------------------------------------------------------
  trait('Orc', '2024', {
    name: 'Adrenaline Rush',
    type: 'ability',
    meta: 'Bonus action · Dash + temp HP · prof/long rest',
    description:
      'As a Bonus Action you can Dash, and gain temporary hit points equal to your Proficiency Bonus. You can do this a number of times equal to your Proficiency Bonus, regaining all uses on a Short or Long Rest.',
    useCounter: { name: 'Adrenaline Rush', max: 2 },
    tags: ['dash', 'temp hp', 'bonus action'],
  }),
  trait('Orc', '2024', {
    name: 'Relentless Endurance',
    type: 'ability',
    meta: '1/long rest · drop to 1 HP instead of 0',
    description:
      'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, you must finish a Long Rest before using it again.',
    useCounter: { name: 'Relentless Endurance', max: 1 },
    tags: ['survive', 'hp'],
  }),
  trait('Orc', '2024', {
    name: 'Darkvision (Orc)',
    type: 'ability',
    meta: 'Passive · 120 ft',
    description:
      'You can see in dim light within 120 feet as if it were bright light, and in darkness as if it were dim light. You discern colour in darkness only as shades of grey.',
    tags: ['darkvision', 'senses'],
  }),

  // ---- Half-Orc (2014 — removed as a species in 2024) ---------------------
  trait('Half-Orc', '2014', {
    name: 'Savage Attacks',
    type: 'stance',
    meta: 'Passive · extra weapon die on a critical hit',
    description:
      "When you score a critical hit with a melee weapon attack, roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit. Leave this switched on — it is a passive, and it only fires on a crit. (This is the RACIAL trait: it ADDS a die on a crit. The Savage Attacker FEAT is a different rule — it rerolls the damage dice and keeps the better total.)",
    stance: { active: false, appliesTo: 'melee', extraCritDie: true },
    tags: ['savage', 'crit', 'critical', 'damage', 'melee'],
  }),
  trait('Half-Orc', '2014', {
    name: 'Relentless Endurance (Half-Orc)',
    type: 'ability',
    meta: '1/long rest · drop to 1 HP instead of 0',
    description:
      'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, you must finish a Long Rest before using it again.',
    useCounter: { name: 'Relentless Endurance', max: 1 },
    tags: ['survive', 'hp'],
  }),
  trait('Half-Orc', '2014', {
    name: 'Menacing',
    type: 'ability',
    meta: 'Passive · proficiency in Intimidation',
    description: 'You gain proficiency in the Intimidation skill.',
    tags: ['intimidation', 'skill'],
  }),

  // ---- Half-Elf (2014 — removed as a species in 2024) --------------------
  trait('Half-Elf', '2014', {
    name: 'Fey Ancestry (Half-Elf)',
    type: 'ability',
    meta: 'Passive · advantage vs charm, no magical sleep',
    description:
      'You have advantage on saving throws against being charmed, and magic cannot put you to sleep.',
    tags: ['charm', 'sleep', 'save'],
  }),
  trait('Half-Elf', '2014', {
    name: 'Skill Versatility',
    type: 'ability',
    meta: 'Passive · two extra skill proficiencies',
    description:
      'You gain proficiency in two skills of your choice. (Tick them on the Skills list.)',
    tags: ['skill', 'proficiency'],
  }),

  // ---- Dwarf --------------------------------------------------------------
  trait('Dwarf', '2024', {
    name: 'Dwarven Resilience',
    type: 'ability',
    meta: 'Passive · poison resistance + advantage on poison saves',
    description:
      'You have resistance to poison damage and advantage on saving throws you make to avoid or end the Poisoned condition. (Add "poison" to Resistances on the sheet.)',
    tags: ['poison', 'resistance', 'save'],
  }),
  trait('Dwarf', '2024', {
    name: 'Dwarven Toughness',
    type: 'ability',
    meta: 'Passive · +1 max HP per level',
    description:
      'Your hit point maximum increases by 1, and it increases by 1 again whenever you gain a level. (Adjust Max HP on the sheet.)',
    tags: ['hp', 'toughness'],
  }),
  trait('Dwarf', '2024', {
    name: 'Stonecunning',
    type: 'ability',
    meta: 'Bonus action · tremorsense 60 ft · prof/long rest',
    description:
      'As a Bonus Action you gain Tremorsense with a range of 60 feet for 10 minutes, so long as you are on a stone surface. Usable a number of times equal to your Proficiency Bonus per Long Rest.',
    useCounter: { name: 'Stonecunning', max: 2 },
    tags: ['tremorsense', 'stone', 'bonus action'],
  }),

  // ---- Elf ----------------------------------------------------------------
  trait('Elf', '2024', {
    name: 'Fey Ancestry',
    type: 'ability',
    meta: 'Passive · advantage vs charm',
    description: 'You have advantage on saving throws you make to avoid or end the Charmed condition.',
    tags: ['charm', 'save'],
  }),
  trait('Elf', '2024', {
    name: 'Trance',
    type: 'ability',
    meta: 'Passive · 4-hour long rest',
    description:
      'You do not need to sleep, and magic cannot put you to sleep. You can finish a Long Rest in 4 hours of light meditative activity.',
    tags: ['rest', 'sleep'],
  }),
  trait('Elf', '2024', {
    name: 'Keen Senses',
    type: 'ability',
    meta: 'Passive · Insight, Perception, or Survival proficiency',
    description:
      'You gain proficiency in the Insight, Perception, or Survival skill. (Tick it on the Skills list.)',
    tags: ['skill', 'perception', 'proficiency'],
  }),

  // ---- Halfling -----------------------------------------------------------
  trait('Halfling', '2024', {
    name: 'Lucky',
    type: 'ability',
    meta: 'Passive · reroll a 1 on a d20 test',
    description:
      'When you roll a 1 on the d20 of a D20 Test, you can reroll the die and must use the new roll.',
    tags: ['luck', 'reroll', 'd20'],
  }),
  trait('Halfling', '2024', {
    name: 'Brave',
    type: 'ability',
    meta: 'Passive · advantage vs frightened',
    description: 'You have advantage on saving throws you make to avoid or end the Frightened condition.',
    tags: ['fear', 'frightened', 'save'],
  }),
  trait('Halfling', '2024', {
    name: 'Halfling Nimbleness',
    type: 'ability',
    meta: 'Passive · move through larger creatures',
    description: "You can move through the space of any creature that is a size larger than you.",
    tags: ['movement', 'nimble'],
  }),
  trait('Halfling', '2024', {
    name: 'Naturally Stealthy',
    type: 'ability',
    meta: 'Passive · hide behind a bigger creature',
    description:
      'You can take the Hide action even when obscured only by a creature at least one size larger than you.',
    tags: ['stealth', 'hide'],
  }),

  // ---- Dragonborn ---------------------------------------------------------
  trait('Dragonborn', '2024', {
    name: 'Breath Weapon',
    type: 'ability',
    meta: 'Action (replaces an attack) · DEX save · prof/long rest',
    description:
      'When you take the Attack action you can replace one attack with an exhalation in a 15-foot cone or a 30-foot line. Each creature in the area makes a Dexterity save against your draconic save DC, taking damage of your ancestry type on a failure and half as much on a success. The damage is 1d10, rising to 2d10 at level 5, 3d10 at 11, and 4d10 at 17. Usable a number of times equal to your Proficiency Bonus per Long Rest. (Set the damage type to match your ancestry.)',
    roll: { kind: 'save', dice: '1d10', save: 'DEX', damageType: 'fire' },
    useCounter: { name: 'Breath Weapon', max: 2 },
    tags: ['breath', 'cone', 'line', 'damage', 'save'],
  }),
  trait('Dragonborn', '2024', {
    name: 'Draconic Resistance',
    type: 'ability',
    meta: 'Passive · resistance to your ancestry damage type',
    description:
      'You have resistance to the damage type of your draconic ancestry. (Add it to Resistances on the sheet.)',
    tags: ['resistance', 'draconic'],
  }),

  // ---- Gnome --------------------------------------------------------------
  trait('Gnome', '2024', {
    name: 'Gnomish Cunning',
    type: 'ability',
    meta: 'Passive · advantage on INT/WIS/CHA saves',
    description: 'You have advantage on Intelligence, Wisdom, and Charisma saving throws.',
    tags: ['save', 'cunning'],
  }),

  // ---- Goliath ------------------------------------------------------------
  trait('Goliath', '2024', {
    name: "Large Form",
    type: 'stance',
    meta: 'Bonus action · Large size + advantage on STR checks · 1/long rest',
    description:
      'Starting at level 5, as a Bonus Action you become Large for 10 minutes, gaining advantage on Strength checks and +10 feet of speed. Once per Long Rest.',
    stance: { active: false, appliesTo: 'all' },
    useCounter: { name: 'Large Form', max: 1 },
    tags: ['large', 'size', 'strength'],
  }),
  trait('Goliath', '2024', {
    name: 'Powerful Build',
    type: 'ability',
    meta: 'Passive · count as one size larger for carrying',
    description:
      'You have advantage on saves against being Grappled, and you count as one size larger when determining your carrying capacity.',
    tags: ['carry', 'grapple', 'build'],
  }),

  // ---- Human --------------------------------------------------------------
  trait('Human', '2024', {
    name: 'Resourceful',
    type: 'ability',
    meta: 'Passive · one Heroic Inspiration per long rest',
    description: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
    useCounter: { name: 'Heroic Inspiration', max: 1 },
    tags: ['inspiration', 'resourceful'],
  }),
  trait('Human', '2024', {
    name: 'Skillful',
    type: 'ability',
    meta: 'Passive · one extra skill proficiency',
    description: 'You gain proficiency in one skill of your choice. (Tick it on the Skills list.)',
    tags: ['skill', 'proficiency'],
  }),

  // ---- Tiefling -----------------------------------------------------------
  trait('Tiefling', '2024', {
    name: 'Fiendish Legacy',
    type: 'ability',
    meta: 'Passive · legacy spells + a damage resistance',
    description:
      'You gain a cantrip and, at higher levels, spells determined by your fiendish legacy (Abyssal, Chthonic, or Infernal), plus resistance to that legacy’s damage type. (Add the spells and resistance to the sheet.)',
    tags: ['spellcasting', 'resistance', 'fiend'],
  }),
  trait('Tiefling', '2024', {
    name: 'Otherworldly Presence',
    type: 'ability',
    meta: 'Passive · Thaumaturgy cantrip',
    description:
      'You know the Thaumaturgy cantrip, cast with the spellcasting ability of your fiendish legacy.',
    tags: ['cantrip', 'thaumaturgy'],
  }),

  // ---- Aasimar ------------------------------------------------------------
  trait('Aasimar', '2024', {
    name: 'Healing Hands',
    type: 'ability',
    meta: 'Action · heal prof × d4 · 1/long rest',
    description:
      'As a Magic action you touch a creature and roll a number of d4s equal to your Proficiency Bonus; the creature regains that many hit points. Once per Long Rest.',
    roll: { kind: 'heal', dice: '2d4' },
    useCounter: { name: 'Healing Hands', max: 1 },
    tags: ['heal', 'touch'],
  }),
  trait('Aasimar', '2024', {
    name: 'Celestial Revelation',
    type: 'stance',
    meta: 'Bonus action · transform, extra radiant/necrotic damage · 1/long rest',
    description:
      'From level 3, as a Bonus Action you transform for 1 minute, gaining flight, a necrotic shroud, or radiant consumption. Once per turn while transformed you add your Proficiency Bonus in extra damage to one damaging attack or spell. Once per Long Rest.',
    stance: { active: false, appliesTo: 'all', bonusDamage: '2' },
    useCounter: { name: 'Celestial Revelation', max: 1 },
    tags: ['radiant', 'necrotic', 'transform'],
  }),
];

const haystack = (t: RaceTrait): string =>
  [t.name, t.school, t.race, t.edition, ...(t.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Search racial traits by name, race, edition, or tag (name-prefix first).
 *  Mirrors `searchFeatures` so the merged "+ Add spell / ability" results rank
 *  consistently no matter which source an entry came from. */
export function searchRaceTraits(query: string, limit = 25): RaceTrait[] {
  const q = query.trim().toLowerCase();
  if (!q) return RACE_TRAITS.slice(0, limit);
  const matches = RACE_TRAITS.filter((t) => haystack(t).includes(q));
  matches.sort((a, b) => {
    // A race name typed in full ("half-orc") should list that race's traits
    // first — that's the whole point of the "my race" button.
    const ar = a.race.toLowerCase() === q ? 0 : 1;
    const br = b.race.toLowerCase() === q ? 0 : 1;
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ar - br || ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) lookup by trait name. */
export function getRaceTrait(name: string): RaceTrait | null {
  const q = name.trim().toLowerCase();
  return RACE_TRAITS.find((t) => t.name.toLowerCase() === q) ?? null;
}

/** Every trait for a species, e.g. "Half-Orc" (case-insensitive). */
export function traitsForRace(race: string): RaceTrait[] {
  const q = race.trim().toLowerCase();
  return q ? RACE_TRAITS.filter((t) => t.race.toLowerCase() === q) : [];
}

export { RACE_TRAITS };
