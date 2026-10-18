export type MiniatureLod = 'battlefield' | 'low' | 'balanced' | 'high';
export type MiniatureLodBudget = 'low' | 'balanced' | 'high' | 'auto' | 'off';

// Low geometry is the visual floor for High/Balanced. Reserve the more heavily
// reduced Battlefield sculpt for the Low performance preset.
const PAIRS = {
  high: {far: 'low', near: 'high', pixels: 300},
  balanced: {far: 'low', near: 'balanced', pixels: 180},
  low: {far: 'battlefield', near: 'low', pixels: 100},
} as const;

/** Each resolved graphics mode downloads at most its two geometry tiers.
 * Auto callers normally pass their resolved performance tier. */
export function miniatureLodPair(quality: MiniatureLodBudget) {
  return PAIRS[quality === 'low' || quality === 'off' ? 'low' : quality === 'balanced' ? 'balanced' : 'high'];
}

/** Start preparing only the same preset's close tier, while the visible figure
 * is approaching close-up size. Display thresholds remain unchanged. */
export function miniatureLodShouldPrepare(pixels:number,quality:MiniatureLodBudget,onScreen:boolean):boolean {
  return onScreen && Number.isFinite(pixels) && pixels >= miniatureLodPair(quality).pixels*.55;
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
