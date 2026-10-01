/** Framework-free 2024 multiclass rules. Class levels are explicit; a legacy
 * free-text class name never supplies an inferred split.
 * Sources: the official 2024 Free Rules' Multiclassing and each class's
 * "As a Multiclass Character" section. */
import { classProgression2024, resolveProgressionClass, type CoreClass } from './characterProgression.js';
import { slotReference2024 } from './resourceDisplay.js';
import { SKILLS, proficiencyBonus, type AbilityKey } from './skills.js';

export const MULTICLASS_SOURCE_2024 = 'https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#Multiclassing';
export const MULTICLASS_CLASS_SOURCE_2024 = 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes';
export type ClassRosterEntry = { className: CoreClass; level: number; subclass?: string };
export type ClassRosterSource = {
  className?: string; level?: number; subclass?: string;
  leveling?: { classes?: ClassRosterEntry[] };
};

/** The first entry is the starting class. Preserve its order, but never trust
 * an imported roster's class names, individual levels or total level. */
export function normalizeClassRoster(value: unknown): ClassRosterEntry[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const result: ClassRosterEntry[] = [], seen = new Set<CoreClass>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const className = resolveProgressionClass(row.className);
    if (!className || seen.has(className) || !Number.isInteger(row.level) || row.level < 1 || row.level > 20) return null;
    if (row.subclass !== undefined && (typeof row.subclass !== 'string' || row.subclass.length > 160)) return null;
    seen.add(className);
    const subclass = row.subclass?.trim();
    result.push({ className, level: row.level, ...(subclass ? { subclass } : {}) });
  }
  return totalClassLevel(result) <= 20 ? result : null;
}

/** Explicit invalid data does not fall back to pretending the sheet is single
 * class. A missing roster may use a genuinely exact legacy core-class name. */
export function resolveClassRoster(source: ClassRosterSource): ClassRosterEntry[] | null {
  if (source.leveling?.classes !== undefined) {
    const roster = normalizeClassRoster(source.leveling.classes);
    return roster && totalClassLevel(roster) === source.level ? roster : null;
  }
  const className = resolveProgressionClass(source.className ?? '');
  return className ? normalizeClassRoster([{ className, level: source.level, subclass: source.subclass }]) : null;
}

/** Keep a multiclass display explicit instead of implying the total level
 * belongs entirely to the starting class. Single-class labels stay unchanged. */
export function multiclassClassSummary(source: ClassRosterSource): string | null {
  const roster = resolveClassRoster(source);
  return roster && roster.length > 1
    ? roster.map(entry => `${entry.className[0].toUpperCase()}${entry.className.slice(1)} ${entry.level}`).join(' / ')
    : null;
}

export const totalClassLevel = (roster: readonly ClassRosterEntry[]): number => roster.reduce((n, row) => n + row.level, 0);
export function classLevelFor(source: ClassRosterSource, className: string): number {
  const key = resolveProgressionClass(className);
  return key ? resolveClassRoster(source)?.find(row => row.className === key)?.level ?? 0 : 0;
}
export const multiclassProficiencyBonus = (roster: readonly ClassRosterEntry[]): number => proficiencyBonus(totalClassLevel(roster));

/** Every group is required; alternatives within anyOf are OR choices. */
export type ClassEntryRequirement = { anyOf: AbilityKey[]; minimum: 13 };
const PRIMARY: Record<CoreClass, AbilityKey[][]> = {
  barbarian: [['STR']], bard: [['CHA']], cleric: [['WIS']], druid: [['WIS']],
  fighter: [['STR', 'DEX']], monk: [['DEX'], ['WIS']], paladin: [['STR'], ['CHA']],
  ranger: [['DEX'], ['WIS']], rogue: [['DEX']], sorcerer: [['CHA']],
  warlock: [['CHA']], wizard: [['INT']],
};
export function classEntryRequirements(className: string): ClassEntryRequirement[] {
  const key = resolveProgressionClass(className);
  return key ? PRIMARY[key].map(anyOf => ({ anyOf: [...anyOf], minimum: 13 })) : [];
}
export function checkMulticlassPrerequisites(roster: readonly ClassRosterEntry[], newClass: string, scores: Record<string, number>): { ok: boolean; missing: string[] } {
  const next = resolveProgressionClass(newClass);
  if (!next) return { ok: false, missing: ['Choose a supported 2024 core class.'] };
  // The entry prerequisites apply when taking a NEW class, rather than every
  // future level if an existing character's score has temporarily changed.
  if (roster.some(row => row.className === next)) return { ok: true, missing: [] };
  const keys = [...new Set([...roster.map(row => row.className), next])];
  const missing = keys.flatMap(className => classEntryRequirements(className)
    .filter(req => !req.anyOf.some(ab => Number.isFinite(scores[ab]) && scores[ab] >= req.minimum))
    .map(req => `${className[0].toUpperCase()}${className.slice(1)} requires ${req.anyOf.join(' or ')} 13+.`));
  return { ok: missing.length === 0, missing };
}

