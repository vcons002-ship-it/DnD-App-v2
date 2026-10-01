// Short / Long Rest rules (2024 PHB) as pure data → data, shared by the server
// (which applies them) and the client (which previews them). Framework-free.

export type RestKind = 'short' | 'long';
/** What a Short Rest does to one counter: refill it, give back one use, or nothing. */
export type ShortRestRecovery = 'all' | 'one' | 'none';
type Counter = { max: number; used: number; recharge?: RestKind };

/** Hit Point Die size by class (2024). Multiclass free text → the FIRST class
 *  named; an unknown class falls back to a d8. */
export function hitDieFor(className: string): number {
  const cn = className.toLowerCase();
  const table: [RegExp, number][] = [
    [/barbarian/, 12],
    [/fighter|paladin|ranger/, 10],
    [/sorcerer|wizard/, 6],
    [/bard|cleric|druid|monk|rogue|warlock|artificer/, 8],
  ];
  let best: { at: number; die: number } | null = null;
  for (const [re, die] of table) {
    const m = re.exec(cn);
    if (m && (!best || m.index < best.at)) best = { at: m.index, die };
  }
  return best?.die ?? 8;
}

/** Hit Dice available = character level − spent (never negative). */
export function hitDiceLeft(c: { level: number; hitDiceUsed?: number }): number {
  return Math.max(0, Math.max(1, Math.round(c.level || 1)) - (c.hitDiceUsed ?? 0));
}

/** HP one spent Hit Die restores: the face + CON modifier, minimum 1 (2024). */
export function hitDieHealing(face: number, conMod: number): number {
  return Math.max(1, face + conMod);
}

/** Counters the class tables create; each follows its feature's own rest rule
 *  (anything else is a custom counter whose rest the player/DM chooses). */
export const CLASS_COUNTERS = new Set([
  'rage', 'ki', 'sorcery points', 'second wind', 'action surge', 'lay on hands',
  'divine smite (free)', 'bardic inspiration', 'channel divinity', 'wild shape', 'superiority dice',
]);
export const isClassCounter = (name: string) => CLASS_COUNTERS.has(name.trim().toLowerCase());

/** True for a single-class Warlock: every slot they have is a Pact Magic slot,
 *  and Pact Magic slots come back on a Short Rest. */
export const isPactCaster = (className: string) => className.trim().toLowerCase() === 'warlock';

/**
 * What a Short Rest restores of one named class counter (2024 PHB). An explicit
 * `recharge` on the counter (a DM/player-set custom counter) wins; otherwise the
 * class feature's own rule applies, and an unknown counter waits for a Long Rest.
 */
export function shortRestRecovery(name: string, counter: Counter, className: string, level: number): ShortRestRecovery {
  if (counter.recharge === 'short') return 'all';
  if (counter.recharge === 'long') return 'none';
  const n = name.trim().toLowerCase();
  const cn = className.toLowerCase();
  if (/^(ki|focus points?|monk'?s focus)$/.test(n)) return 'all';
  if (n === 'action surge' || n === 'superiority dice') return 'all';
  // Bardic Inspiration: Font of Inspiration (bard level 5) adds Short Rest recovery.
  if (n === 'bardic inspiration') return /bard/.test(cn) && level >= 5 ? 'all' : 'none';
  // 2024: these regain ONE expended use on a Short Rest, all on a Long Rest.
  if (n === 'second wind' || n === 'channel divinity' || n === 'wild shape' || n === 'rage') return 'one';
  return 'none';
}

/** The counters after a rest: a Long Rest refills everything; a Short Rest
 *  applies `shortRestRecovery` to each. Returns only the counters that change. */
export function restCounters(
  counters: Record<string, Counter>,
  kind: RestKind,
  className: string,
  level: number,
  /** Spell-slot pool of a single-class Warlock (all short-rest pact slots). */
  allShort = false,
): Record<string, Counter> {
  const out: Record<string, Counter> = {};
  for (const [name, c] of Object.entries(counters)) {
    if (!c || c.used <= 0) continue;
    const rule = kind === 'long' || allShort ? 'all' : shortRestRecovery(name, c, className, level);
    if (rule === 'none') continue;
    out[name] = { ...c, used: rule === 'all' ? 0 : Math.max(0, c.used - 1) };
  }
  return out;
}
