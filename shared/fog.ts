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
