/** Saved atmosphere for one map. Distances use feet so map calibration applies. */
export type MapEnvironment = {
  enabled: boolean;
  shadows: boolean;
  shadowDirectionDegrees: number;
  shadowLength: number;
  shadowOpacity: number;
  mist: boolean;
  mistOpacity: number;
  mistHeightFt: number;
  mistShadows: boolean;
  mistInteraction: boolean;
};
export type EnvironmentQuality = 'auto' | 'high' | 'low' | 'off';
export const DEFAULT_MAP_ENVIRONMENT: Readonly<MapEnvironment> = {
  enabled: false, shadows: true, shadowDirectionDegrees: 55, shadowLength: 1.05,
  shadowOpacity: .65, mist: true, mistOpacity: .35, mistHeightFt: 2,
  mistShadows: true, mistInteraction: true,
};

/** Whitelist and bound inputs; an invalid partial update preserves saved values. */
export function sanitizeMapEnvironment(input: unknown, previous: Readonly<MapEnvironment> = DEFAULT_MAP_ENVIRONMENT): MapEnvironment {
  const result = {...previous};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  const source = input as Record<string, unknown>;
  for (const key of ['enabled', 'shadows', 'mist', 'mistShadows', 'mistInteraction'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const [key, min, max] of [
    ['shadowLength', .1, 4], ['shadowOpacity', 0, 1], ['mistOpacity', 0, .7], ['mistHeightFt', .5, 10],
  ] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  const angle = source.shadowDirectionDegrees;
  if (typeof angle === 'number' && Number.isFinite(angle)) result.shadowDirectionDegrees = ((angle % 360) + 360) % 360;
  return result;
}
