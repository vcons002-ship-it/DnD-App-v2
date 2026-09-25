/** Presentation helpers only. Never derive or modify saved counters on render. */
export const SLOT_REFERENCE_SOURCE =
  'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes';
const FULL = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const HALF = [
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];
export function slotReference2024(
  className: string,
  level: number,
  subclass = '',
): Record<string, number> | null {
  if (!Number.isInteger(level) || level < 1 || level > 20) return null;
  const name = className.trim().toLowerCase();
  const table = /^(bard|cleric|druid|sorcerer|wizard)$/.test(name)
    ? FULL
    : /^(ranger|paladin)$/.test(name)
      ? HALF
      : null;
  if (table)
    return Object.fromEntries(
      table[level - 1].map((max, i) => [`L${i + 1}`, max]),
    );
  // Pact Magic: a few slots, ALL of one level — 1 / 2 / 3 / 4 slots at warlock
  // levels 1 / 2 / 11 / 17, at slot level ⌈level/2⌉ up to 5th.
  if (name === 'warlock') {
    const count = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
    return { [`L${Math.min(5, Math.ceil(level / 2))}`]: count };
  }
  // The Artificer is a half-caster that rounds UP — the 2024 half-caster table.
  if (name === 'artificer')
    return Object.fromEntries(HALF[level - 1].map((max, i) => [`L${i + 1}`, max]));
  if (
    /^(barbarian|monk)$/.test(name) ||
    (name === 'fighter' && /^(battle master|champion)$/i.test(subclass.trim()))
  )
    return {};
  // Free-text subclass, multiclass split and homebrew cannot be inferred safely
  // from one level field (a single-class Warlock's Pact Magic can, above).
  // Unknown does NOT mean zero allowance.
  return null;
}

export function remainingAfterPip(
  max: number,
  used: number,
  pip: number,
): number {
  const remaining = max - used;
  return pip === remaining ? pip - 1 : pip;
}

export function remainingAfterMax(max: number, used: number): number {
  return Math.max(0, max - Math.min(max, used));
}
