import manifest from '../../public/miniatures/manifest.json';
import monsters from '../../public/miniatures/monsters/manifest.json';
import qualityManifest from '../../public/miniatures/quality-manifest.json';
import battlefieldManifest from '../../public/miniatures/battlefield-manifest.json';
import generatedQuality from '../../public/miniatures/generated-quality-manifest.json';
import {miniatureLodPair, type MiniatureLod, type MiniatureLodBudget} from '../../../shared/miniatureLod';
import type {EnvironmentQuality} from '../../../shared/mapEnvironment';
import objects from '../../public/miniatures/objects/manifest.json';
import type { TokenKind } from '../../../shared/types';
import { type MonsterAppearance, monsterVariation, monsterVariantIds } from '../../../shared/monsterAppearance';
import { productionFamily, validMiniatureDetail, type ProducedMiniature, type MiniatureDetailAsset } from '../../../shared/assetProduction';
import { useEffect, useSyncExternalStore } from 'react';

/** Fit by the measured round base, never by weapons or full height. */
export type MiniatureDefinition = {
  id: string;
  url: string;
  baseDiameter: number;
  baseCenter: [number, number, number];
  fxUrl?: string;
  baseTextureUrl?: string;
  fallbackUrl?: string;
  highDetail?: MiniatureDetailAsset;
  balancedDetail?: MiniatureDetailAsset;
};
const reviewedHigh=new Map<string,{highDetail:MiniatureDetailAsset;balancedDetail?:MiniatureDetailAsset}>(generatedQuality.models.map(m=>[m.baseSha256,m]));
function withReviewedHigh<T extends {sha256?:string;highDetail?:MiniatureDetailAsset;balancedDetail?:MiniatureDetailAsset}>(model:T):T{
  const reviewed=model.sha256?reviewedHigh.get(model.sha256):undefined;
  const highDetail=model.highDetail??reviewed?.highDetail,balancedDetail=model.balancedDetail??reviewed?.balancedDetail;
  return highDetail?{...model,highDetail,...(balancedDetail?{balancedDetail}:{})}:model;
}
/** Four-view Hunyuan reconstruction, shared by all defeated creature markers. */
export const DEATH_SKULL: MiniatureDefinition = {id:'death-skull',url:'/miniatures/objects/death-skull-c1d9470a2def.glb',baseDiameter:1,baseCenter:[0,0,0]};
export const SPIRITUAL_WEAPON: MiniatureDefinition = {id:'spiritual-weapon',url:'builtin:spiritual-weapon',baseDiameter:1,baseCenter:[0,0,0]};
// Druk's approved Battlefield sculpt is the runtime choice at every preset and
// distance. Retain the original detail manifests for authoring and comparisons.
const fixedBattlefieldModels=new Map(battlefieldManifest.models.filter(m=>m.id==='druk').map(m=>[m.id,m]));
export const MINIATURES = Object.fromEntries([...manifest.models, ...monsters.models, ...monsters.variants, ...objects.models].map(model => [model.id, fixedBattlefieldModels.get(model.id)??withReviewedHigh(model)])) as unknown as Record<MiniatureDefinition['id'], MiniatureDefinition>;
const generated: Record<string, MiniatureDefinition> = Object.create(null);
// Fixed choices have no alternate tier or denser fallback. Excluding them from
// these maps also leaves generated/uploaded models with the same ID alone.
const qualityModels=new Map(qualityManifest.models.filter(m=>!fixedBattlefieldModels.has(m.id)).map(m=>[`${m.id}:${m.profile}`,{...MINIATURES[m.id],url:m.url,fallbackUrl:MINIATURES[m.id].url}]));
const battlefieldModels=new Map(battlefieldManifest.models.filter(m=>!fixedBattlefieldModels.has(m.id)).map(m=>[m.id,{...MINIATURES[m.id],url:m.url,fallbackUrl:qualityModels.get(`${m.id}:low`)?.url??MINIATURES[m.id].url}]));
/** Character variants share the original bases, FX and art. Other families stay
 * on their existing, already reduced geometry. */
