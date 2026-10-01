import type {MapWall,WallPoint} from './mapWalls.js';

export const wallCenter=(w:MapWall):WallPoint=>({x:(w.ax+w.bx)/2,y:(w.ay+w.by)/2});
export function rotateWallPoint(p:WallPoint,w:MapWall):WallPoint {
 const c=wallCenter(w),a=(w.rotation??0)*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
 return {x:c.x+(p.x-c.x)*cos-(p.y-c.y)*sin,y:c.y+(p.x-c.x)*sin+(p.y-c.y)*cos};
}
export function pointInRing(p:WallPoint,ring:readonly WallPoint[]):boolean {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function segmentDistance(p:WallPoint,a:WallPoint,b:WallPoint):number {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}

/** Remove duplicate/straight-through vertices, without rounding corners or
 * simplifying curves. Saved/editable points remain untouched. The tiny distance
 * tolerance only absorbs floating-point noise from subdividing a straight edge. */
export function compactWallPoints(points:readonly WallPoint[],closed=false):WallPoint[] {
 const same=(a:WallPoint,b:WallPoint)=>a.x===b.x&&a.y===b.y;
 const redundant=(a:WallPoint,b:WallPoint,c:WallPoint)=>{
  const abx=b.x-a.x,aby=b.y-a.y,bcx=c.x-b.x,bcy=c.y-b.y;
  // Retain reversals: a hairpin can deliberately double back along a wall.
  return abx*bcx+aby*bcy>=0&&Math.abs(abx*bcy-aby*bcx)<=1e-8*Math.hypot(c.x-a.x,c.y-a.y);
 };
 const result:WallPoint[]=[];
 for(const p of points){
  if(result.length&&same(result[result.length-1],p))continue;
  while(result.length>1&&redundant(result[result.length-2],result[result.length-1],p))result.pop();
  result.push(p);
 }
 if(!closed)return result;
 if(result.length>1&&same(result[0],result[result.length-1]))result.pop();
 let start=0;
 // Handle the seam of a closed ring in linear time, without repeated shifts.
 while(result.length-start>3){
  if(redundant(result[result.length-2],result[result.length-1],result[start])){result.pop();continue;}
  if(redundant(result[result.length-1],result[start],result[start+1])){start++;continue;}
  break;
 }
 return result.slice(start);
}

/** Mitered stroke, with bounded bevels at sharp turns; a stroke is one wall. */
function strokeOutline(points:readonly WallPoint[],width:number):WallPoint[] {
 const side=(sign:number)=>points.flatMap((p,i)=>{
  const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
  const normal=(a:WallPoint,b:WallPoint)=>{const l=Math.hypot(b.x-a.x,b.y-a.y)||1;return {x:-(b.y-a.y)/l*sign,y:(b.x-a.x)/l*sign};};
  const a=normal(i?prev:p,i?p:next),b=normal(i===points.length-1?prev:p,i===points.length-1?p:next),dot=1+a.x*b.x+a.y*b.y;
  const r=width/2;
  if(dot<.5)return [{x:p.x+a.x*r,y:p.y+a.y*r},{x:p.x+b.x*r,y:p.y+b.y*r}];
  return [{x:p.x+(a.x+b.x)/dot*r,y:p.y+(a.y+b.y)/dot*r}];
 });
 return [...side(1),...side(-1).reverse()];
}

const contourCache=new WeakMap<MapWall,WallPoint[][]>();
/** Closed solid boundaries. Subsequent rings are holes, never filled rooms.
 * Rendering, picking, sight and swept movement all consume this same geometry. */
export function wallContours(w:MapWall):WallPoint[][] {
 const cached=contourCache.get(w);if(cached)return cached;
 const x0=Math.min(w.ax,w.bx),x1=Math.max(w.ax,w.bx),y0=Math.min(w.ay,w.by),y1=Math.max(w.ay,w.by);
 let rings:WallPoint[][]=[];
 if(w.kind==='rectangle')rings=[[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]];
 else if(w.kind==='polygon')rings=[w.points??[],...(w.holes??[])];
 else if(w.kind==='circle'){
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2,t=(w.thickness??1)/2;
  // At most half a map pixel of sagitta, bounded for predictable ray-casting cost.
  const n=Math.max(48,Math.min(96,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-.5/Math.max(rx,ry,1))))));
  const ring=(a:number,b:number)=>Array.from({length:n},(_,i)=>({x:cx+a*Math.cos(i*2*Math.PI/n),y:cy+b*Math.sin(i*2*Math.PI/n)}));
  rings=[ring(rx+t,ry+t),ring(Math.max(.01,rx-t),Math.max(.01,ry-t))];
 }else if((w.thickness??0)>0){
  const points=compactWallPoints(w.kind==='path'?w.points??[]:[{x:w.ax,y:w.ay},{x:w.bx,y:w.by}]);
  rings=[strokeOutline(points,w.thickness!)];
 }
 rings=rings.map(r=>compactWallPoints(r,true).map(p=>rotateWallPoint(p,w)));contourCache.set(w,rings);return rings;
}
export function wallVertices(w:MapWall):WallPoint[]{
 const contours=wallContours(w);return contours.length?contours.flat():compactWallPoints(w.kind==='path'?w.points??[]:[{x:w.ax,y:w.ay},{x:w.bx,y:w.by}]).map(p=>rotateWallPoint(p,w));
}
const boundaryCache=new WeakMap<MapWall,{a:WallPoint;b:WallPoint}[]>();
export function wallBoundarySegments(w:MapWall):{a:WallPoint;b:WallPoint}[]{
 const cached=boundaryCache.get(w);if(cached)return cached;
 const contours=wallContours(w);
 const points=contours.length?[]:wallVertices(w);
 const segments=contours.length?contours.flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length]}))):points.slice(1).map((b,i)=>({a:points[i],b}));
 boundaryCache.set(w,segments);return segments;
}
export function insideWallGeometry(p:WallPoint,w:MapWall):boolean {
 const rings=wallContours(w);return !!rings.length&&pointInRing(p,rings[0])&&!rings.slice(1).some(r=>pointInRing(p,r));
}
export function translateWall(w:MapWall,dx:number,dy:number):MapWall {
 const shift=(p:WallPoint)=>({x:p.x+dx,y:p.y+dy});
 return {...w,ax:w.ax+dx,ay:w.ay+dy,bx:w.bx+dx,by:w.by+dy,...(w.points?{points:w.points.map(shift)}:{}),...(w.holes?{holes:w.holes.map(r=>r.map(shift))}:{})};
}
/** Iterative Ramer-Douglas-Peucker; bounded deviation and no recursion overflow. */
export function simplifyWallPath(points:readonly WallPoint[],tolerance:number):WallPoint[]{
 if(points.length<3)return [...points];
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [lo,hi]=stack.pop()!;let far=tolerance,index=-1;
  for(let i=lo+1;i<hi;i++){const d=segmentDistance(points[i],points[lo],points[hi]);if(d>far){far=d;index=i;}}
  if(index>=0){keep.add(index);stack.push([lo,index],[index,hi]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
export function wallSvgPath(w:MapWall):string {
 const contours=wallContours(w),rings=contours.length?contours:[wallVertices(w)];
 return rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+(contours.length?' Z':'')).join(' ');
}
