import {unionTerrain} from '../../shared/explorationSight.js';
import {randomUUID} from 'node:crypto';
import type {Token} from '../../shared/types.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';
import {getMap,listTokens,listMapImages} from './sessions.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {explorationGeneration,mergeWalkingTerrain,terrainIdentity} from './exploration.js';
export type WalkingRoute={id:string;mapId:string;from:{x:number;y:number};to:{x:number;y:number};walls:string;generation:number;crossedWall?:boolean;half?:ExploredTerrain;halfByCharacter?:Record<string,ExploredTerrain>;samples?:number};
const routes=new Map<string,WalkingRoute>();
export const walkingRoute=(id:string)=>routes.get(id);
/** Preview messages and teleport/relocation commands never call this function. */
export async function recordWalkingMove(previous:Token,next:Token,persist:boolean,relocate=false){
 routes.delete(next.id);
 const map=getMap(next.mapId);if(!map||relocate||previous.mapId!==next.mapId||next.teleportedAt!==previous.teleportedAt||Math.hypot(next.x-previous.x,next.y-previous.y)<.001)return;
 const center=stopAtWalls(previous,next,0,map.walls);
 const crossedWall=Math.hypot(center.x-next.x,center.y-next.y)>.01||!hasLineOfSight(previous,next,map.walls);
 const route:WalkingRoute={id:randomUUID(),mapId:map.id,from:{x:previous.x,y:previous.y},to:{x:next.x,y:next.y},walls:JSON.stringify(map.walls??[]),generation:explorationGeneration(map.id),...(crossedWall?{crossedWall:true}:{})};
 if(routes.size>=2048)routes.delete(routes.keys().next().value!);routes.set(next.id,route);
 if(crossedWall||next.isHidden||!(next.kind==='pc'||next.carriedLantern))return;
 const generation=explorationGeneration(map.id),tiles=listMapImages(map.id),identity=terrainIdentity(map,tiles);
 // Worker receives immutable movement-time inputs, with no DB handle or socket.
 const tokens=listTokens(map.id);
 if(map.sharedPartyVision===false){
  const ids=[...new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden).map(t=>t.refId))];
  const results=await Promise.all(ids.map(async id=>({id,result:await visibilityWorkers.run({walkSight:{map,tokens,owned:[id],tokenId:next.id,from:route.from,to:route.to}})})));
  route.halfByCharacter=Object.fromEntries(results.map(({id,result})=>[id,result.half]));
  route.half=unionTerrain(results.map(({result})=>result.half));route.samples=results[0]?.result.samples;
  const current=getMap(map.id),latestTiles=listMapImages(map.id);
  if(persist&&current&&current.sharedPartyVision===false&&explorationGeneration(map.id)===generation&&terrainIdentity(current,latestTiles)===identity){
   for(const {id,result} of results)mergeWalkingTerrain(current,latestTiles,result.seen,listTokens(map.id),id);
  }
 }else{
  const result=await visibilityWorkers.run({walkSight:{map,tokens,tokenId:next.id,from:route.from,to:route.to}});
  route.half=result.half;route.samples=result.samples;
  const current=getMap(map.id),latestTiles=listMapImages(map.id);
  if(persist&&current&&explorationGeneration(map.id)===generation&&terrainIdentity(current,latestTiles)===identity)mergeWalkingTerrain(current,latestTiles,result.seen,listTokens(map.id));
 }
}
