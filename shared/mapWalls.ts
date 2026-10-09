/** Opaque, infinitely tall sight barriers in map pixels. Gaps remain open doorways. */
import {wallBoundarySegments,insideWallGeometry,segmentDistance,pointInRing} from './wallGeometry.js';
import {closestWallHit,visitWallCrossings} from './wallSpatialIndex.js';
import {sightWalls} from './windowGeometry.js';
import {passageWalls} from './archGeometry.js';
export type MapWall = {id: string; ax: number; ay: number; bx: number; by: number;
 kind?:'rectangle'|'circle'|'path'|'polygon';points?:WallPoint[];holes?:WallPoint[][];thickness?:number;rotation?:number;
 door?:boolean;open?:boolean;tokenId?:string;window?:boolean;arch?:boolean};
export type WallPoint = {x: number; y: number};
/** Advisory only: geometry is never dropped or refused based on its edge count. */
export const WALL_PERFORMANCE_WARNING_EDGES = 2000;
export const SIGHT_EXTENT = 4_000_000;
const EPS = 1e-7;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const edgesCache=new WeakMap<readonly MapWall[],MapWall[]>();
export const wallEdgeCount=(walls:readonly MapWall[])=>walls.reduce((count,w)=>count+wallBoundarySegments(w).length,0);
export function wallPerformanceWarning(walls:readonly MapWall[]):string|null {
 const count=wallEdgeCount(walls);
 return count>=WALL_PERFORMANCE_WARNING_EDGES?`Detailed walls (${count.toLocaleString('en-US')} boundary segments) may slow moving lights and visibility on phones or older devices. You can continue; simplify unused detail if movement feels slow.`:null;
}
/** A rectangle is one saved/editable wall; its four edges share the existing ray caster. */
function wallEdges(walls:readonly MapWall[]):MapWall[]{
  const cached=edgesCache.get(walls);if(cached)return cached;
  const edges=walls.filter(w=>!w.door||!w.open).flatMap(w=>wallBoundarySegments(w).map(({a,b})=>({id:w.id,ax:a.x,ay:a.y,bx:b.x,by:b.y})));
  edgesCache.set(walls,edges);return edges;
}
const insideWall=(p:WallPoint,w:MapWall)=>!(w.door&&w.open)&&insideWallGeometry(p,w);
const cornersCache=new WeakMap<readonly MapWall[],WallPoint[]>();
function wallCorners(walls:readonly MapWall[]):WallPoint[]{
  const cached=cornersCache.get(walls);if(cached)return cached;
  const unique=new Map<string,WallPoint>();
  const add=(x:number,y:number)=>unique.set(`${x},${y}`,{x,y});
  for(const w of walls){add(w.ax,w.ay);add(w.bx,w.by);}
  // Crossing strokes create corners too; otherwise rays can cut off the small
  // visible wedge between the two nearest wall segments.
  visitWallCrossings(walls,(a,b)=>{
    const dx=a.bx-a.ax,dy=a.by-a.ay,sx=b.bx-b.ax,sy=b.by-b.ay;
    const det=cross(dx,dy,sx,sy);if(Math.abs(det)<EPS)return;
    const qx=b.ax-a.ax,qy=b.ay-a.ay,t=cross(qx,qy,sx,sy)/det,u=cross(qx,qy,dx,dy)/det;
    if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)add(a.ax+t*dx,a.ay+t*dy);
  });
  const corners=[...unique.values()];
  cornersCache.set(walls,corners);return corners;
}

