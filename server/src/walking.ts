import {unionTerrain,pointInExploredTerrain,tokenInExploredTerrain} from '../../shared/explorationSight.js';
import {randomUUID} from 'node:crypto';
import type {MapState,MapImage,Token} from '../../shared/types.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';
import {isInvisible} from '../../shared/advancedSpells.js';
import {seesInvisible} from '../../shared/invisibleSight.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {tokenVisibleAt} from '../../shared/fog.js';
import {tokenRadiusPx} from '../../shared/playerVision.js';
import {getMap,listTokens,listMapImages,listMonsters,listCharacters} from './sessions.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {explorationGeneration,mergeWalkingTerrain,rememberFigures,terrainIdentity} from './exploration.js';
import {toPlayerMonster} from './visibility.js';
export type WalkingRoute={id:string;mapId:string;from:{x:number;y:number};to:{x:number;y:number};walls:string;generation:number;crossedWall?:boolean;half?:ExploredTerrain;halfByCharacter?:Record<string,ExploredTerrain>;samples?:number};
const routes=new Map<string,WalkingRoute>();
export const walkingRoute=(id:string)=>routes.get(id);
function rememberWalkingFigures(map:MapState,tiles:MapImage[],seen:ExploredTerrain,tokens:Token[],characterId?:string){
 if(!seen.length||map.explorationMode!=='revealed')return;
 const monById=new Map(listMonsters(map.sessionId).map(m=>[m.id,m]));
 const charById=new Map(listCharacters(map.sessionId).map(c=>[c.id,c]));
 const mapFog=map.mapFogEnabled?new Set(map.mapFogRevealed):null;
 const tokenFog=map.tokenFogEnabled?new Set(map.tokenFogRevealed):null;
 const grid=map.gridSizePx??50;
 const manualVisible=(t:Token)=>tokenVisibleAt({role:'player',hidden:t.isHidden,owned:t.kind==='pc',foe:t.kind==='monster'&&monById.get(t.refId)?.disposition!=='friendly',mapFog,tokenFog,grid,x:t.x,y:t.y});
 const party=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden&&!t.visionDisabled&&(!characterId||t.refId===characterId)).map(t=>t.refId));
 const sees=(t:Token)=>{
  const m=monById.get(t.refId);
  if(!m||!manualVisible(t)||!tokenInExploredTerrain(seen,t.x,t.y,tokenRadiusPx(t,map)))return false;
  return !isInvisible(m)||tokens.some(o=>o.kind==='pc'&&!o.visionDisabled&&party.has(o.refId)&&!!charById.get(o.refId)&&seesInvisible(charById.get(o.refId)!,tokenDistanceFt(o,t,map)));
 };
 rememberFigures(map,tiles,tokens,sees,(x,y)=>pointInExploredTerrain(seen,x,y),t=>{const m=monById.get(t.refId);return m?toPlayerMonster(m):undefined;},false,characterId);
}
/** Preview messages and teleport/relocation commands never call this function. */
export async function recordWalkingMove(previous:Token,next:Token,persist:boolean,relocate=false){
 routes.delete(next.id);
 const map=getMap(next.mapId);if(!map||relocate||previous.mapId!==next.mapId||next.teleportedAt!==undefined&&next.teleportedAt!==previous.teleportedAt||Math.hypot(next.x-previous.x,next.y-previous.y)<.001)return;
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
   const latestTokens=listTokens(map.id);
   for(const {id,result} of results){
    mergeWalkingTerrain(current,latestTiles,result.seen,latestTokens,id);
    rememberWalkingFigures(current,latestTiles,result.seen,latestTokens,id);
   }
  }
 }else{
  const result=await visibilityWorkers.run({walkSight:{map,tokens,tokenId:next.id,from:route.from,to:route.to}});
  route.half=result.half;route.samples=result.samples;
  const current=getMap(map.id),latestTiles=listMapImages(map.id);
  if(persist&&current&&explorationGeneration(map.id)===generation&&terrainIdentity(current,latestTiles)===identity){
   const latestTokens=listTokens(map.id);
   mergeWalkingTerrain(current,latestTiles,result.seen,latestTokens);
   rememberWalkingFigures(current,latestTiles,result.seen,latestTokens);
  }
 }
}
