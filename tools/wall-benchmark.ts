/** Deterministic CPU workload; usable in Node and in a throttled real browser. */
import {wallVisibilityPolygon,hasLineOfSight,stopAtWalls,wallEdgeCount,SIGHT_EXTENT,type MapWall} from '../shared/mapWalls.js';

export function benchmarkLayout(edges:number,kind:'rooms'|'cave'):MapWall[]{
 if(kind==='rooms')return Array.from({length:Math.floor(edges/4)},(_,i)=>{
  const columns=Math.ceil(Math.sqrt(edges/4)),x=180+(i%columns)*190,y=160+Math.floor(i/columns)*170;
  return {id:`room-${i}`,kind:'rectangle',ax:x,ay:y,bx:x+110,by:y+80};
 });
 // A thin irregular cave rim enclosing a walkable interior, with an empty hole.
 const n=Math.floor(edges/2),ring=(offset:number)=>Array.from({length:n},(_,i)=>{
  const a=i*2*Math.PI/n,r=1300+100*Math.sin(a*11)+45*Math.sin(a*37)+offset;
  return {x:1600+Math.cos(a)*r,y:1600+Math.sin(a)*r};
 });
 return [{id:'cave',kind:'polygon',ax:100,ay:100,bx:3100,by:3100,points:ring(0),holes:[ring(-25)]}];
}
export function benchmarkWalls(walls:MapWall[],kind:string,repeats=7){
 const origin=kind==='cave'?{x:1550,y:1600}:{x:80,y:85};
 const measure=(fn:()=>unknown,n=repeats)=>{
  const times:number[]=[];let result:unknown;
  for(let i=0;i<n;i++){const start=performance.now();result=fn();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return {medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],samples:n,result};
 };
 const cold=measure(()=>wallVisibilityPolygon(origin,walls,SIGHT_EXTENT),1);
 let step=0;
 const movingSight=measure(()=>wallVisibilityPolygon({...origin,x:origin.x+(++step%7)},walls,SIGHT_EXTENT));
 const nearby=measure(()=>wallVisibilityPolygon({...origin,x:origin.x+(++step%7)},walls,576));
 const movement=measure(()=>{for(let i=0;i<100;i++)stopAtWalls(origin,{x:origin.x+100+i,y:origin.y+30},12,walls);},repeats);
 const sightChecks=measure(()=>{for(let i=0;i<100;i++)hasLineOfSight(origin,{x:origin.x+800+i,y:origin.y+100},walls);},repeats);
 const strip=(r:ReturnType<typeof measure>)=>({medianMs:r.medianMs,p95Ms:r.p95Ms,samples:r.samples});
 return {kind,edges:wallEdgeCount(walls),jsonBytes:JSON.stringify(walls).length,vertices:(cold.result as unknown[]).length,coldSight:strip(cold),movingSight:strip(movingSight),nearbySight:strip(nearby),moves100:strip(movement),sightChecks100:strip(sightChecks)};
}
