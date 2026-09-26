// Level-scaled use counts for class features that are tracked as counters.
// Shared so the server's class-table derivation (create + level-up) and the
// client's "add this ability" path size the counter the same way.

/**
 * Uses of `feature` a `className` character of `level` gets (2024 PHB), or null
 * when this class doesn't scale that feature here — the caller then keeps the
 * entry's own default. 0 = the class gets it, but not yet at this level.
 *
 * - Channel Divinity — Cleric: 2 at 2nd, 3 at 6th, 4 at 18th.
 *                      Paladin: 2 at 3rd, 3 at 11th.
 * - Wild Shape       — Druid: 2 at 2nd, 3 at 6th, 4 at 17th.
 */
export function classFeatureUses(feature: string, className: string, level: number): number | null {
  const f = feature.trim().toLowerCase();
  const c = className.trim().toLowerCase();
  const lvl = Math.max(1, Math.floor(level || 1));
  if (f === 'channel divinity') {
    if (/\bcleric\b/.test(c)) return lvl >= 18 ? 4 : lvl >= 6 ? 3 : lvl >= 2 ? 2 : 0;
    if (/\bpaladin\b/.test(c)) return lvl >= 11 ? 3 : lvl >= 3 ? 2 : 0;
  }
  if (f === 'wild shape' && /\bdruid\b/.test(c)) return lvl >= 17 ? 4 : lvl >= 6 ? 3 : lvl >= 2 ? 2 : 0;
  return null;
}
