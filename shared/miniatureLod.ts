export type MiniatureLod = 'battlefield' | 'low' | 'balanced' | 'high';
export type MiniatureLodBudget = 'low' | 'balanced' | 'high' | 'auto' | 'off';

// Share one inexpensive distant model across modes. Integrated-GPU tests show
// that using Balanced/Low geometry at map distance still costs useful FPS.
const PAIRS = {
  high: {far: 'battlefield', near: 'high', pixels: 300},
  balanced: {far: 'battlefield', near: 'balanced', pixels: 180},
  low: {far: 'battlefield', near: 'low', pixels: 100},
} as const;

/** Each resolved graphics mode downloads at most its two geometry tiers.
 * Auto callers normally pass their resolved performance tier. */
export function miniatureLodPair(quality: MiniatureLodBudget) {
  return PAIRS[quality === 'low' || quality === 'off' ? 'low' : quality === 'balanced' ? 'balanced' : 'high'];
}

/** CSS-pixel base diameter, independent of DPR and map scale. The detailed
 * model is only eligible inside the viewport. Hysteresis prevents zoom jitter. */
export function miniatureLodForPixels(pixels: number, quality: MiniatureLodBudget, previous?: MiniatureLod, onScreen = true): MiniatureLod {
  const p = Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
  const pair = miniatureLodPair(quality);
  if (!onScreen) return pair.far;
  const threshold = pair.pixels * (previous === pair.near ? .85 : previous === pair.far ? 1.15 : 1);
  return p >= threshold ? pair.near : pair.far;
}
