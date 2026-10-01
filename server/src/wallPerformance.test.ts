import {it,expect} from 'vitest';
import {closestWallHit} from '../../shared/wallSpatialIndex.js';
import {sanitizeWalls,wallEdgeCount,wallPerformanceWarning,wallVisibilityPolygon,hasLineOfSight,stopAtWalls,type MapWall} from '../../shared/mapWalls.js';
import {benchmarkLayout} from '../../tools/wall-benchmark.js';
import {createSession,createMap,getMap,getSessionByCode,listMaps} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {exportSession,importSession} from './backup.js';
import {db} from './db.js';
import {contourWallMask} from './wallMaskContours.js';
import {pointInRing,compactWallPoints,wallContours} from '../../shared/wallGeometry.js';

it('removes redundant straight vertices, preserving real bends and backtracking',()=>{
 const p=(x:number,y=0)=>({x,y});
 expect(compactWallPoints([p(0),p(1),p(1),p(2),p(3)])).toEqual([p(0),p(3)]);
 expect(compactWallPoints([p(0),p(1,1),p(2,2),p(3,3),p(4,2)])).toEqual([p(0),p(3,3),p(4,2)]);
 expect(compactWallPoints([p(0),p(2),p(1),p(3)])).toEqual([p(0),p(2),p(1),p(3)]);
 expect(compactWallPoints([p(0),p(1,.0001),p(2)])).toHaveLength(3);
});
it('compacts a closed ring across its seam without changing holes, sight or collision',()=>{
 const ring=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
 const subdivide=(r:typeof ring)=>r.flatMap((a,i)=>Array.from({length:100},(_,j)=>{const b=r[(i+1)%r.length];return {x:a.x+(b.x-a.x)*j/100,y:a.y+(b.y-a.y)*j/100};}));
 const hole=ring.map(p=>({x:10+p.x*.8,y:10+p.y*.8})),outline=subdivide(ring),midEdgeStart=[...outline.slice(23),...outline.slice(0,23),outline[23]];
 const simple:MapWall={id:'ring',kind:'polygon',ax:0,ay:0,bx:100,by:100,points:ring,holes:[hole]},dense={...simple,points:midEdgeStart,holes:[subdivide(hole)]};
 const source=JSON.stringify(dense);
 expect(wallEdgeCount([dense])).toBe(8);expect(wallContours(dense).map(r=>r.length)).toEqual([4,4]);
 expect(JSON.stringify(dense)).toBe(source);expect(sanitizeWalls([dense])[0].points).toHaveLength(401);
 for(let i=0;i<120;i++){
  const a={x:50,y:50},b={x:50+90*Math.cos(i*.13),y:50+90*Math.sin(i*.13)};
  expect(hasLineOfSight(a,b,[dense])).toBe(hasLineOfSight(a,b,[simple]));
  expect(stopAtWalls(a,b,3,[dense])).toEqual(stopAtWalls(a,b,3,[simple]));
 }
});
it.each([0,12])('keeps a subdivided diagonal stroke identical at thickness %s',thickness=>{
 const simple:MapWall={id:'diagonal',kind:'path',ax:0,ay:0,bx:80,by:80,thickness,points:[{x:0,y:0},{x:80,y:80}]};
 const dense={...simple,points:Array.from({length:801},(_,i)=>({x:i/10,y:i/10}))};
 expect(wallEdgeCount([dense])).toBe(thickness?4:1);
 const a={x:10,y:40},b={x:60,y:40};
 expect(hasLineOfSight(a,b,[dense])).toBe(false);
 expect(stopAtWalls(a,b,3,[dense])).toEqual(stopAtWalls(a,b,3,[simple]));
});

