import type { ObjectKind } from './types.js';

export const MONSTER_MODEL_TYPES = [
  'goblin', 'skeleton', 'wolf', 'human-guard', 'human-bandit', 'human-mage',
  'human-commoner', 'dwarf-warrior', 'dwarf-commoner', 'elf-commoner',
  'tiefling-commoner', 'royal-archmage', 'orc', 'hobgoblin', 'wight', 'troll',
  'stone-golem', 'ghost', 'werebear', 'treant', 'dragon', 'two-headed-dragon',
  'spider', 'snake', 'mage-hand', 'kobold', 'zombie', 'giant-rat', 'mimic', 'imp',
] as const;
export type MonsterModelType = typeof MONSTER_MODEL_TYPES[number];
export type MonsterAppearance = { name?: string; creatureType?: string; modelType?: string; modelColor?: string; visualTags?: string[]; objectKind?: ObjectKind };
export const CREATURE_SPACE_FT = { tiny: 2.5, small: 5, medium: 5, large: 10, huge: 15, gargantuan: 20 } as const;
export type CreatureSize = keyof typeof CREATURE_SPACE_FT;
/** Stat-block size wins; names disambiguate age/forms before catalog fallbacks. */
export function creatureSize(appearance: MonsterAppearance): CreatureSize {
  if (appearance.objectKind) return 'medium';
  const explicit = appearance.creatureType?.toLowerCase().match(/^(tiny|small|medium|large|huge|gargantuan)\b/)?.[1] as CreatureSize | undefined;
  if (explicit) return explicit;
  const family = resolveMonsterModelType(appearance), name = (appearance.name ?? '').toLowerCase();
  if (family === 'dragon' || family === 'two-headed-dragon' || /\bdragon\b/.test(name)) {
    if (/\bwyrmling\b/.test(name)) return 'medium';
    if (/\byoung\b/.test(name)) return 'large';
    if (/\bancient\b/.test(name)) return 'gargantuan';
    return 'huge'; // Unspecified/custom dragon keeps the catalog adult default.
  }
  if (family === 'treant') return 'huge';
  if (['troll', 'stone-golem', 'werebear'].includes(family) || /\bdire wolf\b|\bgiant spider\b|\bgiant constrictor snake\b/.test(name)) return /giant constrictor snake/.test(name) ? 'huge' : 'large';
  if (family === 'spider') return /giant/.test(name) ? 'large' : 'tiny';
  if (family === 'snake') {
    if (/giant.*constrict/.test(name)) return 'huge';
    if (/constrict|large/.test(name)) return 'large';
    return /giant/.test(name) ? 'medium' : 'tiny';
  }
  if (family === 'mage-hand' || family === 'imp') return 'tiny';
  if (['goblin', 'kobold', 'giant-rat'].includes(family)) return 'small';
  return 'medium';
}
/** New placements only; existing occupied spaces and DM choices are preserved. */
export function defaultMonsterWidthFt(appearance: MonsterAppearance): number {
  return CREATURE_SPACE_FT[creatureSize(appearance)];
}
export const TIGHT_BASE_FAMILIES = ['dragon', 'two-headed-dragon', 'treant', 'troll', 'stone-golem', 'werebear'];
/** Visible base width is independent of combat space and can be overridden. */
export function miniatureBaseWidthFt(token: { kind: string; widthFt: number; miniatureWidthFt?: number }, appearance: MonsterAppearance = {}): number {
  if (token.miniatureWidthFt !== undefined) return token.miniatureWidthFt;
  const family = token.kind === 'monster' ? resolveMonsterModelType(appearance) : '';
  // Druk's wider sculpted base needs a slightly larger default to match the other PCs.
  const factor = token.kind === 'pc' ? (appearance.name?.trim().toLowerCase() === 'druk' ? .9 : .8) : family === 'goblin' || family === 'wolf' ? .6 : .7;
  return Math.round(token.widthFt * factor * (TIGHT_BASE_FAMILIES.includes(family) ? .96 : 1) * 100) / 100;
}
export function normalizeModelType(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').slice(0, 48) : '';
}
export function normalizeVisualTags(value: unknown): string[] {
  const text = Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 32).join(',') : typeof value === 'string' ? value.slice(0, 512) : '';
  const tags = text.toLowerCase().split(/[\s,;\[\]#]+/).map(t => t.replace(/[^a-z0-9-]/g, '').slice(0, 24)).filter(Boolean);
  return [...new Set(tags.reverse())].reverse().slice(-16);
}
export const MONSTER_COLORS: Record<string, string> = { red: '#ff7970', blue: '#80b7ff', green: '#8fe17e', purple: '#c29aff', black: '#777777', white: '#ffffff', gold: '#ffda80', bronze: '#dca875', silver: '#dce3ed', brown: '#c2a084', orange: '#ffae73', pink: '#ffa4d0', gray: '#b8b8b8', grey: '#b8b8b8', natural: '#ffffff' };
const THEMES: Record<string, string> = { fire: '#ff9b70', poison: '#a4e879', ice: '#a2d9ff', frost: '#a2d9ff', lightning: '#b8c7ff', undead: '#b4c9a3' };
const tagColor = (palette: Record<string, string>, tag: string): string | undefined => Object.hasOwn(palette, tag) ? palette[tag] : undefined;
export function appearanceTags(m: MonsterAppearance): string[] {
  // Brackets in the visible name are convenient shorthand; explicit field tags win.
  return normalizeVisualTags([...(m.name?.match(/\[[^\]]*\]/g) ?? []), ...(m.visualTags ?? [])]);
}
export function monsterTint(m: MonsterAppearance): string | undefined {
  const explicit = normalizeModelColor(m.modelColor);
  if (explicit) return MONSTER_COLORS[explicit];
  const tags = appearanceTags(m);
  return [...tags].reverse().map(t => tagColor(MONSTER_COLORS, t)).find(Boolean) ?? [...tags].reverse().map(t => tagColor(THEMES, t)).find(Boolean);
}
export function resolveMonsterModelType(m: MonsterAppearance): string {
  if (m.objectKind) return 'none';
  const explicit = normalizeModelType(m.modelType);
  if (explicit) return explicit; // unknown physical families retain their 2D fallback
  const candidate = (value: string) => {
    const words = value.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\s+\d+$/, '').trim().split(/\s+/).filter(t => !Object.hasOwn(CREATURE_SPACE_FT, t) && !tagColor(MONSTER_COLORS, t) && !tagColor(THEMES, t));
    const name = words.join(' ');
    return name === 'dire wolf' ? 'wolf' : MONSTER_MODEL_TYPES.find(t => t === name) ?? '';
  };
  return candidate(m.creatureType ?? '') || candidate(m.name ?? '');
}