export type MulticlassProficiencies = {
  armor: string[]; weapons: string[]; skillChoices: number; skills: string[];
  tools: string[]; toolChoices: string[];
};
const INSTRUMENTS = ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol'];
const RANGER_SKILLS = ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'];
const ROGUE_SKILLS = ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth'];
/** These are the LIMITED starting traits, not every proficiency a class later
 * grants through a feature (for example Divine Order: Protector). No saving
 * throw proficiency or starting equipment is granted by multiclass entry. */
export function multiclassProficiencies2024(className: string): MulticlassProficiencies {
  const result: MulticlassProficiencies = { armor: [], weapons: [], skillChoices: 0, skills: [], tools: [], toolChoices: [] };
  switch (resolveProgressionClass(className)) {
    case 'barbarian': result.armor = ['Shields']; result.weapons = ['Martial weapons']; break;
    case 'bard': result.armor = ['Light armor']; result.skillChoices = 1; result.skills = SKILLS.map(s => s.name); result.toolChoices = [...INSTRUMENTS]; break;
    case 'cleric': result.armor = ['Light armor', 'Medium armor', 'Shields']; break;
    case 'druid': result.armor = ['Light armor', 'Shields']; break;
    case 'fighter': case 'paladin': result.armor = ['Light armor', 'Medium armor', 'Shields']; result.weapons = ['Martial weapons']; break;
    case 'ranger': result.armor = ['Light armor', 'Medium armor', 'Shields']; result.weapons = ['Martial weapons']; result.skillChoices = 1; result.skills = [...RANGER_SKILLS]; break;
    case 'rogue': result.armor = ['Light armor']; result.skillChoices = 1; result.skills = [...ROGUE_SKILLS]; result.tools = ["Thieves' Tools"]; break;
    case 'warlock': result.armor = ['Light armor']; break;
  }
  return result;
}

export function spellcastingAbilityForClass(className: string): 'INT' | 'WIS' | 'CHA' | null {
  const key = resolveProgressionClass(className);
  if (!key) return null;
  if (['cleric', 'druid', 'ranger'].includes(key)) return 'WIS';
  if (['wizard', 'fighter', 'rogue'].includes(key)) return 'INT';
  return ['bard', 'paladin', 'sorcerer', 'warlock'].includes(key) ? 'CHA' : null;
}

function spellcastingContribution(row: ClassRosterEntry): number {
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(row.className)) return row.level;
  if (row.className === 'paladin' || row.className === 'ranger') return Math.ceil(row.level / 2);
  if (row.level >= 3 && (row.className === 'fighter' && row.subclass?.trim().toLowerCase() === 'eldritch knight' || row.className === 'rogue' && row.subclass?.trim().toLowerCase() === 'arcane trickster')) return Math.floor(row.level / 3);
  return 0;
}
export function multiclassCasterLevel(roster: readonly ClassRosterEntry[]): number {
  return roster.reduce((total, row) => total + spellcastingContribution(row), 0);
}
/** Shared slots are separate from spell preparation, which always uses the
 * individual class's table. Pact Magic never increases shared caster level. */
export function multiclassSpellSlots2024(roster: readonly ClassRosterEntry[]): Record<string, number> {
  // Existing single-class Warlock sheets use L keys. Entering a second class
  // explicitly moves their spent Pact pool to P keys during the server merge.
  if (roster.length === 1 && roster[0].className === 'warlock') return { ...(classProgression2024('warlock', roster[0].level)?.spellSlots ?? {}) };
  const casters = roster.filter(row => spellcastingContribution(row) > 0);
  const shared = casters.length === 1
    ? classProgression2024(casters[0].className, casters[0].level, casters[0].subclass)?.spellSlots ?? {}
    : casters.length > 1 ? slotReference2024('wizard', multiclassCasterLevel(roster)) ?? {} : {};
  const warlock = roster.find(row => row.className === 'warlock');
  const pact = warlock ? classProgression2024('warlock', warlock.level)?.spellSlots ?? {} : {};
  return { ...shared, ...Object.fromEntries(Object.entries(pact).map(([name, max]) => [name.replace(/^L/, 'P'), max])) };
}

export function multiclassHitDice(roster: readonly ClassRosterEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of roster) {
    const p = classProgression2024(row.className, row.level, row.subclass);
    if (p) { const name = `d${p.hitDie}`; result[name] = (result[name] ?? 0) + row.level; }
  }
  return result;
}
/** Old saves record only a spent total. Preserve that spending deterministically
 * rather than granting a rest when a sheet first acquires separate pools. */
