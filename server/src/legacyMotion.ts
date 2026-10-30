import type {StateSnapshot} from '../../shared/types.js';
import type {LegacyMotion,LegacyMotionFrame} from '../../shared/legacyMotion.js';
import {unionTerrain} from '../../shared/explorationSight.js';
import {needsVisibilityLayer,usesMapVision} from '../../shared/playerVision.js';
import {equal} from '../../shared/stateDelta.js';
import {walkingRoute} from './walking.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {tokenSprites} from './tokenSprites.js';
import {legacyTerrainFrames} from './legacyTerrain.js';
import {LEGACY_MOTION_STEPS} from '../../shared/legacyMotion.js';
import {tokenMoveProgress} from '../../client/src/canvas/tokenMotion.js';
import {explorationGeneration} from './exploration.js';
import {createSnapshotBuilder} from './visibility.js';
import {listTokens} from './sessions.js';
import type {MovementFrameTiming} from '../../shared/movementTiming.js';
import {walkingMapKey} from './legacyMotionMap.js';
// Send membership plus only display overrides/extras. Repeating two full token
// lists would recreate every unchanged token object in a slow client's React tree.
function fields(s:StateSnapshot,at:number,endpoint:StateSnapshot,moves:LegacyMotion['moves']):LegacyMotionFrame{
 const endTokens=new Map(endpoint.tokens.map(t=>[t.id,t])),endMonsters=new Map(endpoint.monsters.map(m=>[m.id,m]));
 const tokens=s.tokens.filter(t=>!equal(moves[t.id]?{...t,...moves[t.id].to}:t,endTokens.get(t.id)));
 const monsters=s.monsters.filter(m=>!equal(m,endMonsters.get(m.id)));
 const tokenSprites=Object.fromEntries(Object.entries(s.tokenSprites??{}).filter(([id,pair])=>!equal(pair,endpoint.tokenSprites?.[id])));
 return {at,tokenIds:s.tokens.map(t=>t.id),...(tokens.length?{tokens}:{}),...(monsters.length?{monsters}:{}),...(Object.keys(tokenSprites).length?{tokenSprites}:{}),legacyGeometry:s.legacyGeometry,visionRaster:s.visionRaster,visionTiles:s.visionTiles};
}
/** Never infer a walking path from two arbitrary snapshots: teleports, GM
 * relocations, changed maps/fog and coalesced walks must snap immediately. */
