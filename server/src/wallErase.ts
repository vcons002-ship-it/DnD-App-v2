import {randomUUID} from 'node:crypto';
import clipping from 'polygon-clipping';
import type {MapWall,WallEdit,WallPoint} from '../../shared/mapWalls.js';
import {wallContours,wallBoundarySegments} from '../../shared/wallGeometry.js';
import {polygonWall} from './wallPolygonDoor.js';

/** Subtract a map-space rectangle. Unaffected walls and functional doors retain
 * their exact saved records. Clipped contours preserve room holes and rotation. */
export function eraseWallArea(walls:MapWall[],area:NonNullable<WallEdit['eraseArea']>):MapWall[]{
 if(!area||![area.ax,area.ay,area.bx,area.by].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000))throw Error('Invalid wall erase area.');
 const x0=Math.min(area.ax,area.bx),x1=Math.max(area.ax,area.bx),y0=Math.min(area.ay,area.by),y1=Math.max(area.ay,area.by);
 if(x1-x0<1||y1-y0<1)throw Error('Drag a rectangle over the section of wall to erase.');
 const cutter:clipping.Polygon=[[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]];
 return walls.flatMap(w=>{
  if(w.door)return [w];
  const rings=wallContours(w);
  if(rings.length){
   const source:clipping.Polygon=rings.map(r=>r.map(p=>[p.x,p.y]));
   if(!clipping.intersection(source,cutter).length)return [w];
   return clipping.difference(source,cutter).map((poly,i)=>polygonWall(i?randomUUID():w.id,poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y})))));
  }
  // Legacy zero-thickness lines have no polygon area. Clip their segments
  // directly so old maps receive the same section-erase behavior.
  const parts:{a:WallPoint;b:WallPoint}[]=[];let changed=false;
  for(const {a,b} of wallBoundarySegments(w)){
   const dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1,hit=true;
   for(const [p,q] of [[-dx,a.x-x0],[dx,x1-a.x],[-dy,a.y-y0],[dy,y1-a.y]]){
    if(Math.abs(p)<1e-9){if(q<0){hit=false;break;}}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);
   }
   if(!hit||lo>=hi||hi<=0||lo>=1){parts.push({a,b});continue;}
   changed=true;
   if(lo>0)parts.push({a,b:{x:a.x+dx*lo,y:a.y+dy*lo}});
   if(hi<1)parts.push({a:{x:a.x+dx*hi,y:a.y+dy*hi},b});
  }
  if(!changed)return [w];
  return parts.filter(({a,b})=>Math.hypot(a.x-b.x,a.y-b.y)>=.1).map(({a,b},i)=>({id:i?randomUUID():w.id,ax:a.x,ay:a.y,bx:b.x,by:b.y}));
 });
}
