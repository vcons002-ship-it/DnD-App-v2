import type {DoorMarker} from './mapDoorDraft.js';
import type {MapWall} from './mapWalls.js';
import {insideWallGeometry,wallBoundarySegments} from './wallGeometry.js';

/** Fit the detected line to nearby jambs. Never cut or move existing wall art. */
export function fitDoorMarker(marker:DoorMarker,walls:readonly MapWall[],gridSizePx:number):{wall?:MapWall;issue?:string} {
  const dx=marker.bx-marker.ax,dy=marker.by-marker.ay,length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<2)return {issue:'The door marker is too short.'};
  const x=(marker.ax+marker.bx)/2,y=(marker.ay+marker.by)/2,tx=dx/length,ty=dy/length;
  if(walls.some(w=>w.door&&Math.hypot((w.ax+w.bx)/2-x,(w.ay+w.by)/2-y)<Math.max(gridSizePx*.5,length*.25)))return {issue:'A working door already exists here.'};
  const solids=walls.filter(w=>!w.door);
  if(solids.some(w=>insideWallGeometry({x,y},w)))return {issue:'A wall covers this opening. Adjust it or use Draw door opening first.'};
  const hits:number[]=[];
  for(const wall of solids)for(const {a,b} of wallBoundarySegments(wall)){
    const sx=b.x-a.x,sy=b.y-a.y,det=tx*sy-ty*sx;
    if(Math.abs(det)<1e-8)continue;
    const qx=a.x-x,qy=a.y-y,t=(qx*sy-qy*sx)/det,u=(qx*ty-qy*tx)/det;
    if(u>=-1e-7&&u<=1+1e-7)hits.push(t);
  }
  const lo=Math.max(-Infinity,...hits.filter(t=>t<0)),hi=Math.min(Infinity,...hits.filter(t=>t>0));
  // Wall masks follow the top cap, which can sit beyond the visible doorposts.
  // Permit a bounded extension into those jambs, never across a distant room.
  const tolerance=Math.max(2,Math.min(gridSizePx*.75,length*.4));
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||Math.abs(lo+length/2)>tolerance||Math.abs(hi-length/2)>tolerance)return {issue:'The line does not meet walls on both sides. Add or adjust the jambs first.'};
  // A small overlap avoids light leaks at imperfect mask joins without closing
  // any part of the opening when the linked door is opened.
  const pad=Math.max(.5,gridSizePx*.025),half=Math.max(1,Math.min(marker.thickness,gridSizePx*.2))/2;
  const p=(along:number,across:number)=>({x:x+tx*along-ty*across,y:y+ty*along+tx*across});
  const points=[p(lo-pad,-half),p(hi+pad,-half),p(hi+pad,half),p(lo-pad,half)];
  return {wall:{id:marker.id,kind:'polygon',ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y)),points,door:true,open:false}};
}
