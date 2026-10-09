import clipping from 'polygon-clipping';
import type {MapWall,WallPoint} from './mapWalls.js';
import {wallContours,wallBoundarySegments,insideWallGeometry} from './wallGeometry.js';

const cache=new WeakMap<readonly MapWall[],MapWall[]>();
/** Windows are independent overlays. Only sight/light geometry is cut; saved
 * solid walls remain intact for movement and for removing a mistaken window. */
export function sightWalls(walls:readonly MapWall[]):readonly MapWall[]{
 const windows=walls.filter(w=>w.window);if(!windows.length)return walls;
 const old=cache.get(walls);if(old)return old;
 const result=walls.filter(w=>!w.window).flatMap(w=>{
  if(w.door)return [w];
  const rings=wallContours(w);if(!rings.length)return [w];
  let polygons:clipping.MultiPolygon=[rings.map(r=>r.map(p=>[p.x,p.y] as [number,number]))];
  for(const win of windows){
   if(!w.rotation&&!win.rotation&&(win.bx<w.ax||win.ax>w.bx||win.by<w.ay||win.ay>w.by))continue;
   const cut=wallContours(win).map(r=>r.map(p=>[p.x,p.y] as [number,number]));
   if(cut.length)try{polygons=clipping.difference(polygons,cut);}catch{return [w];}
  }
  return polygons.map((poly,i)=>{
   const r=poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y}))),points=r[0];
   return {id:w.id+'-sight-'+i,kind:'polygon' as const,ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y)),points,holes:r.slice(1)};
  });
 });cache.set(walls,result);return result;
}

/** Fit to wall faces aligned with the painted opening, never a perpendicular
 * gap endcap. Thickness samples stay local instead of reaching another room. */
export function fitWindow(marker:MapWall,walls:readonly MapWall[],grid:number):{wall?:MapWall;issue?:string}{
 const c={x:(marker.ax+marker.bx)/2,y:(marker.ay+marker.by)/2};
 const width=marker.bx-marker.ax,height=marker.by-marker.ay,horizontal=width>=height;
 const elongated=Math.max(width,height)>Math.min(width,height)*1.2;
 const edges=walls.filter(w=>!w.door&&!w.window&&!w.arch).flatMap(w=>wallBoundarySegments(w).map(e=>({...e,w})));
 const candidates=edges.flatMap(({a,b,w})=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<Math.max(3,grid*.06))return [];
  const tx=dx/length,ty=dy/length,alignment=Math.abs(horizontal?tx:ty);
  if(elongated&&alignment<.75)return [];
  const t=Math.max(.001,Math.min(.999,((c.x-a.x)*dx+(c.y-a.y)*dy)/(length*length)));
  const p={x:a.x+dx*t,y:a.y+dy*t},distance=Math.hypot(c.x-p.x,c.y-p.y);
  if(distance>grid*.9)return [];
  return [{w,p,tx,ty,score:distance+(elongated?(1-alignment)*grid:0)}];
 }).sort((a,b)=>a.score-b.score);
 for(const face of candidates){
 const {tx,ty}=face,nx=-ty,ny=tx;
 const corners=[{x:marker.ax,y:marker.ay},{x:marker.bx,y:marker.ay},{x:marker.bx,y:marker.by},{x:marker.ax,y:marker.by}];
 const span=corners.map(q=>(q.x-c.x)*tx+(q.y-c.y)*ty),half=Math.max(3,(Math.max(...span)-Math.min(...span))/2);
 const project=(p:WallPoint)=>(p.x-c.x)*tx+(p.y-c.y)*ty;
 const bands:{lo:number;hi:number;distance:number}[]=[];
 // The nearest face sample reaches the jamb when the central ray is in a gap.
 for(const s of [0,-half,half,project(face.p)]){
  const hits:number[]=[];
  for(const {a,b,w} of edges){
   if(w!==face.w)continue;
   const sa=project(a)-s,sb=project(b)-s;
   if((sa<0)===(sb<0)||Math.abs(sa-sb)<1e-8)continue;
   const t=sa/(sa-sb),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};hits.push((p.x-c.x)*nx+(p.y-c.y)*ny);
  }
  hits.sort((a,b)=>a-b);
  for(let i=0;i<hits.length-1;i++){
   const lo=hits[i],hi=hits[i+1],mid=(lo+hi)/2,distance=Math.max(lo,0,-hi);
   if(hi-lo<.5||hi-lo>grid*.9||distance>grid*.9)continue;
   if(insideWallGeometry({x:c.x+tx*s+nx*mid,y:c.y+ty*s+ny*mid},face.w))bands.push({lo,hi,distance});
  }
 }
 bands.sort((a,b)=>a.distance-b.distance);const band=bands[0];if(!band)continue;
 const nearby=bands.filter(b=>Math.abs((b.lo+b.hi-band.lo-band.hi)/2)<grid*.25);
 const lo=Math.min(...nearby.map(b=>b.lo))-1,hi=Math.max(...nearby.map(b=>b.hi))+1;
 if(hi-lo>grid)continue;
 const point=(s:number,n:number)=>({x:c.x+tx*s+nx*n,y:c.y+ty*s+ny*n});
 const points=[point(-half,lo),point(half,lo),point(half,hi),point(-half,hi)];
 if(walls.some(w=>w.window&&insideWallGeometry(point(0,(lo+hi)/2),w)))return {issue:'A window already exists here.'};
 return {wall:{id:marker.id,window:true,kind:'polygon',points,ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y))}};
 }
 return {issue:'No nearby wall face suitable for this opening. Remove this candidate or adjust the walls.'};
}