export function miniatureForLod(model:MiniatureDefinition,level:MiniatureLod,quality?:MiniatureLodBudget):MiniatureDefinition{
  if(model.highDetail){
    // Only two files per mode: the coarse model and that mode's close-up.
    // Creatures have High only; generated heroes also retain a Balanced tier.
    const high=level==='high'&&(!quality||miniatureLodPair(quality).near==='high');
    const balanced=level==='balanced'&&(!quality||miniatureLodPair(quality).near==='balanced');
    const detail=high?model.highDetail:balanced?model.balancedDetail:undefined;
    return detail?{...model,url:detail.url,fallbackUrl:model.url}:model;
  }
  if(!battlefieldModels.has(model.id))return model;
  const selected=level==='battlefield'?battlefieldModels.get(model.id)!:level==='high'?MINIATURES[model.id]:qualityModels.get(`${model.id}:${level}`)??model;
  if(!quality)return selected;
  // A failed coarse asset must not silently fetch a denser/off-screen model.
  // A requested close-up may fall back to the same mode's coarse tier only.
  const far=miniatureLodPair(quality).far;
  return {...selected,fallbackUrl:level===far?undefined:miniatureForLod(model,far).url};
}
/** Hidden/off-screen preparation only downloads the current mode's coarse tier. */
export function miniatureForPreload(model:MiniatureDefinition,quality:MiniatureLodBudget):MiniatureDefinition{
  return miniatureForLod(model,miniatureLodPair(quality).far,quality);
}
/** Stable IDs/base measurements keep effects, hit areas and facing identical across tiers. */
export function miniatureForQuality(model:MiniatureDefinition|null,quality:EnvironmentQuality):MiniatureDefinition|null{
  if(!model||quality==='high'||quality==='auto')return model;
  return qualityModels.get(`${model.id}:${quality==='balanced'?'balanced':'low'}`)??model;
}
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
    for (const model of valid) {
      const {highDetail,balancedDetail,...base}=model;
      const safe=(detail:MiniatureDetailAsset|undefined)=>detail&&validMiniatureDetail(detail,model.triangles)?detail:undefined;
      const safeHigh=safe(highDetail),safeBalanced=safe(balancedDetail);
      generated[model.id]=withReviewedHigh({...base,...(safeHigh?{highDetail:safeHigh,...(safeBalanced?{balancedDetail:safeBalanced}:{})}:{})});
    }
    revision++; listeners.forEach(listener => listener());
  } catch { /* Keep the last usable catalog during network interruptions. */ }
  finally { pending = false; }
}
let users = 0, timer: ReturnType<typeof setInterval> | undefined;
const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshMiniatureCatalog(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useMiniatureCatalog() {
  const current = useSyncExternalStore(subscribe, () => revision);
  useEffect(() => {
    users++;
    // The server pushes `assets:catalog` when a model is published; this slow
    // poll is only a fallback for a missed push (it used to run every 5 s on
    // every client), plus a refresh when the tab comes back into view.
    if (users === 1) {
      void refreshMiniatureCatalog();
      timer = setInterval(() => { void refreshMiniatureCatalog(); }, 30_000);
      document.addEventListener('visibilitychange', refreshWhenVisible);
    }
    return () => { users--; if (!users) { clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible); } };
  }, []);
  return current;
}
export function miniatureFamilies() { return [...new Set([...monsters.models.map(m => m.id), ...Object.keys(generated)])]; }
/** Prepare every art variant of a requested family, independently of the number
 * or variant of concealed tokens. Assets never create a token/hit region. */
export function miniaturePreloadDefinitions(families:readonly string[]):MiniatureDefinition[]{
  const definitions=new Map<string,MiniatureDefinition>();
  for(const family of families){
    for(const id of new Set([family,...monsterVariantIds(family)])){
      const model=id==='spiritual-weapon'?SPIRITUAL_WEAPON:MINIATURES[id]??generated[id];
      if(model)definitions.set(model.url,model);
    }
  }
  return [...definitions.values()];
}
export function resolveMiniature(name: string, kind: TokenKind, appearance: MonsterAppearance = {}, creatureId = ''): MiniatureDefinition | null {
  if(kind==='pc'&&appearance.modelType)return generated[appearance.modelType]??MINIATURES[appearance.modelType]??null;
  // Objects use their semantic kind, independent of creature matching and generation.
  if (kind === 'monster' && appearance.objectKind) {
    if(appearance.modelType&&generated[appearance.modelType])return generated[appearance.modelType];
    if(appearance.modelType==='spiritual-weapon')return SPIRITUAL_WEAPON;
    return MINIATURES[`object-${appearance.objectKind}`] ?? null;
  }
  const key = kind === 'pc' ? name.trim().toLowerCase() : productionFamily({ ...appearance, name });
  if (!key || (kind === 'pc' && !['druk', 'varis', 'vanec'].includes(key))) return null;
  const variant = kind === 'monster' ? monsterVariation(key, creatureId).variant : 0;
  const modelKey = kind === 'monster' ? monsterVariantIds(key)[variant] : key;
  if (kind === 'pc') return MINIATURES[key] ?? null;
  return (bundledMonsterIds.has(modelKey) ? MINIATURES[modelKey] : null) ?? (bundledMonsterIds.has(key) ? MINIATURES[key] : null) ?? generated[key] ?? null;
}