export function sanitizeWalls(input: unknown): MapWall[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const walls: MapWall[] = [];
  for (const w of input) {
    if (!w || typeof w.id !== 'string' || !/^[\w-]{1,80}$/.test(w.id) || ids.has(w.id)) continue;
    if (![w.ax,w.ay,w.bx,w.by].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000)) continue;
    if (Math.hypot(w.ax-w.bx,w.ay-w.by) < .1) continue;
    if(w.kind!==undefined&&!['rectangle','circle','path','polygon'].includes(w.kind))continue;
    if(['rectangle','circle'].includes(w.kind)&&(Math.abs(w.ax-w.bx)<.1||Math.abs(w.ay-w.by)<.1))continue;
    if(w.rotation!==undefined&&(typeof w.rotation!=='number'||!Number.isFinite(w.rotation)||Math.abs(w.rotation)>36000))continue;
    if(w.thickness!==undefined&&(typeof w.thickness!=='number'||!Number.isFinite(w.thickness)||w.thickness<0||w.thickness>10000))continue;
    const validRing=(r:unknown,min:number):r is WallPoint[]=>Array.isArray(r)&&r.length>=min&&r.every(p=>p&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000));
    if(w.kind==='path'||w.kind==='polygon'){
      if(!validRing(w.points,w.kind==='path'?2:3))continue;
      if(w.points.some((p:WallPoint)=>p.x<Math.min(w.ax,w.bx)-EPS||p.x>Math.max(w.ax,w.bx)+EPS||p.y<Math.min(w.ay,w.by)-EPS||p.y>Math.max(w.ay,w.by)+EPS))continue;
    }
    if(w.holes!==undefined&&(w.kind!=='polygon'||!Array.isArray(w.holes)||w.holes.length>64||!w.holes.every((r:unknown)=>validRing(r,3))))continue;
    if(w.kind==='circle'&&(w.thickness??1)>=Math.min(Math.abs(w.bx-w.ax),Math.abs(w.by-w.ay)))continue;
    const wall:MapWall={id:w.id,ax:w.ax,ay:w.ay,bx:w.bx,by:w.by,...(w.kind?{kind:w.kind}:{}),
      ...(w.rotation!==undefined?{rotation:w.rotation}:{}),...(w.thickness!==undefined?{thickness:w.thickness}:{}),
      ...(['path','polygon'].includes(w.kind)?{points:w.points.filter((p:WallPoint,i:number)=>!i||Math.hypot(p.x-w.points[i-1].x,p.y-w.points[i-1].y)>.001).map((p:WallPoint)=>({x:p.x,y:p.y}))}:{}),
      ...(w.holes?{holes:w.holes.map((r:WallPoint[])=>r.map(p=>({x:p.x,y:p.y})))}:{}),
      ...(w.window===true&&w.door!==true?{window:true}:{}),
      ...(w.arch===true&&w.door!==true&&w.window!==true?{arch:true}:{}),
      ...(w.door===true?{door:true,open:w.open===true,...(typeof w.tokenId==='string'&&/^[\w-]{1,80}$/.test(w.tokenId)?{tokenId:w.tokenId}:{})}:{})};
    if(wall.points&&wall.points.length<(wall.kind==='polygon'?3:2))continue;
    if(wall.kind==='polygon'){
      const ring=wall.points!;
      const area=Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p.x*q.y-q.x*p.y;},0));
      if(area<.01||wall.holes?.some(h=>h.some(p=>!pointInRing(p,ring))))continue;
    }
    if(wallEdgeCount([wall])<1)continue;
    ids.add(w.id);walls.push(wall);
  }
  return walls;
}

/** Distance along a unit ray; endpoints and collinear overlaps also block. */
function rayHit(o: WallPoint, dx: number, dy: number, wall: MapWall): number {
  const sx=wall.bx-wall.ax, sy=wall.by-wall.ay, qx=wall.ax-o.x, qy=wall.ay-o.y;
  const d=cross(dx,dy,sx,sy);
  if (Math.abs(d) < EPS) {
    if (Math.abs(cross(qx,qy,dx,dy)) > EPS) return Infinity;
    const a=qx*dx+qy*dy, b=(wall.bx-o.x)*dx+(wall.by-o.y)*dy;
    if (Math.max(a,b) < EPS) return Infinity;
    return Math.max(0,Math.min(a,b));
  }
  const t=cross(qx,qy,sx,sy)/d, u=cross(qx,qy,dx,dy)/d;
  // A source exactly on a wall has no reliable side: fail closed until moved off it.
  return t >= -EPS && u >= -EPS && u <= 1+EPS ? Math.max(0,t) : Infinity;
}

export function hasLineOfSight(a: WallPoint, b: WallPoint, walls: readonly MapWall[] = []): boolean {
  walls=sightWalls(passageWalls(walls));
  const dx=b.x-a.x,dy=b.y-a.y, distance=Math.hypot(dx,dy);
  if (distance < EPS) return true;
  if(walls.some(w=>insideWall(a,w)||insideWall(b,w)))return false;
  return !wallEdges(walls).some(w => rayHit(a,dx/distance,dy/distance,w) < distance-EPS);
}

