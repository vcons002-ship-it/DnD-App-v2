import clipping from 'polygon-clipping';
import {db} from './db.js';
import {createPlayerVision} from '../../shared/playerVision.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import type {MapState,MapImage,Token,MonsterPublic} from '../../shared/types.js';

import {visibleTerrain,unionTerrain as union,fogTerrain as fogArea} from '../../shared/explorationSight.js';
export {visibleTerrain} from '../../shared/explorationSight.js';

// Camera motion/flame flicker do not write history. Only changed authoritative
// sight does; the bounded cache avoids repeated clipping on unrelated snapshots.
const cache=new Map<string,{key:string;terrain:ExploredTerrain}>();
const readOnlyCache=new Map<string,{key:string;terrainKey:string;unclipped:ExploredTerrain;terrain:ExploredTerrain}>();
const mergedCache=new Map<string,{terrainKey:string;geometry:string;terrain:ExploredTerrain}>();
const generations=new Map<string,number>();
export const invalidateExploration=(mapId:string)=>generations.set(mapId,explorationGeneration(mapId)+1);
export const explorationGeneration=(mapId:string)=>generations.get(mapId)??0;
export function clearExplorationCache(){cache.clear();readOnlyCache.clear();mergedCache.clear();}

type MemoryRow={terrain_key:string;geometry:string;token_memory:string};
const memoryKey=(mapId:string,characterId?:string)=>characterId?`${mapId}:${characterId}`:mapId;
/** Personal history never falls back to the party row. Switching modes preserves both. */
function memoryStore(mapId:string,characterId?:string){
 const table=characterId?'personal_explored_terrain':'explored_terrain';
 const columns=characterId?'map_id,character_id':'map_id',marks=characterId?'?,?':'?';
 const where=characterId?'map_id=? AND character_id=?':'map_id=?',args=characterId?[mapId,characterId]:[mapId];
 return {
  read:()=>db.prepare(`SELECT terrain_key,geometry,token_memory FROM ${table} WHERE ${where}`).get(...args) as MemoryRow|undefined,
  terrain:(key:string,geometry:string)=>db.prepare(`INSERT INTO ${table}(${columns},terrain_key,geometry) VALUES(${marks},?,?) ON CONFLICT(${columns}) DO UPDATE SET token_memory=CASE WHEN ${table}.terrain_key=excluded.terrain_key THEN ${table}.token_memory ELSE '[]' END,terrain_key=excluded.terrain_key,geometry=excluded.geometry`).run(...args,key,geometry),
  figures:(key:string,figures:string)=>db.prepare(`INSERT INTO ${table}(${columns},terrain_key,token_memory) VALUES(${marks},?,?) ON CONFLICT(${columns}) DO UPDATE SET token_memory=excluded.token_memory`).run(...args,key,figures),
 };
}

/** Forget shared and personal history. Current sight is relearned on the next snapshot. */
export function resetExploration(sessionId:string,mapId:string):boolean {
 if(!db.prepare('SELECT id FROM maps WHERE id=? AND session_id=?').get(mapId,sessionId))return false;
 db.prepare('DELETE FROM explored_terrain WHERE map_id=?').run(mapId);
 db.prepare('DELETE FROM personal_explored_terrain WHERE map_id=?').run(mapId);
 invalidateExploration(mapId);
 for(const entries of [cache,readOnlyCache,mergedCache])for(const key of entries.keys())if(key===mapId||key.startsWith(`${mapId}:`))entries.delete(key);
 return true;
}

export function rememberTerrain(map:MapState,tokens:Token[],tiles:MapImage[],lightAllowed:(t:Token)=>boolean,readOnly=false,precomputedVision?:import('../../shared/playerVision.js').PlayerVision,characterId?:string):ExploredTerrain {
 const terrainKey=explorationKey(map,tiles),store=memoryStore(map.id,characterId);
 const owned=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden&&(!characterId||t.refId===characterId)).map(t=>t.refId));
 let fog:ExploredTerrain|undefined;
 const clipFog=(shape:ExploredTerrain)=>map.mapFogEnabled?clipping.intersection(shape,fog??=fogArea(map)):shape;

  const vision=precomputedVision!==undefined?precomputedVision:(createPlayerVision(map,tokens,owned,lightAllowed)??{rangeFt:60,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,daylight:true,lights:[],origins:tokens.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}))});
  const id=memoryKey(map.id,characterId),key=JSON.stringify([terrainKey,vision,map.mapFogEnabled,map.mapFogEnabled?map.mapFogRevealed:[]]);
  const previous=cache.get(id);
  if(previous?.key===key)return previous.terrain;
  const roPrevious=readOnlyCache.get(id);
  if(readOnly&&roPrevious?.key===key)return roPrevious.terrain;
  const row=store.read();
  if(!readOnly&&roPrevious?.key===key&&roPrevious.terrainKey===terrainKey){
   const geometry=JSON.stringify(roPrevious.unclipped);
   if(geometry!==row?.geometry||terrainKey!==row?.terrain_key)store.terrain(terrainKey,geometry);
   if(mergedCache.size>=512)mergedCache.delete(mergedCache.keys().next().value!);
   mergedCache.set(id,{terrainKey,geometry,terrain:roPrevious.unclipped});
   if(cache.size>=512)cache.delete(cache.keys().next().value!);
   cache.set(id,{key,terrain:roPrevious.terrain});
   return roPrevious.terrain;
  }
  const cached=mergedCache.get(id);
  const saved:ExploredTerrain=row?.terrain_key===terrainKey?(cached?.terrainKey===terrainKey&&cached.geometry===row.geometry?cached.terrain:JSON.parse(row.geometry)):[];
  let result=saved;
  try {
   const seen=clipFog(visibleTerrain(vision));
   if(seen.length){
    result=union([saved,seen]);
    const geometry=JSON.stringify(result);
    if(!readOnly){
     if(geometry!==row?.geometry||terrainKey!==row?.terrain_key)store.terrain(terrainKey,geometry);
     if(mergedCache.size>=512)mergedCache.delete(mergedCache.keys().next().value!);
     mergedCache.set(id,{terrainKey,geometry,terrain:result});
    }
   }
   const unclipped=result;
   result=clipFog(result);
   if(readOnly){
    if(readOnlyCache.size>=512)readOnlyCache.delete(readOnlyCache.keys().next().value!);
    readOnlyCache.set(id,{key,terrainKey,unclipped,terrain:result});
    return result;
   }
  }catch(error){
   // Exploration is cosmetic. A clipping failure must not interrupt gameplay or
   // reveal anything through newly covered DM fog; retry on the next snapshot.
   console.warn('Could not update explored terrain:',error instanceof Error?error.message:error);
   return map.mapFogEnabled?[]:saved;
  }
  if(readOnly)return result;
  if(cache.size>=512)cache.delete(cache.keys().next().value!);
  cache.set(id,{key,terrain:result});return result;
}

