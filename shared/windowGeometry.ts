import clipping from 'polygon-clipping';
import type {MapWall,WallPoint} from './mapWalls.js';
import {wallContours,wallBoundarySegments,insideWallGeometry} from './wallGeometry.js';
import {cutPolygonDoor} from './wallPolygonDoor.js';

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

/** Project a painted opening on a wall face onto the nearest cap, then cut a
 * bounded local band through its complete thickness, including curved walls. */
export function fitWindow(marker:MapWall,walls:readonly MapWall[],grid:number):{wall?:MapWall;issue?:string}{
 const c={x:(marker.ax+marker.bx)/2,y:(marker.ay+marker.by)/2};
 let nearest:{w:MapWall;p:WallPoint;a:WallPoint;b:WallPoint;distance:number}|undefined;
 for(const w of walls.filter(w=>!w.door&&!w.window))for(const {a,b} of wallBoundarySegments(w)){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.y-a.y)*dy)/(dx*dx+dy*dy||1))),p={x:a.x+dx*t,y:a.y+dy*t},distance=Math.hypot(c.x-p.x,c.y-p.y);
  if(!nearest||distance<nearest.distance)nearest={w,p,a,b,distance};
 }
 if(!nearest||nearest.distance>grid*.9)return {issue:'No nearby wall. Remove this candidate or adjust the walls.'};
 const {a,b,p,w}=nearest,dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),tx=dx/l,ty=dy/l;
 const corners=[{x:marker.ax,y:marker.ay},{x:marker.bx,y:marker.ay},{x:marker.bx,y:marker.by},{x:marker.ax,y:marker.by}];
 const span=corners.map(q=>(q.x-c.x)*tx+(q.y-c.y)*ty),half=Math.max(3,(Math.max(...span)-Math.min(...span))/2);
 const parts=cutPolygonDoor(w,{wallId:w.id,id:'window-fit',ax:p.x-tx*half,ay:p.y-ty*half,bx:p.x+tx*half,by:p.y+ty*half});
 const band=parts?.find(w=>w.door);if(!band)return {issue:'Could not fit this opening through the wall.'};
 // Extend the sight cut slightly beyond the exact cap to avoid seam leaks.
 const nx=-ty,ny=tx,project=band.points!.map(q=>(q.x-p.x)*nx+(q.y-p.y)*ny),lo=Math.min(...project)-1,hi=Math.max(...project)+1;
 const point=(s:number,n:number)=>({x:p.x+tx*s+nx*n,y:p.y+ty*s+ny*n});
 const points=[point(-half,lo),point(half,lo),point(half,hi),point(-half,hi)];
 if(walls.some(w=>w.window&&insideWallGeometry(p,w)))return {issue:'A window already exists here.'};
 return {wall:{id:marker.id,window:true,kind:'polygon',points,ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y))}};
}
