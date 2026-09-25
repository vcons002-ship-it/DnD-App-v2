import manifest from '../../public/miniatures/manifest.json';
import monsters from '../../public/miniatures/monsters/manifest.json';
import type { TokenKind } from '../../../shared/types';
import { type MonsterAppearance, monsterVariation, monsterVariantIds } from '../../../shared/monsterAppearance';
import { productionFamily, type ProducedMiniature } from '../../../shared/assetProduction';
import { useEffect, useSyncExternalStore } from 'react';

/** Fit by the measured round base, never by weapons or full height. */
export type MiniatureDefinition = {
  id: string;
  url: string;
  baseDiameter: number;
  baseCenter: [number, number, number];
  fxUrl?: string;
  baseTextureUrl?: string;
};
export const MINIATURES = Object.fromEntries([...manifest.models, ...monsters.models, ...monsters.variants].map(model => [model.id, model])) as unknown as Record<MiniatureDefinition['id'], MiniatureDefinition>;
const generated: Record<string, MiniatureDefinition> = Object.create(null);
const bundledMonsterIds = new Set([...monsters.models, ...monsters.variants].map(m => m.id));
const listeners = new Set<() => void>();
let revision = 0, signature = '', pending = false;
export async function refreshMiniatureCatalog() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/api/assets/catalog', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const { models } = await response.json() as { models: ProducedMiniature[] };
    if (!Array.isArray(models)) return;
    const valid = models.filter(m => /^[a-z0-9-]{1,48}$/.test(m.id) && m.url.startsWith('/uploads/miniatures/') && m.baseDiameter > 0 && m.baseCenter?.length === 3);
    const next = JSON.stringify(valid);
    if (signature === next) return;
    signature = next;
    for (const key of Object.keys(generated)) delete generated[key];
    for (const model of valid) generated[model.id] = model;
    revision++; listeners.forEach(listener => listener());
  } catch { /* Keep the last usable catalog during network interruptions. */ }
  finally { pending = false; }
}
let users = 0, timer: ReturnType<typeof setInterval> | undefined;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useMiniatureCatalog() {
  const current = useSyncExternalStore(subscribe, () => revision);
  useEffect(() => {
    users++;
    if (users === 1) { void refreshMiniatureCatalog(); timer = setInterval(() => { void refreshMiniatureCatalog(); }, 5000); }
    return () => { users--; if (!users) clearInterval(timer); };
  }, []);
  return current;
}
export function miniatureFamilies() { return [...new Set([...monsters.models.map(m => m.id), ...Object.keys(generated)])]; }
export function resolveMiniature(name: string, kind: TokenKind, appearance: MonsterAppearance = {}, creatureId = ''): MiniatureDefinition | null {
  const key = kind === 'pc' ? name.trim().toLowerCase() : productionFamily({ ...appearance, name });
  if (!key || (kind === 'pc' && !['druk', 'varis', 'vanec'].includes(key))) return null;
  const variant = kind === 'monster' ? monsterVariation(key, creatureId).variant : 0;
  const modelKey = kind === 'monster' ? monsterVariantIds(key)[variant] : key;
  if (kind === 'pc') return MINIATURES[key] ?? null;
  return (bundledMonsterIds.has(modelKey) ? MINIATURES[modelKey] : null) ?? (bundledMonsterIds.has(key) ? MINIATURES[key] : null) ?? generated[key] ?? null;
}
