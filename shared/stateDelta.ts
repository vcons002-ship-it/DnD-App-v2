import type {StateSnapshot} from './types.js';
type Entity={id:string};
export type EntityDelta={upsert:Entity[];remove:string[];order:string[]};
export type SnapshotDelta={set:Partial<StateSnapshot>;unset:(keyof StateSnapshot)[];entities:Partial<Record<keyof StateSnapshot,EntityDelta>>;party?:SnapshotDelta;geometry?:Partial<NonNullable<StateSnapshot['legacyGeometry']>>;maskTiles?:{key:string;bounds:import('./serverRendering.js').RasterTiles['bounds'];set:import('./serverRendering.js').RasterTiles['tiles'];remove:string[]};sprites?:{set:NonNullable<StateSnapshot['tokenSprites']>;remove:string[]};outlines?:{wallsKey:string;set:import('./legacyVision.js').OutlineSet['shapes'];remove:string[]}};
export type StateFrame=({revision:number;full:StateSnapshot}|{revision:number;base:number;delta:SnapshotDelta})&{timing?:import('./movementTiming.js').MovementFrameTiming};
const entityKeys=new Set(['tokens','characters','monsters','monsterTemplates','maps','rollLog','chat','measurements','annotations','mapImages']);
const equal=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
/** Diff already authorized snapshots only. Deleted/hidden entities are explicit removals. */
export function diffSnapshot(before:StateSnapshot,after:StateSnapshot):SnapshotDelta{
 const patch:SnapshotDelta={set:{},unset:[],entities:{}};
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]) as Set<keyof StateSnapshot>){
  const a=before[key],b=after[key];if(equal(a,b))continue;
  if(b===undefined){patch.unset.push(key);continue;}
  if(key==='visionTiles'&&before.visionTiles&&after.visionTiles){const old=before.visionTiles,next=after.visionTiles;patch.maskTiles={key:next.key,bounds:next.bounds,set:{},remove:Object.keys(old.tiles).filter(id=>!(id in next.tiles))};for(const id of Object.keys(next.tiles))if(!equal(old.tiles[id],next.tiles[id]))patch.maskTiles.set[id]=next.tiles[id];continue;}
  if(key==='tokenSprites'&&before.tokenSprites&&after.tokenSprites){const old=before.tokenSprites,next=after.tokenSprites;patch.sprites={set:{},remove:Object.keys(old).filter(id=>!(id in next))};for(const id of Object.keys(next))if(!equal(old[id],next[id]))patch.sprites.set[id]=next[id];continue;}
  if(key==='legacyGeometry'&&a&&b){patch.geometry={};for(const k of Object.keys(b) as (keyof typeof b)[]){if(equal(a[k],b[k]))continue;
   if(k==='outlines'&&before.legacyGeometry?.outlines&&after.legacyGeometry?.outlines){const old=before.legacyGeometry.outlines,next=after.legacyGeometry.outlines;patch.outlines={wallsKey:next.wallsKey,set:{},remove:Object.keys(old.shapes).filter(id=>!(id in next.shapes))};for(const id of Object.keys(next.shapes))if(!equal(old.shapes[id],next.shapes[id]))patch.outlines.set[id]=next.shapes[id];}
   else (patch.geometry as any)[k]=b[k];
  }continue;}
  if(key==='partyView'&&a&&b){patch.party=diffSnapshot(a as StateSnapshot,b as StateSnapshot);continue;}
  if(entityKeys.has(key)&&Array.isArray(a)&&Array.isArray(b)){
   const old=new Map((a as Entity[]).map(e=>[e.id,e]));const ids=new Set((b as Entity[]).map(e=>e.id));
   patch.entities[key]={upsert:(b as Entity[]).filter(e=>!equal(old.get(e.id),e)),remove:(a as Entity[]).filter(e=>!ids.has(e.id)).map(e=>e.id),order:(b as Entity[]).map(e=>e.id)};
  }else (patch.set as Record<string,unknown>)[key]=b;
 }return patch;
}
/** Preserve object references for unchanged entities; omitted optional fields can be removed. */
export function applySnapshotDelta(before:StateSnapshot,patch:SnapshotDelta):StateSnapshot{
 const next={...before,...patch.set};for(const key of patch.unset)delete next[key];
 for(const [key,change] of Object.entries(patch.entities)){
  const rows=new Map(((before as any)[key]??[]).map((e:Entity)=>[e.id,e]));
  for(const id of change.remove)rows.delete(id);for(const entity of change.upsert)rows.set(entity.id,entity);
  (next as any)[key]=change.order.map(id=>rows.get(id));
 }
 if(patch.party&&before.partyView)next.partyView=applySnapshotDelta(before.partyView as StateSnapshot,patch.party);
 if(patch.geometry&&before.legacyGeometry)next.legacyGeometry={...before.legacyGeometry,...patch.geometry};
 if(patch.sprites){next.tokenSprites={...before.tokenSprites,...patch.sprites.set};for(const id of patch.sprites.remove)delete next.tokenSprites[id];}
 if(patch.maskTiles){const tiles={...before.visionTiles?.tiles,...patch.maskTiles.set};for(const id of patch.maskTiles.remove)delete tiles[id];next.visionTiles={key:patch.maskTiles.key,bounds:patch.maskTiles.bounds,tiles};}
 if(patch.outlines&&next.legacyGeometry){const shapes={...before.legacyGeometry?.outlines?.shapes,...patch.outlines.set};for(const id of patch.outlines.remove)delete shapes[id];next.legacyGeometry={...next.legacyGeometry,outlines:{wallsKey:patch.outlines.wallsKey,shapes}};}
 return next;
}
