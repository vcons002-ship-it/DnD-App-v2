import type { ObjectKind } from './types.js';

export const MONSTER_MODEL_TYPES = ['goblin', 'skeleton', 'wolf'] as const;
export type MonsterModelType = typeof MONSTER_MODEL_TYPES[number];
export type MonsterAppearance = { name?: string; creatureType?: string; modelType?: string; modelColor?: string; visualTags?: string[]; objectKind?: ObjectKind };
export function normalizeModelType(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').slice(0, 48) : '';
}
export function normalizeVisualTags(value: unknown): string[] {
  const text = Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 32).join(',') : typeof value === 'string' ? value.slice(0, 512) : '';
  const tags = text.toLowerCase().split(/[\s,;\[\]#]+/).map(t => t.replace(/[^a-z0-9-]/g, '').slice(0, 24)).filter(Boolean);
  return [...new Set(tags.reverse())].reverse().slice(-16);
}
export const MONSTER_COLORS: Record<string, string> = { red: '#ff7970', blue: '#80b7ff', green: '#8fe17e', purple: '#c29aff', black: '#777777', white: '#ffffff', gold: '#ffda80', orange: '#ffae73', pink: '#ffa4d0', gray: '#b8b8b8', grey: '#b8b8b8', natural: '#ffffff' };
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
    const words = value.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\s+\d+$/, '').trim().split(/\s+/).filter(t => !tagColor(MONSTER_COLORS, t) && !tagColor(THEMES, t));
    const name = words.join(' ');
    return name === 'dire wolf' ? 'wolf' : MONSTER_MODEL_TYPES.find(t => t === name) ?? '';
  };
  return candidate(m.creatureType ?? '') || candidate(m.name ?? '');
}

export function normalizeModelColor(value: unknown): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(MONSTER_COLORS, key) ? key : '';
}
