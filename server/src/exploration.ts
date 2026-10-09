import clipping from 'polygon-clipping';
import {db} from './db.js';
import {createPlayerVision,lightCoverage,type PlayerVision} from '../../shared/playerVision.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from '../../shared/mapWalls.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import type {MapState,MapImage,Token,MonsterPublic} from '../../shared/types.js';

// Boolean intersections also introduce fractional vertices into saved history.
// Normalize BOTH old history and new sight before the next union, otherwise
// successive thick-door openings can leave near-coincident dangling edges.
const quantize=(shape:ExploredTerrain):ExploredTerrain=>shape.map(p=>p.map(r=>r.map(([x,y])=>[Math.round(x*64)/64,Math.round(y*64)/64])));
const union=(parts:ExploredTerrain[])=>parts.length?clipping.union(quantize(parts[0]),...parts.slice(1).map(quantize)):[];
const polygon=(vision:PlayerVision,point:{x:number;y:number},radius:number):ExploredTerrain=>
 // Quantize below a displayed pixel before Boolean operations. Near-identical
 // corner rays at the very distant daylight boundary otherwise accumulate
 // floating-point slivers when consecutive visibility polygons are merged.
 [[wallVisibilityPolygon(point,vision.walls??[],radius).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]];

/** Match current sight: nearby darkness plus distant lit areas, all wall-clipped. */
export function visibleTerrain(vision:PlayerVision):ExploredTerrain {
 if(!vision.origins.length)return [];
 const sight=union(vision.origins.map(o=>polygon(vision,o,SIGHT_EXTENT)));
 if(!vision.heavy)return sight;
 const nearby=union(vision.origins.map(o=>polygon(vision,o,vision.radius)));
 const lights=union(vision.lights.map(l=>{
  let lo=0,hi=l.radius*1.5;
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,l)>.10)lo=mid;else hi=mid;}
  return polygon(vision,l,lo);
 }));
 return union([nearby,...(lights.length?[clipping.intersection(sight,lights)]:[])]);
}

/** Merge horizontal fog runs before clipping to avoid one polygon per grid cell. */
function fogArea(map:MapState):ExploredTerrain {
 const rows=new Map<number,number[]>();
 for(const key of map.mapFogRevealed){const [x,y]=key.split(',').map(Number);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const row=rows.get(y)??[];row.push(x);rows.set(y,row);}
 const parts:ExploredTerrain[]=[];const g=map.gridSizePx;
 for(const [y,cols] of rows){const xs=[...new Set(cols)].sort((a,b)=>a-b);let i=0;
  while(i<xs.length){const start=xs[i];let end=start;while(i+1<xs.length&&xs[i+1]===end+1)end=xs[++i];i++;
   parts.push([[[[start*g,y*g],[(end+1)*g,y*g],[(end+1)*g,(y+1)*g],[start*g,(y+1)*g]]]]);}}
 return union(parts);
}

// Camera motion/flame flicker do not write history. Only changed authoritative
// sight does; the bounded cache avoids repeated clipping on unrelated snapshots.
const cache=new Map<string,{key:string;terrain:ExploredTerrain}>();
export function clearExplorationCache(){cache.clear();}

/** Forget this map's party history. Current sight is relearned on the next snapshot. */
export function resetExploration(sessionId:string,mapId:string):boolean {
 if(!db.prepare('SELECT id FROM maps WHERE id=? AND session_id=?').get(mapId,sessionId))return false;
 db.prepare('DELETE FROM explored_terrain WHERE map_id=?').run(mapId);
 cache.delete(mapId);
 return true;
}

export function rememberTerrain(map:MapState,tokens:Token[],tiles:MapImage[],lightAllowed:(t:Token)=>boolean,readOnly=false):ExploredTerrain {
 const terrainKey=explorationKey(map,tiles);
 const owned=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden).map(t=>t.refId));
 let fog:ExploredTerrain|undefined;
 const clipFog=(shape:ExploredTerrain)=>map.mapFogEnabled?clipping.intersection(shape,fog??=fogArea(map)):shape;

  const vision=createPlayerVision(map,tokens,owned,lightAllowed)??{rangeFt:60,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,daylight:true,lights:[],origins:tokens.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}))};
  const id=map.id,key=JSON.stringify([terrainKey,vision,map.mapFogEnabled,map.mapFogEnabled?map.mapFogRevealed:[]]);
  const previous=cache.get(id);
  if(previous?.key===key)return previous.terrain;
  const row=db.prepare('SELECT terrain_key, geometry FROM explored_terrain WHERE map_id=?').get(map.id) as {terrain_key:string;geometry:string}|undefined;
  const saved:ExploredTerrain=row?.terrain_key===terrainKey?JSON.parse(row.geometry):[];
  let result=saved;
  try {
   const seen=clipFog(visibleTerrain(vision));
   if(seen.length){
    result=union([saved,seen]);
    const geometry=JSON.stringify(result);
    if(!readOnly&&(geometry!==row?.geometry||terrainKey!==row?.terrain_key))db.prepare(`INSERT INTO explored_terrain(map_id,terrain_key,geometry) VALUES(?,?,?) ON CONFLICT(map_id) DO UPDATE SET token_memory=CASE WHEN explored_terrain.terrain_key=excluded.terrain_key THEN explored_terrain.token_memory ELSE '[]' END,terrain_key=excluded.terrain_key,geometry=excluded.geometry`).run(map.id,terrainKey,geometry);
   }
   result=clipFog(result);
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
/** Only true party sightings update these frozen display records. No unseen
 * movement, HP, conditions, or appearance changes are sent to players. */
export function rememberFigures(map:MapState,tiles:MapImage[],tokens:Token[],seen:(token:Token)=>boolean,seenPoint:(x:number,y:number)=>boolean,display:(token:Token)=>MonsterPublic|undefined,readOnly=false):RevealedFigure[]{
 if(map.explorationMode!=='revealed')return [];
 const key=explorationKey(map,tiles);
 const row=db.prepare('SELECT terrain_key,token_memory FROM explored_terrain WHERE map_id=?').get(map.id) as {terrain_key:string;token_memory:string}|undefined;
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
 if(!readOnly&&(encoded!==row?.token_memory||row?.terrain_key!==key))db.prepare("INSERT INTO explored_terrain(map_id,terrain_key,token_memory) VALUES(?,?,?) ON CONFLICT(map_id) DO UPDATE SET token_memory=excluded.token_memory").run(map.id,key,encoded);
 return result;
}