export async function prepareLegacyMotion(id:string,before:StateSnapshot,after:StateSnapshot,timing?:MovementFrameTiming,options?:{endpoint?:()=>Promise<StateSnapshot>;current?:()=>boolean;compact?:boolean}):Promise<LegacyMotion|undefined>{
 if(!before.map||!after.map||before.explorationEpoch!==after.explorationEpoch||walkingMapKey(before.map)!==walkingMapKey(after.map)||!equal(before.mapImages,after.mapImages)||before.tokenLayerRaster||after.tokenLayerRaster)return;
 const old=new Map(before.tokens.map(t=>[t.id,t])),moves:LegacyMotion['moves']={},routes=[];
 for(const t of after.tokens){
  const previous=old.get(t.id);if(!previous||previous.x===t.x&&previous.y===t.y)continue;
  const route=walkingRoute(t.id);
  if(!route||route.generation!==explorationGeneration(after.map.id)||t.teleportedAt!==previous.teleportedAt||route.mapId!==after.map.id||route.walls!==JSON.stringify(after.map.walls??[])||route.from.x!==previous.x||route.from.y!==previous.y||route.to.x!==t.x||route.to.y!==t.y)return;
  moves[t.id]={from:route.from,to:route.to};routes.push(route);
 }
 if(!routes.length)return;
 const current=new Map(listTokens(after.map.id).map(t=>[t.id,t]));
 const first={...before,tokens:before.tokens.filter(t=>current.has(t.id)&&!current.get(t.id)!.isHidden),partyView:undefined,legacyMotion:undefined};
 const positions=new Map<string,{x:number;y:number}>(),originIds=new Set(after.playerVision?.origins.map(o=>o.id));
 const build=createSnapshotBuilder(after.map.sessionId,{positions,owned:new Set([...current.values()].filter(t=>originIds.has(t.id)).map(t=>t.refId))});
 const rawViews:StateSnapshot[]=[];
 // Exploration changes only at the route's halfway and final poses. Reuse
 // these unions rather than clipping the same remembered terrain 13 times.
 const remembered=unionTerrain([before.exploredTerrain??[]]);
 const halfway=unionTerrain([before.exploredTerrain??[],...routes.flatMap(r=>r.half?[r.half]:[])]);
 for(let index=0;index<=LEGACY_MOTION_STEPS;index++){
  if(options?.current&&!options.current())return;
  const at=index/LEGACY_MOTION_STEPS,t=tokenMoveProgress(at,1);
  positions.clear();for(const [tid,p] of Object.entries(moves))positions.set(tid,{x:p.from.x+(p.to.x-p.from.x)*t,y:p.from.y+(p.to.y-p.from.y)*t});
  const authorized=index===0?first:index===LEGACY_MOTION_STEPS?after:build?.(after.role,after.map.id,id);
  if(!authorized||authorized.map?.id!==after.map.id)return;
  rawViews.push({...after,...authorized,partyView:undefined,legacyMotion:undefined,
   exploredTerrain:index===LEGACY_MOTION_STEPS?after.exploredTerrain:t>=.5?halfway:remembered});
 }
 const hasFullGeometry=(s:StateSnapshot)=>!!s.legacyGeometry&&!s.visionRaster&&!s.visionTiles&&(!needsVisibilityLayer(s.map,s.playerVision)||s.legacyGeometry.sight.length>0||s.legacyGeometry.near.length>0||s.legacyGeometry.lights.length>0||(s.legacyGeometry.memory?.length??0)>0);
 const prepared=await Promise.all(rawViews.map(async(view,index)=>{
  if(options?.current&&!options.current())return view;
  if(index===LEGACY_MOTION_STEPS&&hasFullGeometry(after))view.legacyGeometry=after.legacyGeometry;
  else if(index===0&&hasFullGeometry(before)&&first.tokens.length===before.tokens.length)view.legacyGeometry=before.legacyGeometry;
  else if(view.playerVision&&needsVisibilityLayer(view.map,view.playerVision))view.legacyGeometry=await visibilityWorkers.run({mapId:view.map!.id,vision:view.playerVision,wallFog:usesMapVision(view.map),explored:view.exploredTerrain,tokens:view.tokens},timing?span=>timing.workers.push(span):undefined);
  else view.legacyGeometry={sight:[],near:[],lights:[],memory:[],affinity:view.tokens.filter(t=>!t.sharedSightOnly).map(t=>t.id)};
  if(view.playerVision)view.tokenSprites=await tokenSprites(id,view,true);
  return view;
 }));
 if(options?.current&&!options.current())return;
 const images=needsVisibilityLayer(after.map,after.playerVision)?await legacyTerrainFrames(id,prepared,true,timing,options?.compact===true):undefined;
 const endpoint=options?.endpoint?await options.endpoint():after;
 const output:LegacyMotionFrame[]=[];
 for(let index=0;index<prepared.length;index++)output.push(fields(prepared[index],index/LEGACY_MOTION_STEPS,endpoint,moves));
 // Atlas frames are one decoded image each for cover and graded artwork.
 // Geometry paths remain available only on maps without raster artwork.
 if(images?.atlas)for(const frame of output){frame.visionRaster=undefined;frame.visionTiles=undefined;frame.legacyGeometry={sight:[],near:[],lights:[],memory:[],affinity:frame.legacyGeometry?.affinity??[]};}
 return {id:routes.map(r=>r.id).join(':'),durationMs:400,moves,frames:output,atlas:images?.atlas};
}
