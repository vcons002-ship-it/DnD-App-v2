// D&D 5e skills, proficiency, and derived bonuses. Framework-free for reuse.

export type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

/** The 18 standard skills, each tied to its governing ability. */
export const SKILLS: { name: string; ability: AbilityKey }[] = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
];

/** Ability modifier from a score (5e): floor((score - 10) / 2). */
export const abilityMod = (score: number | undefined): number =>
  Number.isFinite(score) ? Math.floor(((score as number) - 10) / 2) : 0;

/** Proficiency bonus from level/CR (5e): +2 at 1–4, +3 at 5–8, … */
export const proficiencyBonus = (level: number): number =>
  2 + Math.floor((Math.max(1, level) - 1) / 4);

/** Total skill bonus = ability mod + (proficient ? proficiency bonus : 0). */
export function skillBonus(
  stats: Record<string, number>,
  ability: AbilityKey,
  level: number,
  proficient: boolean,
): number {
  return abilityMod(stats[ability]) + (proficient ? proficiencyBonus(level) : 0);
}

/** Format a bonus with an explicit sign, e.g. "+3" / "-1". */
export const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n}`;
