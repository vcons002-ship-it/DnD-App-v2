import type {DoorMarker} from './mapDoorDraft.js';
import type {MapWall} from './mapWalls.js';
import {insideWallGeometry,wallBoundarySegments} from './wallGeometry.js';

export type DoorFit = {wall?:MapWall;extensions?:MapWall[];issue?:string};
/** Fit to nearby jambs, adding bounded connections only between facing wall ends. */
export function fitDoorMarker(marker:DoorMarker,walls:readonly MapWall[],gridSizePx:number):DoorFit {
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
  const connected=connectDoorJambs(marker,walls,gridSizePx);if(connected)return connected;
  return {issue:'The filled door does not meet nearby walls on both sides. Add or adjust the jambs first.'};
}

/** Full door art can sit below the caps, with under-masked jambs on either side.
 * Keep the original walls; append editable pieces from their outward-facing
 * ends to the painted door width. Never stretch a door across the whole gap. */
function connectDoorJambs(marker:DoorMarker,walls:readonly MapWall[],grid:number):DoorFit|undefined {
  if(!Number.isFinite(grid)||grid<=0||!marker.footprint)return;
  const footprint=marker.footprint,cx=(Math.min(...footprint.map(p=>p.x))+Math.max(...footprint.map(p=>p.x)))/2,cy=(Math.min(...footprint.map(p=>p.y))+Math.max(...footprint.map(p=>p.y)))/2;
  const ends=walls.filter(w=>!w.door&&!w.window).flatMap(w=>wallBoundarySegments(w).map(s=>({...s,wall:w,c:{x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},length:Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)})))
    .filter(s=>s.length>=2&&s.length<=grid*.75&&Math.hypot(s.c.x-cx,s.c.y-cy)<=grid*2+Math.hypot(marker.bx-marker.ax,marker.by-marker.ay)/2);
  const fits:{fit:DoorFit;score:number}[]=[];
  for(let i=0;i<ends.length;i++)for(let j=i+1;j<ends.length;j++){
    const a=ends[i],b=ends[j];if(a.wall.id===b.wall.id)continue;
    const dx=b.c.x-a.c.x,dy=b.c.y-a.c.y,gap=Math.hypot(dx,dy);if(gap<2)continue;
    const tx=dx/gap,ty=dy/gap,nx=-ty,ny=tx;
    // These must be wall ends facing each other, not parallel faces of a room.
    if(Math.abs((a.b.x-a.a.x)*tx+(a.b.y-a.a.y)*ty)/a.length>.25||Math.abs((b.b.x-b.a.x)*tx+(b.b.y-b.a.y)*ty)/b.length>.25)continue;
    if(insideWallGeometry({x:a.c.x+tx,y:a.c.y+ty},a.wall)||insideWallGeometry({x:b.c.x-tx,y:b.c.y-ty},b.wall))continue;
    const across=(cx-a.c.x)*nx+(cy-a.c.y)*ny,along=(cx-a.c.x)*tx+(cy-a.c.y)*ty;
    if(Math.abs(across)>grid*.9||along<=0||along>=gap)continue;
    const span=footprint.map(p=>(p.x-a.c.x)*tx+(p.y-a.c.y)*ty),lo=Math.min(...span),hi=Math.max(...span),width=hi-lo;
    if(width<grid*.3||width>grid*2||lo<0||hi>gap||lo>grid||gap-hi>grid||lo+gap-hi<1)continue;
    const bridge=(end:typeof a,distance:number,sign:number,index:number):MapWall=>{
      const shift=(p:{x:number;y:number},d:number)=>({x:p.x+tx*d,y:p.y+ty*d});
      const points=[shift(end.a,-sign*.5),shift(end.b,-sign*.5),shift(end.b,distance+sign*.5),shift(end.a,distance+sign*.5)];
      return {id:`${marker.id}-jamb-${index}`,kind:'polygon',points,ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y))};
    };
    const extensions=[...(lo>.5?[bridge(a,lo,1,1)]:[]),...(gap-hi>.5?[bridge(b,hi-gap,-1,2)]:[])];
    // Do not bury another opening or run a connection through unrelated walls.
    if(extensions.some(e=>walls.some(w=>w.id!==a.wall.id&&w.id!==b.wall.id&&(e.points!.some(p=>insideWallGeometry(p,w))||wallBoundarySegments(w).some(s=>[s.a,s.b,{x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2}].some(p=>insideWallGeometry(p,e))||wallBoundarySegments(e).some(t=>{
      const sx=s.b.x-s.a.x,sy=s.b.y-s.a.y,ex=t.b.x-t.a.x,ey=t.b.y-t.a.y,det=sx*ey-sy*ex;
      if(Math.abs(det)<1e-8)return false;
      const qx=t.a.x-s.a.x,qy=t.a.y-s.a.y,u=(qx*ey-qy*ex)/det,v=(qx*sy-qy*sx)/det;
      return u>=0&&u<=1&&v>=0&&v<=1;
    }))))))continue;
    const line={...marker,footprint:undefined,ax:a.c.x+tx*lo,ay:a.c.y+ty*lo,bx:a.c.x+tx*hi,by:a.c.y+ty*hi,thickness:Math.min(marker.thickness,grid*.2)};
    const fit=fitDoorLine(line,[...walls,...extensions],grid);
    if(fit.wall)fits.push({fit:{...fit,extensions},score:Math.abs(across)+lo+gap-hi});
  }
  return fits.sort((a,b)=>a.score-b.score)[0]?.fit;
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
