import {randomUUID} from 'node:crypto';
import type {Token} from '../../shared/types.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import {getMap,listTokens,listMapImages,wallLimitedMove} from './sessions.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {explorationGeneration,mergeWalkingTerrain,terrainIdentity} from './exploration.js';
export type WalkingRoute={id:string;mapId:string;from:{x:number;y:number};to:{x:number;y:number};walls:string;generation:number;half?:ExploredTerrain;samples?:number};
const routes=new Map<string,WalkingRoute>();
export const walkingRoute=(id:string)=>routes.get(id);
/** Preview messages and teleport/relocation commands never call this function. */
export async function recordWalkingMove(previous:Token,next:Token,persist:boolean,relocate=false){
 routes.delete(next.id);
 const map=getMap(next.mapId);if(!map||relocate||previous.mapId!==next.mapId||next.teleportedAt!==previous.teleportedAt||Math.hypot(next.x-previous.x,next.y-previous.y)<.001)return;
 const safe=wallLimitedMove(previous,next.x,next.y);if(Math.hypot(safe.x-next.x,safe.y-next.y)>.01)return;
 const route:WalkingRoute={id:randomUUID(),mapId:map.id,from:{x:previous.x,y:previous.y},to:{x:next.x,y:next.y},walls:JSON.stringify(map.walls??[]),generation:explorationGeneration(map.id)};
 if(routes.size>=2048)routes.delete(routes.keys().next().value!);routes.set(next.id,route);
 if(next.isHidden||!(next.kind==='pc'||next.carriedLantern))return;
 const generation=explorationGeneration(map.id),tiles=listMapImages(map.id),identity=terrainIdentity(map,tiles);
 // Worker receives immutable movement-time inputs, with no DB handle or socket.
 const result=await visibilityWorkers.run({walkSight:{map,tokens:listTokens(map.id),tokenId:next.id,from:route.from,to:route.to}});
 route.half=result.half;route.samples=result.samples;
 const current=getMap(map.id);
 if(persist&&current&&explorationGeneration(map.id)===generation&&terrainIdentity(current,listMapImages(map.id))===identity)mergeWalkingTerrain(current,listMapImages(map.id),result.seen);
}