// Independent exhaustive oracle from the pre-index ray caster. The indexed
// version must skip only impossible candidates, never change an actual hit.
function exhaustive(ox:number,oy:number,dx:number,dy:number,walls:MapWall[],radius:number){
 for(const w of walls){
  const sx=w.bx-w.ax,sy=w.by-w.ay,qx=w.ax-ox,qy=w.ay-oy,d=dx*sy-dy*sx;
  let t=Infinity;
  if(Math.abs(d)<1e-7){
   if(Math.abs(qx*dy-qy*dx)<=1e-7){const a=qx*dx+qy*dy,b=(w.bx-ox)*dx+(w.by-oy)*dy;if(Math.max(a,b)>=1e-7)t=Math.max(0,Math.min(a,b));}
  }else{const distance=(qx*sy-qy*sx)/d,u=(qx*dy-qy*dx)/d;if(distance>=-1e-7&&u>=-1e-7&&u<=1+1e-7)t=Math.max(0,distance);}
  radius=Math.min(radius,t);
 }
 return radius;
}
it('matches exhaustive rays through dense, crossed, collinear and corner-touching strokes',()=>{
 let seed=928;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const walls:MapWall[]=Array.from({length:900},(_,i)=>({id:`w-${i}`,ax:random()*4000-2000,ay:random()*4000-2000,bx:random()*4000-2000,by:random()*4000-2000}));
 walls.push({id:'horizontal',ax:-500,ay:0,bx:500,by:0},{id:'vertical',ax:0,ay:-500,bx:0,by:500});
 for(let i=0;i<400;i++){
  const origin=i<4?{x:0,y:0}:{x:random()*6000-3000,y:random()*6000-3000},a=i<4?i*Math.PI/2:random()*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a),radius=i%2?4e6:600;
  const expected=exhaustive(origin.x,origin.y,dx,dy,walls,radius);
  const actual=closestWallHit(origin,dx,dy,walls,radius,(o,x,y,w)=>exhaustive(o.x,o.y,x,y,[w],Infinity));
  expect(actual).toBeCloseTo(expected,7);
 }
});
it('preserves distant blockers, narrow gaps and open doors above 512 edges',()=>{
 const filler=benchmarkLayout(4096,'rooms').map(w=>({...w,ay:w.ay+10000,by:w.by+10000}));
 const jambs:MapWall[]=[{id:'top',ax:700,ay:-1000,bx:700,by:399},{id:'bottom',ax:700,ay:401,bx:700,by:2000}];
 const door:MapWall={id:'door',ax:700,ay:399,bx:700,by:401,door:true,open:false};
 const a={x:500,y:400},b={x:1200,y:400},closed=[...filler,...jambs,door],open=[...filler,...jambs,{...door,open:true}];
 expect(hasLineOfSight(a,b,closed)).toBe(false);expect(hasLineOfSight(a,b,open)).toBe(true);
 expect(wallVisibilityPolygon(a,closed,800).every(p=>p.x<=700+1e-4)).toBe(true);
 expect(wallVisibilityPolygon(a,open,800).some(p=>p.x>1200&&Math.abs(p.y-400)<.1)).toBe(true);
});
it('compacts rendered straight boundaries without changing which points are visible',()=>{
 const walls=benchmarkLayout(2048,'rooms'),origin={x:80,y:85},radius=8000,polygon=wallVisibilityPolygon(origin,walls,radius);
 expect(polygon.length).toBeLessThan(1000);
 for(let i=0;i<1200;i++){
  const a=(i*.61803398875%1)*Math.PI*2,d=20+(i*137%5000),p={x:origin.x+Math.cos(a)*d,y:origin.y+Math.sin(a)*d};
  expect(pointInRing(p,polygon)).toBe(hasLineOfSight(origin,p,walls));
 }
});
it('retains large contours and every saved wall through load, edit and backup restore',()=>{
 const session=createSession('Detailed walls'),map=createMap(session.id,{name:'Detailed cave'});
 const cave=benchmarkLayout(8192,'cave');
 expect(sanitizeWalls(cave)).toEqual(cave);
 expect(editMapWalls(session.id,map.id,{add:cave[0]})).toBeNull();
 expect(wallEdgeCount(getMap(map.id)!.walls!)).toBe(8192);
 expect(editMapWalls(session.id,map.id,{update:{...cave[0],rotation:17}})).toBeNull();
 expect(getMap(map.id)!.walls![0].rotation).toBe(17);
 const rooms=benchmarkLayout(8192,'rooms');
 db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(rooms),map.id);
 expect(getMap(map.id)!.walls).toHaveLength(2048);
 expect(editMapWalls(session.id,map.id,{door:{wallId:rooms[0].id,id:'cut-door',ax:210,ay:200,bx:240,by:200}})).toBeNull();
 const saved=getMap(map.id)!.walls!;
 const restored=importSession(exportSession(session.code)!);
 const imported=listMaps(getSessionByCode(restored.code)!.id)[0].walls!;
 expect(wallEdgeCount(imported)).toBe(wallEdgeCount(saved));
 expect(imported).toHaveLength(saved.length);
 expect(imported.some(w=>w.door&&w.tokenId)).toBe(true);
});
it('warns without refusing any geometry only at the advisory threshold',()=>{
 expect(wallPerformanceWarning(benchmarkLayout(1996,'rooms'))).toBeNull();
 expect(wallPerformanceWarning(benchmarkLayout(2000,'rooms'))).toContain('2,000');
 const large=benchmarkLayout(8192,'rooms');
 expect(wallPerformanceWarning(large)).toContain('8,192');
 expect(sanitizeWalls(large)).toEqual(large);
});
it('converts a single intricate mask beyond 512 segments without filling its small gaps',async()=>{
 const width=800,height=100,solid=new Uint8Array(width*height),gaps=new Uint8Array(width*height);
 for(let y=10;y<90;y++)for(let x=4;x<796;x++){
  if(y>=80||x%4<2)solid[y*width+x]=1;
  else gaps[y*width+x]=1;
 }
 const result=await contourWallMask(solid,gaps,width,height);
 expect(result).not.toBeNull();expect(wallEdgeCount(result!.walls)).toBeGreaterThan(512);
 expect(sanitizeWalls(result!.walls)).toEqual(result!.walls);
 for(let x=6;x<792;x+=4){
  expect(hasLineOfSight({x:x+.5,y:0},{x:x+.5,y:70},result!.walls)).toBe(true);
  expect(hasLineOfSight({x:x+.5,y:0},{x:x+.5,y:95},result!.walls)).toBe(false);
 }
});
