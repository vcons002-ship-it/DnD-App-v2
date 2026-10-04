import {distanceToWall,type MapWall,type WallPoint} from './mapWalls.js';

/** Reach from the normal creature footprint. Decorative miniature scaling and
 * the viewer's camera never change interaction range. */
export function doorInReach(actor:WallPoint&{widthFt:number},door:MapWall,pxPerFoot:number):boolean {
  if(![actor.x,actor.y,actor.widthFt,pxPerFoot].every(Number.isFinite)||actor.widthFt<=0||pxPerFoot<=0)return false;
  return distanceToWall(actor,door)<= (5+actor.widthFt/2)*pxPerFoot+1e-6;
}
