import clipping from 'polygon-clipping';
import type {MapWall,WallEdit,WallPoint} from './mapWalls.js';
import {wallContours,wallBoundarySegments,insideWallGeometry} from './wallGeometry.js';

export function polygonWall(id:string,rings:WallPoint[][]):MapWall {
 const points=rings[0];
 return {id,kind:'polygon',ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y)),points,...(rings.length>1?{holes:rings.slice(1)}:{})};
}
/** Cut only the local band under the drag, not the far side of a circular room. */
export function cutPolygonDoor(w:MapWall,d:NonNullable<WallEdit['door']>):MapWall[]|null {
 if(w.door||![d.ax,d.ay,d.bx,d.by].every(Number.isFinite)||!/^[\w-]{1,64}$/.test(d.id))return null;
 const rings=wallContours(w);if(!rings.length)return null;
 const dx=d.bx-d.ax,dy=d.by-d.ay,len=Math.hypot(dx,dy);if(len<.1)return null;
 const tx=dx/len,ty=dy/len,nx=-ty,ny=tx,c={x:(d.ax+d.bx)/2,y:(d.ay+d.by)/2};
 const hits:number[]=[];
 for(const {a,b} of wallBoundarySegments(w)){
  const sa=(a.x-c.x)*tx+(a.y-c.y)*ty,sb=(b.x-c.x)*tx+(b.y-c.y)*ty;
  if((sa<0)===(sb<0)||Math.abs(sa-sb)<1e-8)continue;
  const t=sa/(sa-sb),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};hits.push((p.x-c.x)*nx+(p.y-c.y)*ny);
 }
 hits.sort((a,b)=>a-b);
 let band:{lo:number;hi:number;distance:number}|undefined;
 for(let i=0;i<hits.length-1;i++){
  const lo=hits[i],hi=hits[i+1],mid=(lo+hi)/2;
  if(hi-lo<.01||!insideWallGeometry({x:c.x+nx*mid,y:c.y+ny*mid},w))continue;
  const distance=Math.max(lo,0,-hi);if(!band||distance<band.distance)band={lo,hi,distance};
 }
 if(!band)return null;
 // Curves can depart slightly from the tangent over the doorway width. Add a
 // local margin, capped to avoid clipping the opposite side of a small room.
 const pad=Math.min(len*.25,(band.hi-band.lo)*.5)+.2;
 const point=(s:number,n:number):[number,number]=>[c.x+tx*s+nx*n,c.y+ty*s+ny*n];
 const cutter:clipping.Polygon=[[point(-len/2,band.lo-pad),point(len/2,band.lo-pad),point(len/2,band.hi+pad),point(-len/2,band.hi+pad)]];
 const source:clipping.Polygon=rings.map(r=>r.map(p=>[p.x,p.y]));
 try{
  const doors=clipping.intersection(source,cutter);if(doors.length!==1)return null;
  const convert=(poly:clipping.Polygon,id:string)=>polygonWall(id,poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y}))));
  const remaining=clipping.difference(source,cutter).map((p,i)=>convert(p,`${d.id}-part-${i}`));
  return [...remaining,{...convert(doors[0],d.id),door:true,open:false}];
 }catch{return null;} // A degenerate/self-crossing drag leaves the original wall untouched.
}
