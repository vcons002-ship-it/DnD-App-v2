import manifest from '../../public/miniatures/manifest.json';
import monsters from '../../public/miniatures/monsters/manifest.json';
import type { TokenKind } from '../../../shared/types';
import { resolveMonsterModelType, type MonsterAppearance } from '../../../shared/monsterAppearance';

/** Fit by the measured round base, never by weapons or full height. */
export type MiniatureDefinition = {
  id: 'druk' | 'varis' | 'vanec' | 'goblin' | 'skeleton' | 'wolf';
  url: string;
  baseDiameter: number;
  baseCenter: [number, number, number];
  fxUrl?: string;
  baseTextureUrl?: string;
};
export const MINIATURES = Object.fromEntries([...manifest.models, ...monsters.models].map(model => [model.id, model])) as unknown as Record<MiniatureDefinition['id'], MiniatureDefinition>;
export function resolveMiniature(name: string, kind: TokenKind, appearance: MonsterAppearance = {}): MiniatureDefinition | null {
  const key = kind === 'pc' ? name.trim().toLowerCase() : resolveMonsterModelType({ ...appearance, name });
  const allowed = kind === 'pc' ? ['druk', 'varis', 'vanec'] : ['goblin', 'skeleton', 'wolf'];
  return allowed.includes(key) ? MINIATURES[key as MiniatureDefinition['id']] : null;
}
