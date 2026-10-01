/** Pure 2024 core-class progression for the explicit level-up workflow.
 * Saved sheets and their homebrew choices remain the baseline; this module
 * does not migrate sheets or infer a multiclass split from a class-name string.
 * Numeric tables and feature names: official 2024 Free Rules, and the licensed
 * PHB 2024 compendium for the Battle Master, Eldritch Knight and Arcane Trickster.
 */
import { abilityMod, proficiencyBonus, type AbilityKey } from './skills.js';
import { slotReference2024 } from './resourceDisplay.js';
import { effectiveStats, type ModSource } from './modifiers.js';

export const PROGRESSION_SOURCE_2024 =
  'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes';
export const LEVEL_UP_SOURCE_2024 =
  'https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#GainingaLevel';
export const CORE_CLASSES_2024 = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
] as const;
export type CoreClass = (typeof CORE_CLASSES_2024)[number];

export type ClassProgression = {
  classKey: CoreClass;
  level: number;
  hitDie: number;
  /** Fixed hit-die result before the Constitution modifier. */
  fixedHp: number;
  proficiencyBonus: number;
  /** Features gained at this exact level, including named supported subclass features. */
  features: string[];
  subclassDue: boolean;
  featChoice: 'asiOrFeat' | 'epicBoonOrFeat' | null;
  abilityScoreCap: 20;
  /** Only Epic Boon ability increases use this ceiling; ordinary ASIs still cap at 20. */
  epicAbilityScoreCap: 30;
  /** Base-class allowance; existing species, feat and subclass bonus spells are additional. */
  cantrips: number;
  preparedSpells: number;
  maxSpellLevel: number;
  spellbookAdditions: number;
  spellSlots: Record<string, number>;
  resourceMaxima: Record<string, number>;
  choiceNotes: string[];
  capstoneBoosts: { ability: AbilityKey; value: number; max: number }[];
  /** Explicit class progression, not a replacement for a saved custom die. */
  superiorityDie?: 'd8' | 'd10' | 'd12';
};

/** Exact core-class names only. "Fighter / Wizard", "Fighter 5" and homebrew
 * names are intentionally not interpreted as single-class characters. */
export function resolveProgressionClass(className: string): CoreClass | null {
  if (typeof className !== 'string') return null;
  const key = className.trim().toLowerCase();
  return CORE_CLASSES_2024.includes(key as CoreClass) ? key as CoreClass : null;
}

const validLevel = (level: number) => Number.isInteger(level) && level >= 1 && level <= 20;
const HIT_DICE: Record<CoreClass, number> = {
  barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8,
  paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6,
};
const ASI_LEVELS = [4, 8, 12, 16];

// Fixed prepared-spell allowance at class levels 1..20. It no longer depends
// on the spellcasting ability modifier in the 2024 class tables.
const STANDARD_PREPARED = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const PREPARED: Partial<Record<CoreClass, readonly number[]>> = {
  bard: STANDARD_PREPARED,
  cleric: STANDARD_PREPARED,
  druid: STANDARD_PREPARED,
  sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 19, 20, 20, 21, 22],
  wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  paladin: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  ranger: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

// EK and AT use the same 2024 spell-slot/prepared-spell table; the Arcane
// Trickster's required Mage Hand is one of its three starting cantrips.
const THIRD_PREPARED = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
const THIRD_SLOTS = [
  [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3],
  [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1],
];

