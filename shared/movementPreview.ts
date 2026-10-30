import {resolveWallMovement,wallCollisionRadiusFt} from './mapWalls.js';
import {difficultTravel} from './advancedSpells.js';
import {fogVisionContains,usesTokenVision} from './playerVision.js';
import {tokenVisibleAt} from './fog.js';
import type {StateSnapshot,Token} from './types.js';
export type MovementPreview={x:number;y:number;distanceFt:number;costFt:number;visible:boolean};
export type MovementPreviewJob={token:Token;map:StateSnapshot['map'];vision:StateSnapshot['playerVision'];zones:{x:number;y:number;radiusFt:number}[];x:number;y:number;dm:boolean};
/** Advisory only; commit still performs the full authoritative move operation. */
export function movementPreview(job:MovementPreviewJob):MovementPreview{
 const {token,map,vision,zones,dm}=job,px=(map?.gridSizePx??50)/(map?.feetPerSquare||5);
 const point=dm?{x:job.x,y:job.y}:resolveWallMovement(token,{x:job.x,y:job.y},wallCollisionRadiusFt(token.widthFt)*px,map?.walls);
 const distanceFt=Math.round(Math.max(Math.abs(point.x-token.x),Math.abs(point.y-token.y))/px);
 return {...point,distanceFt,costFt:Math.round((distanceFt+difficultTravel(token,point,zones,px))*10)/10,
  visible:dm||fogVisionContains(vision,point.x,point.y,usesTokenVision(map))&&tokenVisibleAt({role:'player',hidden:token.isHidden,owned:true,foe:false,mapFog:map?.mapFogEnabled?new Set(map.mapFogRevealed):null,tokenFog:map?.tokenFogEnabled?new Set(map.tokenFogRevealed):null,grid:map?.gridSizePx??50,...point})};
}
