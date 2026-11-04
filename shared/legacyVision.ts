export type LegacyVisionPaths={sight:string[];near:string[];lights:string[]};
export type OutlineSet={wallsKey:string;shapes:Record<string,{x:number;y:number;points:WallPoint[]}>};
export type LegacyGeometry=LegacyVisionPaths&{memory:string[];affinity:string[];outlines?:OutlineSet};
export type CachedPolygon={points:WallPoint[];path:string};
import {wallVisibilityPolygon,SIGHT_EXTENT,type WallPoint} from './mapWalls.js';
import {lightCoverage,type PlayerVision} from './playerVision.js';
import {boundedPaths} from './legacyMaskSvg.js';

export const legacyPath=(points:readonly WallPoint[])=>points.length?'M'+points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')+'Z':'';
export function visionBounds(vision:PlayerVision){
 let minX=0,minY=0,maxX=4096,maxY=4096;
 for(const o of vision.origins){minX=Math.min(minX,o.x-vision.radius);minY=Math.min(minY,o.y-vision.radius);maxX=Math.max(maxX,o.x+vision.radius);maxY=Math.max(maxY,o.y+vision.radius);}
 for(const l of vision.lights){minX=Math.min(minX,l.x-l.radius);minY=Math.min(minY,l.y-l.radius);maxX=Math.max(maxX,l.x+l.radius);maxY=Math.max(maxY,l.y+l.radius);}
 for(const w of vision.walls??[]){minX=Math.min(minX,w.ax,w.bx);minY=Math.min(minY,w.ay,w.by);maxX=Math.max(maxX,w.ax,w.bx);maxY=Math.max(maxY,w.ay,w.by);}
 const pad=2048;
 return {x:minX-pad,y:minY-pad,width:maxX-minX+pad*2,height:maxY-minY+pad*2,scale:1};
}
/** Hard boundaries replace attenuation bands, textures and animated light fields.
 * Keep the same sight blockers and the server's lit-distance threshold. */
export function createLegacyVisionGeometry(onNew?:(wallsKey:string,key:string,entry:CachedPolygon)=>void){
 let wallsKey='';const cache=new Map<string,CachedPolygon>();
 const polygon=(point:{x:number;y:number},radius:number,occlude:boolean,walls:PlayerVision['walls']):CachedPolygon=>{
  const key=`${point.x},${point.y}:${radius}:${occlude}`,old=cache.get(key);
  if(old){cache.delete(key);cache.set(key,old);return old;}
  const points=wallVisibilityPolygon(point,occlude?walls??[]:[],radius);
  const entry:CachedPolygon={points,path:legacyPath(points)};
  if(cache.size>=512)cache.delete(cache.keys().next().value!);
  cache.set(key,entry);
  onNew?.(wallsKey,key,entry);
  return entry;
 };
 const run=(vision:PlayerVision,wallFog:boolean)=>{
  const key=JSON.stringify(vision.walls??[]);if(key!==wallsKey){wallsKey=key;cache.clear();}
  const bounds=visionBounds(vision);
  const sight=boundedPaths(vision.origins.map(o=>polygon(o,SIGHT_EXTENT,wallFog,vision.walls).path),bounds);
  const near=vision.heavy?vision.origins.map(o=>polygon(o,vision.radius,wallFog,vision.walls).path):[];
  const lights=vision.lights.filter(l=>!l.transient).map(l=>{
   let low=0,high=l.radius*1.5;
   for(let i=0;i<18;i++){const mid=(low+high)/2;if(lightCoverage(mid,l)>.10)low=mid;else high=mid;}
   return polygon(l,low,true,vision.walls).path;
  });
  return {sight,near,lights};
 };
 run.points=(point:{x:number;y:number},radius:number,walls:PlayerVision['walls'])=>{
  const key=JSON.stringify(walls??[]);if(key!==wallsKey){wallsKey=key;cache.clear();}
  return polygon(point,radius,true,walls).points;
 };
 run.seed=(key:string,entries:{key:string;points:WallPoint[];path:string}[])=>{
  if(key!==wallsKey){wallsKey=key;cache.clear();}
  for(const e of entries){
   if(cache.has(e.key))continue;
   if(cache.size>=512)cache.delete(cache.keys().next().value!);
   cache.set(e.key,{points:e.points,path:e.path});
  }
 };
 return run;
}
