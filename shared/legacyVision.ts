export type LegacyVisionPaths={sight:string[];near:string[];lights:string[]};
export type OutlineSet={wallsKey:string;shapes:Record<string,{x:number;y:number;points:WallPoint[]}>};
export type LegacyGeometry=LegacyVisionPaths&{memory:string[];affinity:string[];outlines?:OutlineSet};
import {wallVisibilityPolygon,SIGHT_EXTENT,type WallPoint} from './mapWalls.js';
import {lightCoverage,type PlayerVision} from './playerVision.js';

export const legacyPath=(points:readonly WallPoint[])=>points.length?'M'+points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')+'Z':'';
/** Hard boundaries replace attenuation bands, textures and animated light fields.
 * Keep the same sight blockers and the server's lit-distance threshold. */
export function createLegacyVisionGeometry(){
 let wallsKey='';const cache=new Map<string,string>();
 return (vision:PlayerVision,wallFog:boolean)=>{
 const key=JSON.stringify(vision.walls??[]);if(key!==wallsKey){wallsKey=key;cache.clear();}
 const outline=(point:{x:number;y:number},radius:number,occlude:boolean)=>{
   const key=`${point.x},${point.y}:${radius}:${occlude}`,old=cache.get(key);if(old!==undefined)return old;
   const path=legacyPath(wallVisibilityPolygon(point,occlude?vision.walls??[]:[],radius));
   if(cache.size>=512)cache.delete(cache.keys().next().value!);cache.set(key,path);return path;
 };
 const sight=vision.origins.map(o=>outline(o,SIGHT_EXTENT,wallFog));
 const near=vision.heavy?vision.origins.map(o=>outline(o,vision.radius,wallFog)):[];
 const lights=vision.lights.filter(l=>!l.transient).map(l=>{
   let low=0,high=l.radius*1.5;
   for(let i=0;i<18;i++){const mid=(low+high)/2;if(lightCoverage(mid,l)>.10)low=mid;else high=mid;}
   return outline(l,low,true);
 });
 return {sight,near,lights};
 };
}
