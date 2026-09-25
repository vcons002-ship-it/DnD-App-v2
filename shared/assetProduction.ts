import { MONSTER_MODEL_TYPES, normalizeModelType, resolveMonsterModelType, type MonsterAppearance } from './monsterAppearance.js';
import type { Monster } from './types.js';

export type AssetCreature = MonsterAppearance & Partial<Pick<Monster, 'id' | 'weapons' | 'actions' | 'abilities' | 'sheetAbilities'>>;
/** Snapshot visual evidence at submission, so retries do not change equipment. */
export function creatureArtBrief(creature: AssetCreature, notes = ''): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 600);
  const entries = [...(creature.actions ?? []), ...(creature.abilities ?? []), ...(creature.sheetAbilities ?? [])];
  const armor = entries.map(a => `${a.name}: ${a.description}`).filter(s => /armor|armour|plate|chain\s?mail|leather|shield|robe|brigandine|breastplate/i.test(s));
  return [
    `Creature: ${clean(creature.name ?? '')}. Type: ${clean(creature.creatureType ?? '')}.`,
    `Weapons: ${(creature.weapons ?? []).slice(0, 8).map(w => `${clean(w.name)} (${w.kind})`).join(', ') || 'unspecified'}.`,
    `Attacks: ${(creature.actions ?? []).slice(0, 8).map(a => clean(`${a.name}: ${a.description}`)).join('; ') || 'unspecified'}.`,
    `Armor/clothing evidence: ${armor.slice(0, 4).map(clean).join('; ') || 'unspecified; do not infer worn armor from AC'}.`,
    notes.trim() ? `DM appearance notes: ${clean(notes.trim())}` : '',
  ].filter(Boolean).join('\n');
}

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
  sourceMonsterId?: string; artBrief?: string; subjectFamily?: string;
  id: string; family: string; state: 'queued' | 'running' | 'failed' | 'ready';
  stage: string; attempts: number; updatedAt: string; error?: string;
};
