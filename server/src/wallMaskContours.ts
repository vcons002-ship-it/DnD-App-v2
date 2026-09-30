import sharp from 'sharp';
import clipping from 'polygon-clipping';
import {pointInRing,simplifyWallPath,wallSvgPath} from '../../shared/wallGeometry.js';
import {MAX_MAP_WALLS,wallEdgeCount,type WallPoint,type MapWall} from '../../shared/mapWalls.js';
import {polygonWall} from './wallPolygonDoor.js';

const signedArea=(r:WallPoint[])=>r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
/** Trace pixel boundaries, preserving holes and keeping diagonally touching
 * components separate. Clockwise edges keep filled pixels on their right. */
function trace(mask:Uint8Array,w:number,h:number):WallPoint[][] {
 const edges:{x:number;y:number;dx:number;dy:number;used?:boolean}[]=[],starts=new Map<number,number[]>(),stride=w+1;
 const add=(x:number,y:number,dx:number,dy:number)=>{const key=y*stride+x,list=starts.get(key)??[];list.push(edges.length);starts.set(key,list);edges.push({x,y,dx,dy});};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
  if(!y||!mask[(y-1)*w+x])add(x,y,1,0);
  if(x===w-1||!mask[y*w+x+1])add(x+1,y,0,1);
  if(y===h-1||!mask[(y+1)*w+x])add(x+1,y+1,-1,0);
  if(!x||!mask[y*w+x-1])add(x,y+1,0,-1);
 }
 const rings:WallPoint[][]=[];
 for(const first of edges){if(first.used)continue;const ring:WallPoint[]=[];let e=first;
  while(!e.used){e.used=true;ring.push({x:e.x,y:e.y});const x=e.x+e.dx,y=e.y+e.dy;
   const choices=(starts.get(y*stride+x)??[]).map(i=>edges[i]).filter(n=>!n.used);
   if(!choices.length)break;
   // Prefer the right turn at a diagonal pixel contact.
   choices.sort((a,b)=>(e.dx*b.dy-e.dy*b.dx)-(e.dx*a.dy-e.dy*a.dx));e=choices[0];
  }
  if(ring.length>=4)rings.push(ring);
 }
 return rings;
}
function simplifyRing(r:WallPoint[],tolerance:number){
 // Split a closed ring at opposite vertices so RDP never collapses the loop.
 let far=1;for(let i=2;i<r.length;i++)if(Math.hypot(r[i].x-r[0].x,r[i].y-r[0].y)>Math.hypot(r[far].x-r[0].x,r[far].y-r[0].y))far=i;
 return [...simplifyWallPath(r.slice(0,far+1),tolerance).slice(0,-1),...simplifyWallPath([...r.slice(far),r[0]],tolerance).slice(0,-1)];
}
/** Put reserved pixels back after curve simplification. Cutting only where the
 * candidate overlaps a reservation keeps small openings exact without requiring
 * every long, unrelated curved edge to retain all of its pixel stair-steps. */
function restoreGaps(walls:MapWall[],reserved:Uint8Array,raster:Buffer,w:number,h:number):MapWall[] {
 const cuts:clipping.Polygon[]=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(reserved[y*w+x]&&raster[y*w+x]){
  const left=x;while(x+1<w&&reserved[y*w+x+1]&&raster[y*w+x+1])x++;
  cuts.push([[[left,y],[x+1,y],[x+1,y+1],[left,y+1]]]);
 }
 if(!cuts.length)return walls;
 const result:MapWall[]=[];
 for(const wall of walls){
  const rings=[wall.points!,...(wall.holes??[])].map(r=>r.map(p=>[p.x,p.y] as [number,number]));
  for(const poly of clipping.difference(rings,...cuts))result.push(polygonWall(`mask-${result.length}`,poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y})))));
 }
 return result;
}
export async function contourWallMask(solid:Uint8Array,protectedPixels:Uint8Array,w:number,h:number):Promise<{walls:MapWall[];coverage:number}|null>{
 const raw=trace(solid,w,h),outer=raw.filter(r=>signedArea(r)>0),holes=raw.filter(r=>signedArea(r)<0);
 if(outer.length>120)return null;
 // Assign a hole only to its smallest enclosing component (nested islands stay solid).
 const grouped=outer.map(r=>[r]);
 for(const hole of holes){let owner=-1,area=Infinity;outer.forEach((r,i)=>{const size=signedArea(r);if(size<area&&pointInRing(hole[0],r)){owner=i;area=size;}});if(owner>=0)grouped[owner].push(hole);}
 let best:{walls:MapWall[];coverage:number}|null=null;
 // Raster stair-steps on a long curve can sit just above the first tolerance.
 // Try small bounded increments before falling back to rectangles. Every candidate
 // still has to preserve protected openings and the full wall core, and meet the
 // same coverage/edge limits; complexity never authorizes closing a doorway.
 for(const tolerance of [1.25,1.3,1.35,1.4,1.45,1.5,.8,.45,0]){
  let walls=grouped.map((rs,i)=>polygonWall(`mask-${i}`,rs.map(r=>simplifyRing(r,tolerance))));
  if(wallEdgeCount(walls)>MAX_MAP_WALLS)continue;
  const render=()=>sharp(Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="black"/>${walls.map(w=>`<path d="${wallSvgPath(w)}" fill="white" fill-rule="evenodd"/>`).join('')}</svg>`)).removeAlpha().greyscale().raw().toBuffer();
  let raster=await render();
  if(protectedPixels.some((n,p)=>n&&raster[p]>100)){
   try{walls=restoreGaps(walls,protectedPixels,raster,w,h);}catch{continue;}
   if(walls.length>120||wallEdgeCount(walls)>MAX_MAP_WALLS)continue;
   raster=await render();
  }
  let total=0,represented=0,closesGap=false,losesCore=false;
  for(let p=0;p<solid.length;p++){
   if(solid[p]){total++;if(raster[p]>=100)represented++;else if(p%w>0&&p%w<w-1&&p>=w&&p<solid.length-w&&solid[p-1]&&solid[p+1]&&solid[p-w]&&solid[p+w])losesCore=true;}
   if(protectedPixels[p]&&raster[p]>100)closesGap=true;
  }
  // Boundary stair-steps are intentionally simplified (at most 1.5 working
  // pixels). Thin, jagged cave edges can lose 3-4% of raster boundary coverage
  // even though every interior/core pixel and every protected opening survives.
  if(!closesGap&&!losesCore&&total&&represented/total>=.96){
   if(!best||wallEdgeCount(walls)<wallEdgeCount(best.walls))best={walls,coverage:represented/total};
   // Keep some room for subsequent manual edits and doors where possible.
   if(wallEdgeCount(walls)<=MAX_MAP_WALLS*.85)return best;
  }
 }
 return best;
}
