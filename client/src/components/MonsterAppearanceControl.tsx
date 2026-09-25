import { useEffect, useState } from 'react';
import type { Monster } from '../../../shared/types';
import { MONSTER_COLORS, monsterTint, normalizeVisualTags, resolveMonsterModelType } from '../../../shared/monsterAppearance';
import { useStore } from '../state/socket';
import './monster-appearance.css';
import { AssetProductionStatus } from './AssetProductionStatus';
import { miniatureFamilies, resolveMiniature, useMiniatureCatalog } from '../lib/miniatures';

/** Creature data shared by template and placed-token info. Appearance never affects rules. */
export function MonsterAppearanceControl({ monster }: { monster: Monster }) {
  const update = useStore(s => s.updateMonster);
  useMiniatureCatalog();
  const families = miniatureFamilies();
  const [tags, setTags] = useState((monster.visualTags ?? []).join(', '));
  useEffect(() => setTags((monster.visualTags ?? []).join(', ')), [monster.id, monster.visualTags?.join(',')]);
  const model = resolveMonsterModelType(monster);
  if (monster.objectKind) return null;
  return <div className="monster-appearance">
    <label>3D family <select aria-label="3D family" value={monster.modelType ?? ''}
      onChange={e => update({ monsterId: monster.id, modelType: e.target.value })}>
      <option value="">Automatic</option><option value="none">2D only</option>
      {families.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1).replaceAll('-', ' ')}</option>)}
      {monster.modelType && !['none', ...families].includes(monster.modelType) && <option value={monster.modelType}>{monster.modelType} (pending 3D)</option>}
    </select></label>
    <label>Color <select aria-label="Monster model color" value={monster.modelColor ?? ''}
      onChange={e => update({ monsterId: monster.id, modelColor: e.target.value })}>
      <option value="">Automatic from tags</option>
      {Object.keys(MONSTER_COLORS).filter(c => c !== 'grey').map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
    </select></label>
    <label className="monster-appearance-tags">Appearance tags <input aria-label="Monster appearance tags" value={tags} placeholder="fire, blue, undead"
      onChange={e => setTags(e.target.value)} onBlur={() => update({ monsterId: monster.id, visualTags: normalizeVisualTags(tags) })}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <small className="muted" title="AI fill supports family, color and tags. The Color field overrides tags; color tags override themes; the last recognized tag wins. Natural clears tint. Appearance never changes combat rules.">
      {monsterTint({ ...monster, visualTags: normalizeVisualTags(tags) }) && <span aria-label="Model tint preview" className="monster-tint-swatch" style={{ background: monsterTint({ ...monster, visualTags: normalizeVisualTags(tags) }) }} />}
      {resolveMiniature(monster.name, 'monster', monster) ? `Model: ${model || monster.name}` : 'Uses 2D art'}. Cosmetic only; AI fill supported.
    </small>
    <AssetProductionStatus monster={monster} />
  </div>;
}
