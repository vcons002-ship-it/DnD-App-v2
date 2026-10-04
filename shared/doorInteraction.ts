import {distanceToWall,type MapWall,type WallPoint} from './mapWalls.js';
import {wallBoundarySegments,wallVertices} from './wallGeometry.js';

const areas=new WeakMap<MapWall,{scale:number;area:MapWall}>();
/** Full-width doorstep, 5 ft out from each face. Door masks describe the top
 * cap, while illustrated door faces extend towards the floor. This forgiving
 * interaction area never participates in movement or sight blocking. */
export function doorInteractionArea(door:MapWall,pxPerFoot:number):MapWall {
  const cached=areas.get(door);if(cached?.scale===pxPerFoot)return cached.area;
  const edge=wallBoundarySegments(door).reduce((best,next)=>Math.hypot(next.b.x-next.a.x,next.b.y-next.a.y)>Math.hypot(best.b.x-best.a.x,best.b.y-best.a.y)?next:best);
  const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy)||1,tx=dx/length,ty=dy/length;
  const vertices=wallVertices(door),along=vertices.map(p=>p.x*tx+p.y*ty),across=vertices.map(p=>-p.x*ty+p.y*tx);
  const lo=Math.min(...along),hi=Math.max(...along),near=Math.min(...across)-5*pxPerFoot,far=Math.max(...across)+5*pxPerFoot;
  const p=(t:number,n:number)=>({x:t*tx-n*ty,y:t*ty+n*tx});
  const points=[p(lo,near),p(hi,near),p(hi,far),p(lo,far)];
  const area:MapWall={id:door.id,kind:'polygon',points,ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y))};
  areas.set(door,{scale:pxPerFoot,area});return area;
}

/** Reach from the normal creature footprint. Decorative miniature scaling and
 * the viewer's camera never change interaction range. */
export function doorInReach(actor:WallPoint&{widthFt:number},door:MapWall,pxPerFoot:number):boolean {
  if(![actor.x,actor.y,actor.widthFt,pxPerFoot].every(Number.isFinite)||actor.widthFt<=0||pxPerFoot<=0)return false;
  return distanceToWall(actor,doorInteractionArea(door,pxPerFoot))<= (5+actor.widthFt/2)*pxPerFoot+1e-6;
}