const CLASS_FEATURES: Record<CoreClass, Record<number, readonly string[]>> = {
  barbarian: {
    1: ["Rage", "Unarmored Defense", "Weapon Mastery"],
    2: ["Danger Sense", "Reckless Attack"],
    3: ["Barbarian Subclass", "Primal Knowledge"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack", "Fast Movement"],
    6: ["Subclass feature"],
    7: ["Feral Instinct", "Instinctive Pounce"],
    8: ["Ability Score Improvement"],
    9: ["Brutal Strike"],
    10: ["Subclass feature"],
    11: ["Relentless Rage"],
    12: ["Ability Score Improvement"],
    13: ["Improved Brutal Strike"],
    14: ["Subclass feature"],
    15: ["Persistent Rage"],
    16: ["Ability Score Improvement"],
    17: ["Improved Brutal Strike"],
    18: ["Indomitable Might"],
    19: ["Epic Boon"],
    20: ["Primal Champion"],
  },
  bard: {
    1: ["Bardic Inspiration", "Spellcasting"],
    2: ["Expertise", "Jack of All Trades"],
    3: ["Bard Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Font of Inspiration"],
    6: ["Subclass feature"],
    7: ["Countercharm"],
    8: ["Ability Score Improvement"],
    9: ["Expertise"],
    10: ["Magical Secrets"],
    11: [],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Subclass feature"],
    15: [],
    16: ["Ability Score Improvement"],
    17: [],
    18: ["Superior Inspiration"],
    19: ["Epic Boon"],
    20: ["Words of Creation"],
  },
  cleric: {
    1: ["Spellcasting", "Divine Order"],
    2: ["Channel Divinity"],
    3: ["Cleric Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Sear Undead"],
    6: ["Subclass feature"],
    7: ["Blessed Strikes"],
    8: ["Ability Score Improvement"],
    9: [],
    10: ["Divine Intervention"],
    11: [],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Improved Blessed Strikes"],
    15: [],
    16: ["Ability Score Improvement"],
    17: ["Subclass feature"],
    18: [],
    19: ["Epic Boon"],
    20: ["Greater Divine Intervention"],
  },
  druid: {
    1: ["Spellcasting", "Druidic", "Primal Order"],
    2: ["Wild Shape", "Wild Companion"],
    3: ["Druid Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Wild Resurgence"],
    6: ["Subclass feature"],
    7: ["Elemental Fury"],
    8: ["Ability Score Improvement"],
    9: [],
    10: ["Subclass feature"],
    11: [],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Subclass feature"],
    15: ["Improved Elemental Fury"],
    16: ["Ability Score Improvement"],
    17: [],
    18: ["Beast Spells"],
    19: ["Epic Boon"],
    20: ["Archdruid"],
  },
  fighter: {
    1: ["Fighting Style", "Second Wind", "Weapon Mastery"],
    2: ["Action Surge", "Tactical Mind"],
    3: ["Fighter Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack", "Tactical Shift"],
    6: ["Ability Score Improvement"],
    7: ["Subclass feature"],
    8: ["Ability Score Improvement"],
    9: ["Indomitable", "Tactical Master"],
    10: ["Subclass feature"],
    11: ["Two Extra Attacks"],
    12: ["Ability Score Improvement"],
    13: ["Indomitable", "Studied Attacks"],
    14: ["Ability Score Improvement"],
    15: ["Subclass feature"],
    16: ["Ability Score Improvement"],
    17: ["Action Surge", "Indomitable"],
    18: ["Subclass feature"],
    19: ["Epic Boon"],
    20: ["Three Extra Attacks"],
  },
  monk: {
    1: ["Martial Arts", "Unarmored Defense"],
    2: ["Monk's Focus", "Unarmored Movement", "Uncanny Metabolism"],
    3: ["Deflect Attacks", "Monk Subclass"],
    4: ["Ability Score Improvement", "Slow Fall"],
    5: ["Extra Attack", "Stunning Strike"],
    6: ["Empowered Strikes", "Subclass feature"],
    7: ["Evasion"],
    8: ["Ability Score Improvement"],
    9: ["Acrobatic Movement"],
    10: ["Heightened Focus", "Self-Restoration"],
    11: ["Subclass feature"],
    12: ["Ability Score Improvement"],
    13: ["Deflect Energy"],
    14: ["Disciplined Survivor"],
    15: ["Perfect Focus"],
    16: ["Ability Score Improvement"],
    17: ["Subclass feature"],
    18: ["Superior Defense"],
    19: ["Epic Boon"],
    20: ["Body and Mind"],
  },
  paladin: {
    1: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
    2: ["Fighting Style", "Paladin's Smite"],
    3: ["Channel Divinity", "Paladin Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack", "Faithful Steed"],
    6: ["Aura of Protection"],
    7: ["Subclass feature"],
    8: ["Ability Score Improvement"],
    9: ["Abjure Foes"],
    10: ["Aura of Courage"],
    11: ["Radiant Strikes"],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Restoring Touch"],
    15: ["Subclass feature"],
    16: ["Ability Score Improvement"],
    17: [],
    18: ["Aura Expansion"],
    19: ["Epic Boon"],
    20: ["Subclass feature"],
  },
  ranger: {
    1: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
    2: ["Deft Explorer", "Fighting Style"],
    3: ["Ranger Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack"],
    6: ["Roving"],
    7: ["Subclass feature"],
    8: ["Ability Score Improvement"],
    9: ["Expertise"],
    10: ["Tireless"],
    11: ["Subclass feature"],
    12: ["Ability Score Improvement"],
    13: ["Relentless Hunter"],
    14: ["Nature's Veil"],
    15: ["Subclass feature"],
    16: ["Ability Score Improvement"],
    17: ["Precise Hunter"],
    18: ["Feral Senses"],
    19: ["Epic Boon"],
    20: ["Foe Slayer"],
  },
  rogue: {
    1: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
    2: ["Cunning Action"],
    3: ["Rogue Subclass", "Steady Aim"],
    4: ["Ability Score Improvement"],
    5: ["Cunning Strike", "Uncanny Dodge"],
    6: ["Expertise"],
    7: ["Evasion", "Reliable Talent"],
    8: ["Ability Score Improvement"],
    9: ["Subclass feature"],
    10: ["Ability Score Improvement"],
    11: ["Improved Cunning Strike"],
    12: ["Ability Score Improvement"],
    13: ["Subclass feature"],
    14: ["Devious Strikes"],
    15: ["Slippery Mind"],
    16: ["Ability Score Improvement"],
    17: ["Subclass feature"],
    18: ["Elusive"],
    19: ["Epic Boon"],
    20: ["Stroke of Luck"],
  },
  sorcerer: {
    1: ["Spellcasting", "Innate Sorcery"],
    2: ["Font of Magic", "Metamagic"],
    3: ["Sorcerer Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Sorcerous Restoration"],
    6: ["Subclass feature"],
    7: ["Sorcery Incarnate"],
    8: ["Ability Score Improvement"],
    9: [],
    10: ["Metamagic"],
    11: [],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Subclass feature"],
    15: [],
    16: ["Ability Score Improvement"],
    17: ["Metamagic"],
    18: ["Subclass feature"],
    19: ["Epic Boon"],
    20: ["Arcane Apotheosis"],
  },
  warlock: {
    1: ["Eldritch Invocations", "Pact Magic"],
    2: ["Magical Cunning"],
    3: ["Warlock Subclass"],
    4: ["Ability Score Improvement"],
    5: [],
    6: ["Subclass feature"],
    7: [],
    8: ["Ability Score Improvement"],
    9: ["Contact Patron"],
    10: ["Subclass feature"],
    11: ["Mystic Arcanum"],
    12: ["Ability Score Improvement"],
    13: ["Mystic Arcanum"],
    14: ["Subclass feature"],
    15: ["Mystic Arcanum"],
    16: ["Ability Score Improvement"],
    17: ["Mystic Arcanum"],
    18: [],
    19: ["Epic Boon"],
    20: ["Eldritch Master"],
  },
  wizard: {
    1: ["Spellcasting", "Ritual Adept", "Arcane Recovery"],
    2: ["Scholar"],
    3: ["Wizard Subclass"],
    4: ["Ability Score Improvement"],
    5: ["Memorize Spell"],
    6: ["Subclass feature"],
    7: [],
    8: ["Ability Score Improvement"],
    9: [],
    10: ["Subclass feature"],
    11: [],
    12: ["Ability Score Improvement"],
    13: [],
    14: ["Subclass feature"],
    15: [],
    16: ["Ability Score Improvement"],
    17: [],
    18: ["Spell Mastery"],
    19: ["Epic Boon"],
    20: ["Signature Spells"],
  },
};

/** Names verified against the official 2024 PHB update article. These are
 * choices, not permission to replace an existing custom subclass. */
const SUBCLASS_CHOICES: Record<CoreClass, readonly string[]> = {
  barbarian: ['Path of the Berserker', 'Path of the Wild Heart', 'Path of the World Tree', 'Path of the Zealot'],
  bard: ['College of Dance', 'College of Glamour', 'College of Lore', 'College of Valor'],
  cleric: ['Life Domain', 'Light Domain', 'Trickery Domain', 'War Domain'],
  druid: ['Circle of the Land', 'Circle of the Moon', 'Circle of the Sea', 'Circle of the Stars'],
  fighter: ['Battle Master', 'Champion', 'Eldritch Knight', 'Psi Warrior'],
  monk: ['Warrior of Mercy', 'Warrior of Shadow', 'Warrior of the Elements', 'Warrior of the Open Hand'],
  paladin: ['Oath of Devotion', 'Oath of Glory', 'Oath of the Ancients', 'Oath of Vengeance'],
  ranger: ['Beast Master', 'Fey Wanderer', 'Gloom Stalker', 'Hunter'],
  rogue: ['Arcane Trickster', 'Assassin', 'Soulknife', 'Thief'],
  sorcerer: ['Aberrant Sorcery', 'Clockwork Sorcery', 'Draconic Sorcery', 'Wild Magic Sorcery'],
  warlock: ['Archfey Patron', 'Celestial Patron', 'Fiend Patron', 'Great Old One Patron'],
  wizard: ['Abjurer', 'Diviner', 'Evoker', 'Illusionist'],
};
export function subclassChoices2024(className: string): string[] {
  const key = resolveProgressionClass(className);
  return key ? [...SUBCLASS_CHOICES[key]] : [];
}

const SUBCLASS_FEATURES: Partial<Record<CoreClass, Record<string, Record<number, readonly string[]>>>> = {
  barbarian: {
    "path of the berserker": {
      3: ["Frenzy"],
      6: ["Mindless Rage"],
      10: ["Retaliation"],
      14: ["Intimidating Presence"],
    },
  },
  bard: {
    "college of lore": {
      3: ["Bonus Proficiencies", "Cutting Words"],
      6: ["Magical Discoveries"],
      14: ["Peerless Skill"],
    },
  },
  cleric: {
    "life domain": {
      3: ["Disciple of Life", "Life Domain Spells", "Preserve Life"],
      6: ["Blessed Healer"],
      17: ["Supreme Healing"],
    },
  },
  druid: {
    "circle of the land": {
      3: ["Circle of the Land Spells", "Land's Aid"],
      6: ["Natural Recovery"],
      10: ["Nature's Ward"],
      14: ["Nature's Sanctuary"],
    },
  },
  fighter: {
    "champion": {
      3: ["Improved Critical", "Remarkable Athlete"],
      7: ["Additional Fighting Style"],
      10: ["Heroic Warrior"],
      15: ["Superior Critical"],
      18: ["Survivor"],
    },
    "battle master": {
      3: ["Combat Superiority", "Student of War"],
      7: ["Know Your Enemy"],
      10: ["Improved Combat Superiority"],
      15: ["Relentless"],
      18: ["Ultimate Combat Superiority"],
    },
    "eldritch knight": {
      3: ["Spellcasting", "War Bond"],
      7: ["War Magic"],
      10: ["Eldritch Strike"],
      15: ["Arcane Charge"],
      18: ["Improved War Magic"],
    },
  },
  monk: {
    "warrior of the open hand": {
      3: ["Open Hand Technique"],
      6: ["Wholeness of Body"],
      11: ["Fleet Step"],
      17: ["Quivering Palm"],
    },
  },
  paladin: {
    "oath of devotion": {
      3: ["Oath of Devotion Spells", "Sacred Weapon"],
      7: ["Aura of Devotion"],
      15: ["Smite of Protection"],
      20: ["Holy Nimbus"],
    },
  },
  ranger: {
    "hunter": {
      3: ["Hunter's Lore", "Hunter's Prey"],
      7: ["Defensive Tactics"],
      11: ["Superior Hunter's Prey"],
      15: ["Superior Hunter's Defense"],
    },
  },
  rogue: {
    "thief": {
      3: ["Fast Hands", "Second-Story Work"],
      9: ["Supreme Sneak"],
      13: ["Use Magic Device"],
      17: ["Thief's Reflexes"],
    },
    "arcane trickster": {
      3: ["Spellcasting", "Mage Hand Legerdemain"],
      9: ["Magical Ambush"],
      13: ["Versatile Trickster"],
      17: ["Spell Thief"],
    },
  },
  sorcerer: {
    "draconic sorcery": {
      3: ["Draconic Resilience", "Draconic Spells"],
      6: ["Elemental Affinity"],
      14: ["Dragon Wings"],
      18: ["Dragon Companion"],
    },
  },
  warlock: {
    "fiend patron": {
      3: ["Dark One's Blessing", "Fiend Spells"],
      6: ["Dark One's Own Luck"],
      10: ["Fiendish Resilience"],
      14: ["Hurl Through Hell"],
    },
  },
  wizard: {
    "evoker": {
      3: ["Evocation Savant", "Potent Cantrip"],
      6: ["Sculpt Spells"],
      10: ["Empowered Evocation"],
      14: ["Overchannel"],
    },
  },
};

const subclassKey = (subclass: string) => subclass.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
/** Named features from the 12 Free Rules subclasses and the three reviewed
 * martial subclasses. An unknown subclass produces no invented features. */
export function subclassFeatures2024(className: string, subclass: string, level: number): string[] {
  const key = resolveProgressionClass(className);
  if (!key || !validLevel(level)) return [];
  return [...(SUBCLASS_FEATURES[key]?.[subclassKey(subclass)]?.[level] ?? [])];
}

const ALWAYS_PREPARED: Partial<Record<CoreClass, Record<number, string[]>>> = {
  bard: { 20: ['Power Word Heal', 'Power Word Kill'] },
  druid: { 1: ['Speak with Animals'] },
  paladin: { 2: ['Divine Smite'], 5: ['Find Steed'] },
  ranger: { 1: ["Hunter's Mark"] },
  warlock: { 9: ['Contact Other Plane'] },
};
const SUBCLASS_PREPARED: Partial<Record<CoreClass, Record<string, Record<number, string[]>>>> = {
  cleric: {
    'life domain': {
      3: ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration'],
      5: ['Mass Healing Word', 'Revivify'],
      7: ['Aura of Life', 'Death Ward'],
      9: ['Greater Restoration', 'Mass Cure Wounds'],
    },
  },
  paladin: {
    'oath of devotion': {
      3: ['Protection from Evil and Good', 'Shield of Faith'],
      5: ['Aid', 'Zone of Truth'],
      9: ['Beacon of Hope', 'Dispel Magic'],
      13: ['Freedom of Movement', 'Guardian of Faith'],
      17: ['Commune', 'Flame Strike'],
    },
  },
  sorcerer: {
    'draconic sorcery': {
      3: ['Alter Self', 'Chromatic Orb', 'Command', "Dragon's Breath"],
      5: ['Fear', 'Fly'],
      7: ['Arcane Eye', 'Charm Monster'],
      9: ['Legend Lore', 'Summon Dragon'],
    },
  },
  warlock: {
    'fiend patron': {
      3: ['Burning Hands', 'Command', 'Scorching Ray', 'Suggestion'],
      5: ['Fireball', 'Stinking Cloud'],
      7: ['Fire Shield', 'Wall of Fire'],
      9: ['Geas', 'Insect Plague'],
    },
  },
};

/** Fixed spell grants gained at this exact class level. These spells are extra
 * to the base prepared allowance; the caller preserves existing custom entries.
 * Features requiring a choice or special casting rule are deliberately separate
 * (Land spells, Mystic Arcanum, Wild Companion, Spell Mastery and Savant).
 */
export function alwaysPreparedSpells2024(className: string, subclass: string, level: number): string[] {
  const key = resolveProgressionClass(className);
  if (!key || !validLevel(level)) return [];
  return [...new Set([
    ...(ALWAYS_PREPARED[key]?.[level] ?? []),
    ...(SUBCLASS_PREPARED[key]?.[subclassKey(subclass)]?.[level] ?? []),
  ])];
}

/** Permanent sheet scores without equipment effects, for ASIs and HP. An item
 * that temporarily sets CON must not permanently inflate level-up hit points. */
export function permanentStats2024(character: ModSource): Record<string, number> {
  return effectiveStats({ ...character, items: [] }).scores;
}

function resourceMaxima2024(key: CoreClass, level: number, stats: Record<string, number>, subclass: string): Record<string, number> {
  const result: Record<string, number> = {};
  const add = (name: string, max: number) => { if (max > 0) result[name] = max; };
  const sub = subclassKey(subclass);
  if (key === 'barbarian') {
    add('Rage', level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2);
    if (sub === 'path of the berserker') add('Intimidating Presence', level >= 14 ? 1 : 0);
  }
  if (key === 'bard') add('Bardic Inspiration', Math.max(1, abilityMod(stats.CHA)));
  if (key === 'cleric') add('Channel Divinity', level >= 18 ? 4 : level >= 6 ? 3 : level >= 2 ? 2 : 0);
  if (key === 'druid') {
    add('Wild Shape', level >= 17 ? 4 : level >= 6 ? 3 : level >= 2 ? 2 : 0);
    if (sub === 'circle of the land' && level >= 6) {
      // These benefits are independent: using the free spell does not spend
      // the separate once-per-Long-Rest spell-slot recovery.
      add('Natural Recovery (free spell)', 1);
      add('Natural Recovery (slots)', 1);
    }
  }
  if (key === 'fighter') {
    add('Second Wind', level >= 10 ? 4 : level >= 4 ? 3 : 2);
    add('Action Surge', level >= 17 ? 2 : level >= 2 ? 1 : 0);
    add('Indomitable', level >= 17 ? 3 : level >= 13 ? 2 : level >= 9 ? 1 : 0);
    if (sub === 'battle master') {
      add('Superiority Dice', level >= 15 ? 6 : level >= 7 ? 5 : level >= 3 ? 4 : 0);
      add('Know Your Enemy', level >= 7 ? 1 : 0);
    }
  }
  // Preserve the existing application's counter name rather than introducing
  // a second pool when the 2024 feature calls these Focus Points.
  if (key === 'monk') {
    add('Ki', level >= 2 ? level : 0);
    if (sub === 'warrior of the open hand' && level >= 6)
      add('Wholeness of Body', Math.max(1, abilityMod(stats.WIS)));
  }
  if (key === 'paladin') {
    add('Lay on Hands', level * 5);
    add('Divine Smite (free)', level >= 2 ? 1 : 0);
    add('Channel Divinity', level >= 11 ? 3 : level >= 3 ? 2 : 0);
    if (sub === 'oath of devotion') add('Holy Nimbus', level >= 20 ? 1 : 0);
  }
  if (key === 'ranger') add('Favored Enemy', level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2);
  if (key === 'sorcerer') {
    add('Sorcery Points', level >= 2 ? level : 0);
    add('Innate Sorcery', 2);
    if (sub === 'draconic sorcery') {
      add('Dragon Wings', level >= 14 ? 1 : 0);
      add('Dragon Companion', level >= 18 ? 1 : 0);
    }
  }
  if (key === 'warlock') {
    add('Magical Cunning', level >= 2 ? 1 : 0);
    // Arcanum spells have independent free-cast uses. They are not Pact
    // Magic slots and must never allow upcasting other spells.
    for (const [atLevel, spellLevel] of [[11, 6], [13, 7], [15, 8], [17, 9]])
      add(`Mystic Arcanum (level ${spellLevel})`, level >= atLevel ? 1 : 0);
    if (sub === 'fiend patron') {
      if (level >= 6) add("Dark One's Own Luck", Math.max(1, abilityMod(stats.CHA)));
      add('Hurl Through Hell', level >= 14 ? 1 : 0);
    }
  }
  if (key === 'wizard') add('Arcane Recovery', 1);
  return result;
}

function baseCantrips(key: CoreClass, level: number): number {
  const extra = level >= 10 ? 2 : level >= 4 ? 1 : 0;
  if (key === 'sorcerer') return 4 + extra;
  if (key === 'cleric' || key === 'wizard') return 3 + extra;
  if (key === 'bard' || key === 'druid' || key === 'warlock') return 2 + extra;
  return 0;
}

/** One row of the 2024 rules. Null means the guided single-class workflow
 * cannot safely calculate this class/level; ordinary manual editing remains. */
export function classProgression2024(className: string, level: number, subclass = '', stats: Record<string, number> = {}): ClassProgression | null {
  const key = resolveProgressionClass(className);
  if (!key || !validLevel(level)) return null;
  const sub = subclassKey(subclass);
  const thirdCaster = (key === 'fighter' && sub === 'eldritch knight') || (key === 'rogue' && sub === 'arcane trickster');
  const spellSlots = thirdCaster
    ? Object.fromEntries(THIRD_SLOTS[level - 1].map((max, i) => [`L${i + 1}`, max]))
    : slotReference2024(key, level, subclass) ?? {};
  let cantrips = baseCantrips(key, level);
  if (thirdCaster && level >= 3) cantrips = (key === 'rogue' ? 3 : 2) + (level >= 10 ? 1 : 0);
  const featChoice = level === 19 ? 'epicBoonOrFeat'
    : ASI_LEVELS.includes(level) || (key === 'fighter' && [6, 14].includes(level)) || (key === 'rogue' && level === 10)
      ? 'asiOrFeat' : null;
  const capstoneBoosts: ClassProgression['capstoneBoosts'] = [];
  if (level === 20 && key === 'barbarian') capstoneBoosts.push({ ability: 'STR', value: 4, max: 25 }, { ability: 'CON', value: 4, max: 25 });
  if (level === 20 && key === 'monk') capstoneBoosts.push({ ability: 'DEX', value: 4, max: 25 }, { ability: 'WIS', value: 4, max: 25 });
  const choiceNotes: string[] = [];
  const baseFeatures = [...(CLASS_FEATURES[key][level] ?? [])];
  const subclassFeatures = subclassFeatures2024(key, subclass, level);
  const features = baseFeatures.filter((name) => name !== 'Subclass feature' || !subclassFeatures.length);
  features.push(...subclassFeatures);
  if (level === 3) choiceNotes.push('Choose your subclass, or keep the subclass already on your sheet.');
  if (subclass && !SUBCLASS_FEATURES[key]?.[sub]) choiceNotes.push('Review this subclass in your rulebook and add its features and bonus spells to the sheet.');
  if (baseFeatures.includes('Subclass feature') && !subclassFeatures.length) choiceNotes.push('Review the subclass features gained at this level.');
  if (baseFeatures.includes('Expertise') || baseFeatures.includes('Deft Explorer')) choiceNotes.push('Choose the skills that gain Expertise.');
  if (baseFeatures.includes('Scholar')) choiceNotes.push('Choose one proficient scholarly skill for Expertise: Arcana, History, Investigation, Medicine, Nature or Religion.');
  if (baseFeatures.includes('Primal Knowledge')) choiceNotes.push('Choose an additional Barbarian skill proficiency.');
  if (baseFeatures.includes('Fighting Style') || features.includes('Additional Fighting Style')) choiceNotes.push('Choose a Fighting Style; Paladins and Rangers may instead choose their cantrip option.');
  if (key === 'sorcerer' && [2, 10, 17].includes(level)) choiceNotes.push('Choose two additional Metamagic options and review any replacement.');
  if (baseFeatures.includes('Blessed Strikes') || baseFeatures.includes('Elemental Fury')) choiceNotes.push('Choose the weapon-focused or cantrip-focused version of this feature.');
  if ((key === 'fighter' && [1, 4, 10, 16].includes(level)) || (key === 'barbarian' && [1, 4, 10].includes(level))) {
    const count = key === 'fighter' ? level >= 16 ? 6 : level >= 10 ? 5 : level >= 4 ? 4 : 3 : level >= 10 ? 4 : level >= 4 ? 3 : 2;
    choiceNotes.push(`Choose weapon masteries; this level allows ${count} weapon types in total.`);
  }
  if (key === 'warlock') {
    const invocations = [1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];
    if (level === 1 || invocations[level - 1] > invocations[level - 2]) choiceNotes.push(`Choose Eldritch Invocations; this level allows ${invocations[level - 1]} in total.`);
    if ([11, 13, 15, 17].includes(level)) choiceNotes.push(`Choose a level ${(level + 1) / 2} Mystic Arcanum spell; it uses its own once-per-long-rest casting.`);
  }
  if (key === 'fighter' && sub === 'battle master' && [3, 7, 10, 15].includes(level)) choiceNotes.push(`Choose ${level === 3 ? 3 : 2} additional maneuvers and review any replacement.`);
  if (thirdCaster && key === 'rogue' && level === 3) choiceNotes.push('Mage Hand is required; choose two other Wizard cantrips.');
  if (key === 'druid' && level === 2) choiceNotes.push('Wild Companion grants special Find Familiar casting with a spell slot or Wild Shape, without materials; record its Fey form and Long Rest expiry with the DM.');
  if (key === 'druid' && sub === 'circle of the land' && level >= 3) choiceNotes.push('Choose arid, polar, temperate or tropical land after each Long Rest and record its Circle spells separately; the guide does not choose a land or replace those spells for you.');
  if (key === 'bard' && sub === 'college of lore' && level === 6) choiceNotes.push('Magical Discoveries grants two additional Cleric, Druid or Wizard spells, including eligible cantrips; select them separately with the DM rather than using the base Bard allowance.');
  if (key === 'wizard' && level === 18) choiceNotes.push('Choose one level-1 and one level-2 spellbook spell with an action casting time for Spell Mastery; record their always-prepared, slot-free casting with the DM.');
  if (key === 'wizard' && level === 20) choiceNotes.push('Choose two level-3 spellbook spells for Signature Spells; each is always prepared and has its own free cast recovered on a Short or Long Rest.');
  if (key === 'sorcerer' && sub === 'draconic sorcery' && level === 6) choiceNotes.push('For Elemental Affinity, choose acid, cold, fire, lightning or poison; record the resistance and Charisma damage benefit with the DM.');
  if (key === 'ranger' && sub === 'hunter' && level === 3) choiceNotes.push("For Hunter's Prey, choose Colossus Slayer or Horde Breaker and record the chosen effect with the DM; the choice can change after a Short or Long Rest.");
  if (cantrips > 0) choiceNotes.push('Keep extra cantrips granted by species, feats or subclass choices separate from the base-class allowance.');
  if (PREPARED[key] || thirdCaster) choiceNotes.push('Always-prepared feature and subclass spells do not use the base prepared-spell allowance.');
  return {
    classKey: key, level, hitDie: HIT_DICE[key], fixedHp: HIT_DICE[key] / 2 + 1,
    proficiencyBonus: proficiencyBonus(level), features, subclassDue: level === 3,
    featChoice, abilityScoreCap: 20, epicAbilityScoreCap: 30, cantrips,
    preparedSpells: thirdCaster ? THIRD_PREPARED[level - 1] : PREPARED[key]?.[level - 1] ?? 0,
    maxSpellLevel: Math.max(0, ...Object.keys(spellSlots).map((name) => Number(name.slice(1)))),
    spellbookAdditions: key === 'wizard' ? level === 1 ? 6 : 2 : 0,
    spellSlots, resourceMaxima: resourceMaxima2024(key, level, stats, subclass), choiceNotes, capstoneBoosts,
    ...(key === 'fighter' && sub === 'battle master' && level >= 3 ? { superiorityDie: level >= 18 ? 'd12' as const : level >= 10 ? 'd10' as const : 'd8' as const } : {}),
  };
}

export type HpIncreaseInput = {
  oldLevel: number;
  hitDieFace: number;
  oldConMod: number;
  newConMod: number;
  existingTough?: boolean;
  newTough?: boolean;
};
/** Increment the saved maximum rather than rebuilding its history. NEW CON
 * applies to the added level; the modifier change also affects OLD levels.
 * A minimum of one applies to the added hit die, before retroactive changes.
 * Tough newly acquired adds 2 per total level; existing Tough adds only 2.
 */
export function hpIncrease2024(input: HpIncreaseInput): number {
  const { oldLevel, hitDieFace, oldConMod, newConMod, existingTough, newTough } = input;
  if (!Number.isInteger(oldLevel) || oldLevel < 1 || oldLevel >= 20 ||
      !Number.isInteger(hitDieFace) || hitDieFace < 1 || hitDieFace > 12 ||
      !Number.isInteger(oldConMod) || !Number.isInteger(newConMod)) {
    throw new RangeError('Level-up HP requires a level from 1 to 19, a valid Hit Die result and integer Constitution modifiers.');
  }
  const toughness = existingTough ? 2 : newTough ? 2 * (oldLevel + 1) : 0;
  return Math.max(1, hitDieFace + newConMod) + oldLevel * (newConMod - oldConMod) + toughness;
}
