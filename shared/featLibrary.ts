// A small, SRD-safe catalogue of feats (and the two ASI options) for the sheet's
// "Feats & ASIs" picker. Each entry autofills its NUMERIC effects as editable
// modifiers — the player picks one, tweaks the ability if needed, and saves. The
// many feats that are purely situational/rules text live in the rollable
// "Spells & Abilities" section instead; this list is the ones that move a number.
//
// Descriptions are brief original paraphrases (not copied rules text).

import type { ModTarget } from './types.js';

export type FeatEffect = { target: ModTarget; value: number; set?: boolean };

export type FeatDef = {
  name: string;
  /** One-line summary shown in the picker and saved onto the entry. */
  description: string;
  /** Effects seeded into the draft when picked (then freely editable). */
  effects: FeatEffect[];
  /** Group label for the picker ("ASI" pinned to the top, else "Feat"). */
  group: 'ASI' | 'Feat';
};

const ab = (ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', value = 1): FeatEffect => ({
  target: { kind: 'ability', ability },
  value,
});

export const FEAT_LIBRARY: FeatDef[] = [
  // ---- Ability Score Improvements (pinned) --------------------------------
  {
    group: 'ASI',
    name: 'Ability Score Improvement (+2)',
    description: 'Increase one ability score by 2 (max 20).',
    effects: [ab('STR', 2)],
  },
  {
    group: 'ASI',
    name: 'Ability Score Improvement (+1 / +1)',
    description: 'Increase two different ability scores by 1 each (max 20).',
    effects: [ab('STR', 1), ab('DEX', 1)],
  },

  // ---- Half-feats: a clean +1 to an ability (edit the ability to taste) ----
  {
    group: 'Feat',
    name: 'Resilient',
    description: '+1 to one ability and proficiency in that ability’s saving throws. (Set the save proficiency on the sheet.)',
    effects: [ab('CON', 1)],
  },
  { group: 'Feat', name: 'Durable', description: '+1 Constitution; recover more reliably on a short rest.', effects: [ab('CON', 1)] },
  { group: 'Feat', name: 'Observant', description: '+1 Intelligence or Wisdom; quick to read lips and notice details.', effects: [ab('WIS', 1)] },
  { group: 'Feat', name: 'Athlete', description: '+1 Strength or Dexterity; stand up and climb more easily.', effects: [ab('STR', 1)] },
  { group: 'Feat', name: 'Actor', description: '+1 Charisma; advantage on Deception/Performance to pass as someone else.', effects: [ab('CHA', 1)] },
  { group: 'Feat', name: 'Keen Mind', description: '+1 Intelligence; always know which way is north and recall recent details.', effects: [ab('INT', 1)] },
  { group: 'Feat', name: 'Lightly Armored', description: '+1 Strength or Dexterity; gain light-armor proficiency.', effects: [ab('DEX', 1)] },
  { group: 'Feat', name: 'Moderately Armored', description: '+1 Strength or Dexterity; gain medium-armor and shield proficiency.', effects: [ab('STR', 1)] },
  { group: 'Feat', name: 'Tavern Brawler', description: '+1 Strength or Constitution; improvised weapons and unarmed strikes hit harder.', effects: [ab('STR', 1)] },
  { group: 'Feat', name: 'Weapon Master', description: '+1 Strength or Dexterity; gain proficiency with four weapons.', effects: [ab('DEX', 1)] },
  { group: 'Feat', name: 'Fey Touched', description: '+1 Int/Wis/Cha; learn Misty Step and one 1st-level spell.', effects: [ab('WIS', 1)] },
  { group: 'Feat', name: 'Shadow Touched', description: '+1 Int/Wis/Cha; learn Invisibility and one 1st-level spell.', effects: [ab('WIS', 1)] },
  { group: 'Feat', name: 'Telekinetic', description: '+1 Int/Wis/Cha; shove a creature with your mind as a bonus action.', effects: [ab('INT', 1)] },
  { group: 'Feat', name: 'Telepathic', description: '+1 Int/Wis/Cha; speak telepathically to nearby creatures.', effects: [ab('WIS', 1)] },
  { group: 'Feat', name: 'Skill Expert', description: '+1 to one ability, one new skill proficiency, and expertise in one skill.', effects: [ab('DEX', 1)] },
  { group: 'Feat', name: 'Chef', description: '+1 Constitution or Wisdom; cook food that heals and grants temp HP.', effects: [ab('CON', 1)] },
  { group: 'Feat', name: 'Crusher', description: '+1 Strength or Constitution; bludgeoning hits can shove and aid allies.', effects: [ab('STR', 1)] },
  { group: 'Feat', name: 'Piercer', description: '+1 Strength or Dexterity; reroll a piercing damage die and crit harder.', effects: [ab('DEX', 1)] },
  { group: 'Feat', name: 'Slasher', description: '+1 Strength or Dexterity; slashing hits slow and reel a target.', effects: [ab('STR', 1)] },
];

/** Filter the library by a free-text query (matches name + description). */
export function searchFeats(query: string): FeatDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FEAT_LIBRARY;
  return FEAT_LIBRARY.filter(
    (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
  );
}
