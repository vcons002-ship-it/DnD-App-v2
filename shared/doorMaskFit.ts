import type {DoorMarker} from './mapDoorDraft.js';
import type {MapWall} from './mapWalls.js';
import {insideWallGeometry,wallBoundarySegments} from './wallGeometry.js';

/** Fit the detected line to nearby jambs. Never cut or move existing wall art. */
export function fitDoorMarker(marker:DoorMarker,walls:readonly MapWall[],gridSizePx:number):{wall?:MapWall;issue?:string} {
  const direct=fitDoorLine(marker,walls,gridSizePx);
  if(direct.wall||!marker.footprint||direct.issue?.includes('already exists'))return direct;
  if(!Array.isArray(marker.footprint)||marker.footprint.length<3||marker.footprint.length>32||marker.footprint.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return {issue:'Invalid door footprint.'};
  const cx=(Math.min(...marker.footprint.map(p=>p.x))+Math.max(...marker.footprint.map(p=>p.x)))/2,cy=(Math.min(...marker.footprint.map(p=>p.y))+Math.max(...marker.footprint.map(p=>p.y)))/2;
  const candidates:{marker:DoorMarker;distance:number}[]=[];
  for(const wall of walls.filter(w=>!w.door&&!w.window))for(const {a,b} of wallBoundarySegments(wall)){
    const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);if(l<2)continue;
    const tx=dx/l,ty=dy/l,nx=-ty,ny=tx,along=(cx-a.x)*tx+(cy-a.y)*ty,across=(cx-a.x)*nx+(cy-a.y)*ny;
    const distance=Math.hypot(across,along<0?-along:along>l?along-l:0);if(distance>gridSizePx*.9)continue;
    // Shift only across the wall, retaining the painted position along it.
    const x=cx-nx*across,y=cy-ny*across,span=marker.footprint.map(p=>(p.x-cx)*tx+(p.y-cy)*ty),lo=Math.min(...span),hi=Math.max(...span);
    candidates.push({distance,marker:{...marker,footprint:undefined,ax:x+tx*lo,ay:y+ty*lo,bx:x+tx*hi,by:y+ty*hi,thickness:Math.min(marker.thickness,gridSizePx*.2)}});
  }
  for(const candidate of candidates.sort((a,b)=>a.distance-b.distance)){
    const fit=fitDoorLine(candidate.marker,walls,gridSizePx);if(fit.wall)return fit;
  }
  return {issue:'The filled door does not meet nearby walls on both sides. Add or adjust the jambs first.'};
}
function fitDoorLine(marker:DoorMarker,walls:readonly MapWall[],gridSizePx:number):{wall?:MapWall;issue?:string} {
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