export function distanceToWall(p: WallPoint, w: MapWall): number {
  if(insideWallGeometry(p,w))return 0;
  let distance=Infinity;
  for(const {a,b} of wallBoundarySegments(w))distance=Math.min(distance,segmentDistance(p,a,b));
  return distance;
}

/** Rays just either side of each corner preserve narrow doors and crisp wall shadows.
 * Cache per source in callers: camera changes and flame flicker need no new ray casts. */
export function wallVisibilityPolygon(origin: WallPoint, walls: readonly MapWall[], radius: number): WallPoint[] {
  walls=sightWalls(passageWalls(walls));
  if(walls.some(w=>insideWall(origin,w)))return [origin,origin,origin];
  const edges=wallEdges(walls);
  const angles=Array.from({length:96},(_,i)=>i*Math.PI/48);
  for (const {x,y} of wallCorners(edges)) {
    const a=Math.atan2(y-origin.y,x-origin.x);
    angles.push(a-1e-7,a,a+1e-7);
  }
  const sorted=angles.map(a=>(a+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
  const points:{point:WallPoint;wall?:MapWall}[]=[];
  for(const a of sorted){
    const dx=Math.cos(a),dy=Math.sin(a);
    const hit:{wall?:MapWall}={};
    const d=closestWallHit(origin,dx,dy,edges,radius,rayHit,hit);
    const next={point:{x:origin.x+dx*d,y:origin.y+dy*d},wall:hit.wall};
    // Consecutive rays stopped by the same straight edge are collinear. Keep
    // the endpoints only; corners, gaps and radius-limited arcs stay exact.
    if(hit.wall&&points.length>=2&&points.at(-1)!.wall===hit.wall&&points.at(-2)!.wall===hit.wall)points[points.length-1]=next;
    else points.push(next);
  }
  if(points.length>2&&points[0].wall&&points[0].wall===points[1].wall&&points[0].wall===points.at(-1)!.wall)points.shift();
  if(points.length>2&&points[0].wall&&points[0].wall===points.at(-1)!.wall&&points[0].wall===points.at(-2)!.wall)points.pop();
  return points.map(p=>p.point);
}

/** Sweep the circular base along the whole drag, stopping before first contact.
 * Segment walls have rounded endpoints; rectangle interiors are solid. */
export function stopAtWalls(start:WallPoint,end:WallPoint,radius:number,walls:readonly MapWall[]=[]):WallPoint {
 walls=passageWalls(walls);
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 if(!length||!walls.length)return end;
 const r=Math.max(0,radius),ux=dx/length,uy=dy/length;
 if(walls.some(w=>insideWall(start,w)||(!(w.door&&w.open)&&distanceToWall(start,w)<r-1e-5)))return {...start};
 let hit=length;
 for(const w of wallEdges(walls)){
  if(Math.max(start.x,end.x)+r<Math.min(w.ax,w.bx)||Math.min(start.x,end.x)-r>Math.max(w.ax,w.bx)||Math.max(start.y,end.y)+r<Math.min(w.ay,w.by)||Math.min(start.y,end.y)-r>Math.max(w.ay,w.by))continue;
  const sx=w.bx-w.ax,sy=w.by-w.ay,sl=Math.hypot(sx,sy);if(!sl)continue;
  const tx=sx/sl,ty=sy/sl,nx=-ty,ny=tx;
  const side=(start.x-w.ax)*nx+(start.y-w.ay)*ny,velocity=ux*nx+uy*ny;
  for(const sign of [-1,1])if(sign*velocity<-EPS){
   const t=(sign*r-side)/velocity;
   const along=(start.x+ux*t-w.ax)*tx+(start.y+uy*t-w.ay)*ty;
   if(t>=-EPS&&along>=-EPS&&along<=sl+EPS)hit=Math.min(hit,Math.max(0,t));
  }
  for(const p of [{x:w.ax,y:w.ay},{x:w.bx,y:w.by}]){
   const qx=start.x-p.x,qy=start.y-p.y,b=qx*ux+qy*uy,c=qx*qx+qy*qy-r*r,disc=b*b-c;
   if(b>=0||disc<0)continue;
   const t=-b-Math.sqrt(disc);if(t>=-EPS)hit=Math.min(hit,Math.max(0,t));
  }
 }
 if(hit>=length)return end;
 const travel=Math.max(0,hit-.01);
 return {x:start.x+ux*travel,y:start.y+uy*travel};
}

/** Forgiving body clearance, independent of decorative miniature/base scaling.
 * A 5 ft combat space needs 2.5 ft of doorway width. This is collision leeway,
 * not an automatic implementation of squeezing costs or combat penalties.
 */
export function wallCollisionRadiusFt(occupiedWidthFt:number):number {
 return Math.max(.5,Number.isFinite(occupiedWidthFt)?occupiedWidthFt:5)*.25;
}


export type WallEdit={add?:MapWall;update?:MapWall;removeId?:string;eraseArea?:{ax:number;ay:number;bx:number;by:number};door?:{wallId:string;id:string;tokenId?:string;ax:number;ay:number;bx:number;by:number}};
/** Replace part of a wall with a full-thickness door. Remaining pieces stay solid. */
export function cutDoor(w:MapWall,d:NonNullable<WallEdit['door']>):MapWall[]|null {
 if((w.kind&&w.kind!=='rectangle')||w.rotation||(w.thickness??0)>0)return null; // Shaped walls are clipped on the server.
 if(w.door||![d.ax,d.ay,d.bx,d.by].every(Number.isFinite)||!/^[\w-]{1,64}$/.test(d.id))return null;
 const horizontal=w.kind==='rectangle'?Math.abs(w.bx-w.ax)>=Math.abs(w.by-w.ay):false;
 const a=w.kind==='rectangle'?{x:horizontal?Math.min(w.ax,w.bx):(w.ax+w.bx)/2,y:horizontal?(w.ay+w.by)/2:Math.min(w.ay,w.by)}:{x:w.ax,y:w.ay};
 const b=w.kind==='rectangle'?{x:horizontal?Math.max(w.ax,w.bx):a.x,y:horizontal?a.y:Math.max(w.ay,w.by)}:{x:w.bx,y:w.by};
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 const project=(x:number,y:number)=>Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(len*len)));
 const t1=project(d.ax,d.ay),t2=project(d.bx,d.by),lo=Math.min(t1,t2),hi=Math.max(t1,t2);
 if((hi-lo)*len<.1)return null;
 const slice=(start:number,end:number,id:string,door=false):MapWall=>{
  const p={x:a.x+dx*start,y:a.y+dy*start},q={x:a.x+dx*end,y:a.y+dy*end};
  if(w.kind==='rectangle'){
   if(horizontal){p.y=Math.min(w.ay,w.by);q.y=Math.max(w.ay,w.by);}
   else{p.x=Math.min(w.ax,w.bx);q.x=Math.max(w.ax,w.bx);}
  }
  return {id,ax:p.x,ay:p.y,bx:q.x,by:q.y,...(w.kind?{kind:w.kind}:{}),...(door?{door:true,open:false}:{})};
 };
 return [...(lo*len>=.1?[slice(0,lo,d.id+'-a')]:[]),...(len*(1-hi)>=.1?[slice(hi,1,d.id+'-b')]:[]),slice(lo,hi,d.id,true)];
}
/** Door surfaces visible from either side, including thick closed doors. */
export function doorApproachPoints(w:MapWall):WallPoint[]{
 if(w.kind&&w.kind!=='rectangle'||w.rotation||(w.thickness??0)>0){
  return wallBoundarySegments(w).flatMap(({a,b})=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,x=(a.x+b.x)/2,y=(a.y+b.y)/2;
   return [{x:x-dy/l*.1,y:y+dx/l*.1},{x:x+dy/l*.1,y:y-dx/l*.1}];});
 }
 if(w.kind==='rectangle')return [{x:Math.min(w.ax,w.bx)-.1,y:(w.ay+w.by)/2},{x:Math.max(w.ax,w.bx)+.1,y:(w.ay+w.by)/2},{x:(w.ax+w.bx)/2,y:Math.min(w.ay,w.by)-.1},{x:(w.ax+w.bx)/2,y:Math.max(w.ay,w.by)+.1}];
 const dx=w.bx-w.ax,dy=w.by-w.ay,l=Math.hypot(dx,dy),x=(w.ax+w.bx)/2,y=(w.ay+w.by)/2;
 return [{x:x-dy/l*.1,y:y+dx/l*.1},{x:x+dy/l*.1,y:y-dx/l*.1}];
}