export type RevealedFigure={token:Token;monster?:MonsterPublic};
const explorationKey=(map:MapState,tiles:MapImage[])=>JSON.stringify([map.imagePath,map.slidesUrl,tiles.map(t=>[t.imagePath,t.x,t.y,t.w,t.h,t.z])]);
export const terrainIdentity=explorationKey;
/** Merge one completed worker sweep into the latest history, preserving other
 * simultaneous walkers. The caller checks map identity and reset generation. */
export function mergeWalkingTerrain(map:MapState,tiles:MapImage[],seen:ExploredTerrain,tokens?:Token[],characterId?:string){
 if(!seen.length)return;
 const id=memoryKey(map.id,characterId),store=memoryStore(map.id,characterId),key=explorationKey(map,tiles),row=store.read();
 const cached=mergedCache.get(id);
 const saved:ExploredTerrain=row?.terrain_key===key?(cached?.terrainKey===key&&cached.geometry===row.geometry?cached.terrain:JSON.parse(row.geometry)):[];
 const result=union([saved,seen]),geometry=JSON.stringify(result);
 if(geometry!==row?.geometry||key!==row?.terrain_key)store.terrain(key,geometry);
 if(mergedCache.size>=512)mergedCache.delete(mergedCache.keys().next().value!);
 mergedCache.set(id,{terrainKey:key,geometry,terrain:result});
 readOnlyCache.delete(id);
 if(tokens&&!tokens.some(t=>t.carriedLantern&&t.kind==='monster')){
  const owned=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden&&(!characterId||t.refId===characterId)).map(t=>t.refId));
  const vision=createPlayerVision(map,tokens,owned)??{rangeFt:60,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,daylight:true,lights:[],origins:tokens.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}))};
  const cacheKey=JSON.stringify([key,vision,map.mapFogEnabled,map.mapFogEnabled?map.mapFogRevealed:[]]);
  const clipped=map.mapFogEnabled?clipping.intersection(result,fogArea(map)):result;
  if(cache.size>=512)cache.delete(cache.keys().next().value!);
  cache.set(id,{key:cacheKey,terrain:clipped});
 }else cache.delete(id);
}
/** Only true party sightings update these frozen display records. No unseen
 * movement, HP, conditions, or appearance changes are sent to players. */
export function rememberFigures(map:MapState,tiles:MapImage[],tokens:Token[],seen:(token:Token)=>boolean,seenPoint:(x:number,y:number)=>boolean,display:(token:Token)=>MonsterPublic|undefined,readOnly=false,characterId?:string):RevealedFigure[]{
 if(map.explorationMode!=='revealed')return [];
 const key=explorationKey(map,tiles),store=memoryStore(map.id,characterId);
 const row=store.read();
 let saved:RevealedFigure[]=[];
 try{if(row?.terrain_key===key){const value=JSON.parse(row.token_memory);if(Array.isArray(value))saved=value;}}catch{saved=[];}
 const live=new Map(tokens.map(t=>[t.id,t]));
 const records=new Map(saved.filter(r=>{
   const t=live.get(r.token?.id);
   return t&&!t.isHidden&&t.kind==='monster'&&r.token.mapId===map.id&&r.token.refId===t.refId&&Number.isFinite(r.token.x)&&Number.isFinite(r.token.y);
 }).map(r=>[r.token.id,r]));
 for(const token of tokens){
  if(token.kind!=='monster'||token.isHidden)continue;
  if(seen(token))records.set(token.id,{token:{...token},monster:display(token)});
  else {const old=records.get(token.id);if(old&&seenPoint(old.token.x,old.token.y))records.delete(token.id);}
 }
 const result=[...records.values()],encoded=JSON.stringify(result);
 if(!readOnly&&(encoded!==row?.token_memory||row?.terrain_key!==key))store.figures(key,encoded);
 return result;
}
