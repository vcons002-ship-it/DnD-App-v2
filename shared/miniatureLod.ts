export type MiniatureLod = 'battlefield' | 'low' | 'balanced' | 'high';
export type MiniatureLodBudget = 'low' | 'balanced' | 'high' | 'auto' | 'off';

/** CSS-pixel base diameter, independent of device pixel ratio and map feet.
 * Hysteresis prevents repeated loads when zoom or perspective crosses a boundary.
 * Explicit quality remains a ceiling; Auto uses its resolved performance tier. */
export function miniatureLodForPixels(pixels: number, quality: MiniatureLodBudget, previous?: MiniatureLod): MiniatureLod {
  const p = Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
  const rank: MiniatureLod[] = ['battlefield', 'low', 'balanced', 'high'];
  const boundaries = [100, 180, 300];
  const ceiling = quality === 'low' || quality === 'off' ? 1 : quality === 'balanced' ? 2 : 3;
  let level = previous ? Math.min(ceiling, rank.indexOf(previous)) : 0;
  if (!previous) {
    while (level < ceiling && p >= boundaries[level]) level++;
  } else {
    while (level < ceiling && p >= boundaries[level] * 1.15) level++;
    while (level > 0 && p < boundaries[level - 1] * .85) level--;
  }
  return rank[level];
}
