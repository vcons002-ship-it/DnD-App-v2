import manifest from '../../public/miniatures/manifest.json';
import monsters from '../../public/miniatures/monsters/manifest.json';
import type { TokenKind } from '../../../shared/types';
import { MONSTER_MODEL_TYPES, resolveMonsterModelType, type MonsterAppearance, type MonsterModelType, monsterVariation } from '../../../shared/monsterAppearance';

/** Fit by the measured round base, never by weapons or full height. */
export type MiniatureDefinition = {
  id: 'druk' | 'varis' | 'vanec' | MonsterModelType | 'goblin-helmet' | 'goblin-crest';
  url: string;
  baseDiameter: number;
  baseCenter: [number, number, number];
  fxUrl?: string;
  baseTextureUrl?: string;
};
export const MINIATURES = Object.fromEntries([...manifest.models, ...monsters.models, ...monsters.variants].map(model => [model.id, model])) as unknown as Record<MiniatureDefinition['id'], MiniatureDefinition>;
export function resolveMiniature(name: string, kind: TokenKind, appearance: MonsterAppearance = {}, creatureId = ''): MiniatureDefinition | null {
  const key = kind === 'pc' ? name.trim().toLowerCase() : resolveMonsterModelType({ ...appearance, name });
  const allowed: readonly string[] = kind === 'pc' ? ['druk', 'varis', 'vanec'] : MONSTER_MODEL_TYPES;
  if (!allowed.includes(key)) return null;
  const variant = kind === 'monster' ? monsterVariation(key, creatureId).variant : 0;
  const modelKey = key === 'goblin' ? ['goblin', 'goblin-helmet', 'goblin-crest'][variant] : key;
  return MINIATURES[modelKey as MiniatureDefinition['id']] ?? MINIATURES[key as MiniatureDefinition['id']] ?? null;
}