export function normalizeModelColor(value: unknown): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(MONSTER_COLORS, key) ? key : '';
}

export const MONSTER_VARIANTS = {
  goblin: ['goblin', 'goblin-helmet', 'goblin-crest'],
  skeleton: ['skeleton', 'skeleton-helmet', 'skeleton-vest'],
  'human-bandit': ['human-bandit', 'human-bandit-bald', 'human-bandit-longhair'],
} as const;
export type MonsterVariantId = typeof MONSTER_VARIANTS[keyof typeof MONSTER_VARIANTS][number];
export function monsterVariantIds(family: string): readonly string[] {
  return Object.hasOwn(MONSTER_VARIANTS, family) ? MONSTER_VARIANTS[family as keyof typeof MONSTER_VARIANTS] : [family];
}
/** Stable across viewers, movement and reloads; never uses hidden encounter names. */
export function monsterVariation(family: string, creatureId: string): { variant: number; shade: [number, number, number] } {
  const variants = monsterVariantIds(family);
  if (variants.length === 1 || !creatureId) return { variant: 0, shade: [1, 1, 1] };
  let hash = 2166136261;
  for (const char of creatureId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const channel = (shift: number) => .94 + ((hash >>> shift) & 255) / 255 * .06;
  return { variant: hash % variants.length, shade: [channel(8), channel(16), channel(24)] };
}
