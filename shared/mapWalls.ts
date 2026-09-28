/** Opaque, infinitely tall sight barriers in map pixels. Gaps remain open doorways. */
export type MapWall = {id: string; ax: number; ay: number; bx: number; by: number};
export type WallPoint = {x: number; y: number};
export const MAX_MAP_WALLS = 512;
export const SIGHT_EXTENT = 4_000_000;
const EPS = 1e-7;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const cornersCache=new WeakMap<readonly MapWall[],WallPoint[]>();
function wallCorners(walls:readonly MapWall[]):WallPoint[]{
  const cached=cornersCache.get(walls);if(cached)return cached;
  const corners=walls.flatMap(w=>[{x:w.ax,y:w.ay},{x:w.bx,y:w.by}]);
  // Crossing strokes create corners too; otherwise rays can cut off the small
  // visible wedge between the two nearest wall segments.
  for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
    const a=walls[i],b=walls[j],dx=a.bx-a.ax,dy=a.by-a.ay,sx=b.bx-b.ax,sy=b.by-b.ay;
    const det=cross(dx,dy,sx,sy);if(Math.abs(det)<EPS)continue;
    const qx=b.ax-a.ax,qy=b.ay-a.ay,t=cross(qx,qy,sx,sy)/det,u=cross(qx,qy,dx,dy)/det;
    if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)corners.push({x:a.ax+t*dx,y:a.ay+t*dy});
  }
  cornersCache.set(walls,corners);return corners;
}

export function sanitizeWalls(input: unknown): MapWall[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const walls: MapWall[] = [];
  for (const w of input.slice(0, MAX_MAP_WALLS)) {
    if (!w || typeof w.id !== 'string' || !/^[\w-]{1,80}$/.test(w.id) || ids.has(w.id)) continue;
    if (![w.ax,w.ay,w.bx,w.by].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000)) continue;
    if (Math.hypot(w.ax-w.bx,w.ay-w.by) < .1) continue;
    ids.add(w.id); walls.push({id:w.id,ax:w.ax,ay:w.ay,bx:w.bx,by:w.by});
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
  const dx=b.x-a.x,dy=b.y-a.y, distance=Math.hypot(dx,dy);
  if (distance < EPS) return true;
  return !walls.some(w => rayHit(a,dx/distance,dy/distance,w) < distance-EPS);
}

export function distanceToWall(p: WallPoint, w: MapWall): number {
  const dx=w.bx-w.ax,dy=w.by-w.ay;
  const t=Math.max(0,Math.min(1,((p.x-w.ax)*dx+(p.y-w.ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p.x-w.ax-t*dx,p.y-w.ay-t*dy);
}

/** Rays just either side of each corner preserve narrow doors and crisp wall shadows.
 * Cache per source in callers: camera changes and flame flicker need no new ray casts. */
export function wallVisibilityPolygon(origin: WallPoint, walls: readonly MapWall[], radius: number): WallPoint[] {
  const relevant=walls.filter(w=>distanceToWall(origin,w)<=radius);
  const angles=Array.from({length:96},(_,i)=>i*Math.PI/48);
  for (const {x,y} of wallCorners(walls)) {
    const a=Math.atan2(y-origin.y,x-origin.x);
    angles.push(a-1e-7,a,a+1e-7);
  }
  const sorted=angles.map(a=>(a+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
  return sorted.map(a=>{
    const dx=Math.cos(a),dy=Math.sin(a);
    let d=radius;
    for (const w of relevant) d=Math.min(d,rayHit(origin,dx,dy,w));
    return {x:origin.x+dx*d,y:origin.y+dy*d};
  });
}
