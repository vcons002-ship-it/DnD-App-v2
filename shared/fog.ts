// Fog-of-war coverage test. Framework-free and shared so the snapshot's
// per-token filter, the live drag-preview gate, and the initiative rule all ask
// the same question and can't drift apart.

/**
 * Whether a point sits under a COVERED cell of either enabled fog layer (map or
 * token fog) — i.e. a player must not see it. Pass the revealed-cell sets (built
 * once by the caller) plus the grid size; a `null` set means that layer is off.
 */
export function coveredByFog(
  mapFog: Set<string> | null,
  tokenFog: Set<string> | null,
  grid: number,
  x: number,
  y: number,
): boolean {
  const key = `${Math.floor(x / grid)},${Math.floor(y / grid)}`;
  return (!!mapFog && !mapFog.has(key)) || (!!tokenFog && !tokenFog.has(key));
}

/** The base/anchor cell decides whole-token visibility, independent of art size. */
export function tokenVisibleAt(options: {
  role: string; hidden: boolean; owned: boolean; foe: boolean;
  mapFog: Set<string> | null; tokenFog: Set<string> | null; grid: number; x: number; y: number;
}): boolean {
  if (options.role === 'dm') return true;
  if (options.hidden) return false;
  if (options.owned) return true;
  return !coveredByFog(options.mapFog, options.foe ? options.tokenFog : null, options.grid, options.x, options.y);
}
