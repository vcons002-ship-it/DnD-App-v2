import { MONSTER_MODEL_TYPES, normalizeModelType, resolveMonsterModelType, type MonsterAppearance } from './monsterAppearance.js';

/** One reusable physical family; colors and encounter numbering never create jobs. */
export function productionFamily(creature: MonsterAppearance): string {
  const resolved = resolveMonsterModelType(creature);
  if (resolved) return resolved === 'none' ? '' : resolved.replace(/ +/g, '-');
  const name = normalizeModelType((creature.name ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+\(?\d+\)?$/, ''));
  const words = name.replaceAll('-', ' ').split(/\s+/);
  const known = [...MONSTER_MODEL_TYPES].sort((a, b) => b.length - a.length).find(family =>
    (` ${words.join(' ')} `).includes(` ${family.replaceAll('-', ' ')} `));
  if (known) return known;
  return name.replace(/\b(fire|poison|ice|frost|lightning|undead|red|blue|green|white|black|gold)\b/g, '').trim().replace(/ +/g, '-');
}

export type ProducedMiniature = {
  id: string; url: string; baseDiameter: number; baseCenter: [number, number, number];
  bytes: number; triangles: number; sha256: string;
};
export type AssetJob = {
  id: string; family: string; state: 'queued' | 'running' | 'failed' | 'ready';
  stage: string; attempts: number; updatedAt: string; error?: string;
};
