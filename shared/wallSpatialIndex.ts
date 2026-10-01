import type {MapWall,WallPoint} from './mapWalls.js';

type Bounds={minX:number;minY:number;maxX:number;maxY:number};
type Edge=Bounds&{wall:MapWall;index:number};
type Node=Bounds&{edges?:Edge[];left?:Node;right?:Node};
const cache=new WeakMap<readonly MapWall[],Node>();
const bounds=(w:MapWall):Bounds=>({minX:Math.min(w.ax,w.bx),minY:Math.min(w.ay,w.by),maxX:Math.max(w.ax,w.bx),maxY:Math.max(w.ay,w.by)});
const overlaps=(a:Bounds,b:Bounds)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
function build(edges:Edge[]):Node {
 const b:Bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const e of edges){b.minX=Math.min(b.minX,e.minX);b.minY=Math.min(b.minY,e.minY);b.maxX=Math.max(b.maxX,e.maxX);b.maxY=Math.max(b.maxY,e.maxY);}
 if(edges.length<=8)return {...b,edges};
 const x=b.maxX-b.minX>=b.maxY-b.minY;
 edges.sort((a,b)=>x?a.minX+a.maxX-b.minX-b.maxX:a.minY+a.maxY-b.minY-b.maxY);
 const mid=Math.floor(edges.length/2);
 return {...b,left:build(edges.slice(0,mid)),right:build(edges.slice(mid))};
}
function index(walls:readonly MapWall[]):Node {
 let tree=cache.get(walls);if(tree)return tree;
 tree=build(walls.map((wall,index)=>({...bounds(wall),wall,index})));cache.set(walls,tree);return tree;
}
/** Only potentially crossing pairs, with each pair visited once. */
export function visitWallCrossings(walls:readonly MapWall[],visit:(a:MapWall,b:MapWall)=>void){
 const root=index(walls);
 const query=(node:Node,b:Bounds,i:number)=>{
  if(!overlaps(node,b))return;
  if(node.edges){for(const e of node.edges)if(e.index>i&&overlaps(e,b))visit(walls[i],e.wall);}
  else{query(node.left!,b,i);query(node.right!,b,i);}
 };
 walls.forEach((w,i)=>query(root,bounds(w),i));
}
/** Bounding boxes only skip impossible hits. The original precise segment test
 * still chooses the blocker, including corner touches and collinear strokes. */
export function closestWallHit(origin:WallPoint,dx:number,dy:number,walls:readonly MapWall[],radius:number,
 hit:(origin:WallPoint,dx:number,dy:number,wall:MapWall)=>number,result?:{wall?:MapWall}):number {
 // Match the segment test's endpoint tolerance, even on very long strokes.
 const near=(b:Bounds)=>{
  const pad=1e-7*(1+Math.max(b.maxX-b.minX,b.maxY-b.minY));
  let lo=0,hi=radius;
  if(dx===0){if(origin.x<b.minX-pad||origin.x>b.maxX+pad)return Infinity;}
  else{const a=(b.minX-pad-origin.x)/dx,c=(b.maxX+pad-origin.x)/dx;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c));}
  if(dy===0){if(origin.y<b.minY-pad||origin.y>b.maxY+pad)return Infinity;}
  else{const a=(b.minY-pad-origin.y)/dy,c=(b.maxY+pad-origin.y)/dy;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c));}
  return lo<=hi?lo:Infinity;
 };
 const walk=(node:Node,entry:number)=>{
  if(entry>radius)return;
  if(node.edges){for(const e of node.edges)if(near(e)<=radius){const distance=hit(origin,dx,dy,e.wall);if(distance<radius){radius=distance;if(result)result.wall=e.wall;}}return;}
  const left=near(node.left!),right=near(node.right!);
  if(left<=right){walk(node.left!,left);walk(node.right!,right);}else{walk(node.right!,right);walk(node.left!,left);}
 };
 if(walls.length){const root=index(walls);walk(root,near(root));}
 return radius;
}
