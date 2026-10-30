import type {StateSnapshot} from '../../shared/types.js';
import type {LegacyMotion,LegacyMotionFrame} from '../../shared/legacyMotion.js';
import {unionTerrain} from '../../shared/explorationSight.js';
import {needsVisibilityLayer,usesMapVision,visionShowsAffinity} from '../../shared/playerVision.js';
import {legacyPath} from '../../shared/legacyVision.js';
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
import {grantMotionAssets} from './renderAssets.js';
import {renderingLayerKey} from './renderedSnapshot.js';
const intermediateCache=new Map<string,StateSnapshot[]>();
const motionCache=new Map<string,Promise<LegacyMotion|undefined>>();
export function clearLegacyMotionCache(){motionCache.clear();intermediateCache.clear();}
const formatMemory=(explored:StateSnapshot['exploredTerrain'])=>(explored??[]).map(p=>p.map(r=>legacyPath(r.map(([x,y])=>({x,y})))).join(''));
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
 const coalesceKey=JSON.stringify([renderingLayerKey(before),renderingLayerKey(after),routes.map(r=>`${r.id}:${r.generation}`),options?.compact===true]);
 const existing=motionCache.get(coalesceKey);
 if(existing){
  const shared=await existing;
  if(shared&&grantMotionAssets(id,shared)){
   motionCache.delete(coalesceKey);motionCache.set(coalesceKey,existing);
   return shared;
  }
  motionCache.delete(coalesceKey);
 }
 const work=(async():Promise<LegacyMotion|undefined>=>{
  const current=new Map(listTokens(after.map!.id).map(t=>[t.id,t]));
  const first={...before,tokens:before.tokens.filter(t=>current.has(t.id)&&!current.get(t.id)!.isHidden),partyView:undefined,legacyMotion:undefined};
  const rawViews:StateSnapshot[]=[];
  // Exploration changes only at the route's halfway and final poses. Reuse
  // these unions rather than clipping the same remembered terrain 13 times.
  const remembered=unionTerrain([before.exploredTerrain??[]]);
  const halfway=unionTerrain([before.exploredTerrain??[],...routes.flatMap(r=>r.half?[r.half]:[])]);
  if(!after.playerVision){
   for(let index=0;index<=LEGACY_MOTION_STEPS;index++){
    if(options?.current&&!options.current())return;
    const at=index/LEGACY_MOTION_STEPS,t=tokenMoveProgress(at,1);
    const base=index===0?first:index===LEGACY_MOTION_STEPS?after:{...after,tokens:after.tokens.map(tok=>{const p=moves[tok.id];return p?{...tok,x:p.from.x+(p.to.x-p.from.x)*t,y:p.from.y+(p.to.y-p.from.y)*t}:tok;})};
    rawViews.push({...after,...base,partyView:undefined,legacyMotion:undefined});
   }
  }else{
   const originIds=new Set(after.playerVision?.origins.map(o=>o.id));
   const ownedIds=[...current.values()].filter(t=>originIds.has(t.id)).map(t=>t.refId).sort();
   const routeKey=routes.map(r=>`${r.id}:${r.generation}:${r.from.x},${r.from.y}->${r.to.x},${r.to.y}`).join('|');
   const cacheKey=JSON.stringify([after.map,after.role,ownedIds,routeKey,after.tokens,after.monsters,before.exploredTerrain??[],after.exploredTerrain??[]]);
   let intermediates=intermediateCache.get(cacheKey);
   if(!intermediates){
    const positions=new Map<string,{x:number;y:number}>();
    const build=createSnapshotBuilder(after.map!.sessionId,{positions,owned:new Set(ownedIds)});
    const built:StateSnapshot[]=[];
    for(let index=1;index<LEGACY_MOTION_STEPS;index++){
     if(options?.current&&!options.current())return;
     const at=index/LEGACY_MOTION_STEPS,t=tokenMoveProgress(at,1);
     positions.clear();for(const [tid,p] of Object.entries(moves))positions.set(tid,{x:p.from.x+(p.to.x-p.from.x)*t,y:p.from.y+(p.to.y-p.from.y)*t});
     const authorized=build?.(after.role,after.map!.id,id);
     if(!authorized||authorized.map?.id!==after.map!.id)return;
     built.push({...authorized,exploredTerrain:t>=.5?halfway:remembered});
    }
    intermediates=built;
    if(intermediateCache.size>=16)intermediateCache.delete(intermediateCache.keys().next().value!);
    intermediateCache.set(cacheKey,intermediates);
   }
   rawViews.push({...after,...first,partyView:undefined,legacyMotion:undefined,exploredTerrain:remembered});
   for(const step of intermediates)rawViews.push({...after,...step,partyView:undefined,legacyMotion:undefined});
   rawViews.push({...after,partyView:undefined,legacyMotion:undefined,exploredTerrain:after.exploredTerrain});
  }
  const hasFullGeometry=(s:StateSnapshot)=>!!s.legacyGeometry&&!s.visionRaster&&!s.visionTiles&&(!needsVisibilityLayer(s.map,s.playerVision)||s.legacyGeometry.sight.length>0||s.legacyGeometry.near.length>0||s.legacyGeometry.lights.length>0||(s.legacyGeometry.memory?.length??0)>0);
  const rememberedMemory=after.playerVision?formatMemory(remembered):[];
  const halfwayMemory=after.playerVision?formatMemory(halfway):[];
  const prepared=await Promise.all(rawViews.map(async(view,index)=>{
   if(options?.current&&!options.current())return view;
   const t=tokenMoveProgress(index/LEGACY_MOTION_STEPS,1);
   if(index===LEGACY_MOTION_STEPS&&hasFullGeometry(after))view.legacyGeometry=after.legacyGeometry;
   else if(index===0&&hasFullGeometry(before)&&first.tokens.length===before.tokens.length)view.legacyGeometry=before.legacyGeometry;
   else if(view.playerVision&&needsVisibilityLayer(view.map,view.playerVision)){
    if(hasFullGeometry(after)&&equal(view.playerVision,after.playerVision)){
     view.legacyGeometry={sight:after.legacyGeometry!.sight,near:after.legacyGeometry!.near,lights:after.legacyGeometry!.lights,memory:t>=.5?halfwayMemory:rememberedMemory,affinity:view.tokens.filter(tok=>!tok.sharedSightOnly&&visionShowsAffinity(view.playerVision,tok.x,tok.y)).map(tok=>tok.id)};
    }else{
     const geom=await visibilityWorkers.run({mapId:view.map!.id,vision:view.playerVision,wallFog:usesMapVision(view.map),tokens:view.tokens.map(({id,x,y,sharedSightOnly})=>({id,x,y,sharedSightOnly}))},timing?span=>timing.workers.push(span):undefined);
     view.legacyGeometry={...geom,memory:index===LEGACY_MOTION_STEPS?formatMemory(after.exploredTerrain):t>=.5?halfwayMemory:rememberedMemory};
    }
   }
   else view.legacyGeometry={sight:[],near:[],lights:[],memory:[],affinity:view.tokens.filter(t=>!t.sharedSightOnly).map(t=>t.id)};
   return view;
  }));
  if(options?.current&&!options.current())return;
  const endById=options?.endpoint?new Map(after.tokens.map(t=>[t.id,t])):undefined;
  const endAffinity=options?.endpoint&&after.legacyGeometry?new Set(after.legacyGeometry.affinity):undefined;
  const endMonsters=options?.endpoint?new Map(after.monsters.map(m=>[m.id,m])):undefined;
  const [images]=await Promise.all([
   needsVisibilityLayer(after.map,after.playerVision)?legacyTerrainFrames(id,prepared,true,timing,options?.compact===true):undefined,
   Promise.all(prepared.map(async(view,index)=>{
    if(!view.playerVision||(options?.current&&!options.current()))return;
    if(endById&&endAffinity&&endMonsters){
     if(index===LEGACY_MOTION_STEPS){view.tokenSprites={};return;}
     const viewAffinity=new Set(view.legacyGeometry?.affinity??[]);
     const viewMonsters=new Map(view.monsters.map(m=>[m.id,m]));
     const changedTokens=view.tokens.filter(t=>{
      const endTok=endById.get(t.id);if(!endTok)return true;
      if(!!t.sharedSightOnly!==!!endTok.sharedSightOnly||viewAffinity.has(t.id)!==endAffinity.has(t.id))return true;
      if(!equal(moves[t.id]?{...t,...moves[t.id].to}:t,endTok))return true;
      return t.kind==='monster'&&!equal(viewMonsters.get(t.refId),endMonsters.get(t.refId));
     });
     view.tokenSprites=changedTokens.length?await tokenSprites(id,{...view,tokens:changedTokens},true):{};
    }else{
     view.tokenSprites=await tokenSprites(id,view,true);
    }
   })),
  ]);
  if(options?.current&&!options.current())return;
  const endpoint=options?.endpoint?await options.endpoint():after;
  const output:LegacyMotionFrame[]=[];
  for(let index=0;index<prepared.length;index++)output.push(fields(prepared[index],index/LEGACY_MOTION_STEPS,endpoint,moves));
  // Atlas frames are one decoded image each for cover and graded artwork.
  // Geometry paths remain available only on maps without raster artwork.
  if(images?.atlas)for(const frame of output){frame.visionRaster=undefined;frame.visionTiles=undefined;frame.legacyGeometry={sight:[],near:[],lights:[],memory:[],affinity:frame.legacyGeometry?.affinity??[]};}
  return {id:routes.map(r=>r.id).join(':'),durationMs:400,moves,frames:output,atlas:images?.atlas};
 })();
 if(motionCache.size>=16)motionCache.delete(motionCache.keys().next().value!);
 motionCache.set(coalesceKey,work);
 work.then(res=>{if(!res&&motionCache.get(coalesceKey)===work)motionCache.delete(coalesceKey);}).catch(()=>{if(motionCache.get(coalesceKey)===work)motionCache.delete(coalesceKey);});
 return work;
}