export function allocateHitDiceUsed(roster: readonly ClassRosterEntry[], legacyTotalUsed: number, usedByDie?: Record<string, number>): Record<string, number> {
  const pools = multiclassHitDice(roster), result: Record<string, number> = {};
  const hasBreakdown = usedByDie !== undefined && Object.keys(usedByDie).some(name => Object.hasOwn(pools, name));
  const totalSpent = Math.max(0, Math.floor(Number.isFinite(legacyTotalUsed) ? legacyTotalUsed : 0));
  const names = Object.keys(pools).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  for (const name of names) {
    const saved = usedByDie?.[name];
    const amount = hasBreakdown ? Math.floor(Number.isFinite(saved) ? Math.max(0, saved!) : 0) : 0;
    result[name] = Math.min(pools[name], amount);
  }
  // A DM may change a class split or die maximum. Retain any recorded spending
  // that no longer fits its old pool, instead of silently restoring Hit Dice.
  let remainder = Math.max(0, totalSpent - Object.values(result).reduce((n, used) => n + used, 0));
  for (const name of names) {
    const amount = Math.min(pools[name] - result[name], remainder);
    result[name] += amount; remainder -= amount;
  }
  return result;
}

/** 2024 Cleric and Paladin each spend THIS CLASS'S Channel Divinity. The
 * single-class name remains unchanged until there are actually two pools. */
export function resourceNameForClass(roster: readonly ClassRosterEntry[], className: string, name: string): string {
  if (name !== 'Channel Divinity') return name;
  const owners = roster.filter(row => (classProgression2024(row.className, row.level, row.subclass)?.resourceMaxima[name] ?? 0) > 0);
  const key = resolveProgressionClass(className);
  return owners.length > 1 && key ? `${key[0].toUpperCase()}${key.slice(1)} ${name}` : name;
}
export function multiclassResourceMaxima(roster: readonly ClassRosterEntry[], stats: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of roster) {
    const resources = classProgression2024(row.className, row.level, row.subclass, stats)?.resourceMaxima ?? {};
    for (const [name, max] of Object.entries(resources)) result[resourceNameForClass(roster, row.className, name)] = max;
  }
  return result;
}

export type ProgressionCounter = { max: number; used: number; maxOverride?: boolean; recharge?: 'short' | 'long' };
export type ProgressionCounters = Record<string, ProgressionCounter>;
export type CounterMergeOptions = {
  pactKeys?: { previous: string; next: string };
  /** An unambiguous old pool -> new pool mapping supplied from the old roster. */
  renames?: Record<string, string>;
};
/** Match the conservative sheet merge: change an automatic maximum, preserve
 * a customized maximum, retain spent uses, and never refill a renamed pool. */
export function mergeProgressionCounters(current: ProgressionCounters, next: Record<string, number>, previous: Record<string, number>, options: CounterMergeOptions = {}): ProgressionCounters {
  const saved = Object.fromEntries(Object.entries(current).map(([name, counter]) => [name, { ...counter }]));
  const oldMaxima = { ...previous };
  const renames = { ...(options.renames ?? {}) };
  const oldPact = Object.keys(previous).find(name => /^P[1-5]$/.test(name));
  const newPact = Object.keys(next).find(name => /^P[1-5]$/.test(name));
  const pact = options.pactKeys ?? (oldPact && newPact ? { previous: oldPact, next: newPact } : undefined);
  if (pact && pact.previous !== pact.next) renames[pact.previous] = pact.next;
  for (const [oldName, newName] of Object.entries(renames)) {
    if (oldName === newName || !saved[oldName] || saved[newName] || next[newName] === undefined) continue;
    saved[newName] = saved[oldName];
    if (oldMaxima[oldName] !== undefined) oldMaxima[newName] = oldMaxima[oldName];
    delete saved[oldName]; delete oldMaxima[oldName];
  }
  const result: ProgressionCounters = {};
  for (const [name, max] of Object.entries(next)) {
    const counter = saved[name];
    if (!counter) result[name] = { max, used: 0 };
    else if (!counter.maxOverride && (counter.maxOverride === false || counter.max === oldMaxima[name])) result[name] = { ...counter, max, used: Math.min(counter.used, max) };
    else result[name] = { ...counter };
  }
  for (const [name, counter] of Object.entries(saved)) {
    if (result[name]) continue;
    const automatic = !counter.maxOverride && (counter.maxOverride === false || counter.max === oldMaxima[name]);
    if (oldMaxima[name] === undefined || !automatic) result[name] = { ...counter };
  }
  return result;
}
