import { abilityMod } from '../../../shared/skills.js';

type Counter = { max: number; used: number };
type Counters = Record<string, Counter>;

// Spell slots per character level (index 0 = char level 1), each entry is the
// slot count for spell levels 1..9. Standard 5e full-caster progression.
const FULL_CASTER: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Half-caster (Paladin/Ranger): slots begin at char level 2, max 5th level.
const HALF_CASTER: number[][] = [
  [0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0],
  [3, 0, 0, 0, 0],
  [3, 0, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

const FULL = /wizard|sorcerer|cleric|druid|bard/;
const HALF = /paladin|ranger/;

const slotsFromTable = (table: number[][], level: number): Counters => {
  const row = table[Math.max(0, Math.min(19, level - 1))] ?? [];
  const out: Counters = {};
  row.forEach((count, i) => {
    if (count > 0) out[`L${i + 1}`] = { max: count, used: 0 };
  });
  return out;
};

const rageByLevel = (lvl: number): number =>
  lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2;

/**
 * Derive the AUTO spell slots + limited-use class resources for a class/level
 * (5e). Players can adjust or add custom counters on top of these.
 */
export function deriveClassResources(
  className: string,
  level: number,
  stats: Record<string, number> = {},
): { spellSlots: Counters; resources: Counters } {
  const cn = className.toLowerCase();
  const lvl = Math.max(1, Math.round(level || 1));

  let spellSlots: Counters = {};
  if (FULL.test(cn)) spellSlots = slotsFromTable(FULL_CASTER, lvl);
  else if (HALF.test(cn)) spellSlots = slotsFromTable(HALF_CASTER, lvl);

  const resources: Counters = {};
  const add = (name: string, max: number) => {
    if (max > 0) resources[name] = { max, used: 0 };
  };
  if (/barbarian/.test(cn)) add('Rage', rageByLevel(lvl));
  if (/monk/.test(cn)) add('Ki', lvl >= 2 ? lvl : 0);
  if (/sorcerer/.test(cn)) add('Sorcery Points', lvl >= 2 ? lvl : 0);
  if (/fighter/.test(cn)) {
    // 2024 PHB: Second Wind uses scale with level — 2 (L1-3), 3 (L4-9), 4 (L10+).
    add('Second Wind', lvl >= 10 ? 4 : lvl >= 4 ? 3 : 2);
    add('Action Surge', lvl >= 17 ? 2 : lvl >= 2 ? 1 : 0);
  }
  if (/paladin/.test(cn)) add('Lay on Hands', lvl * 5);
  if (/bard/.test(cn)) add('Bardic Inspiration', Math.max(1, abilityMod(stats.CHA)));

  return { spellSlots, resources };
}
