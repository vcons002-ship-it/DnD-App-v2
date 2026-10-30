import clipping from 'polygon-clipping';
import {createPlayerVision,lightCoverage,type PlayerVision} from './playerVision.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from './mapWalls.js';
import type {ExploredTerrain} from './exploration.js';
import type {MapState,Token} from './types.js';
const quantizedShapes=new WeakSet<ExploredTerrain>();
const markQuantized=(shape:ExploredTerrain)=>(quantizedShapes.add(shape),shape);
export const quantizeTerrain=(shape:ExploredTerrain):ExploredTerrain=>quantizedShapes.has(shape)?shape:markQuantized(shape.map(p=>p.map(r=>r.map(([x,y])=>[Math.round(x*64)/64,Math.round(y*64)/64]))));
export const unionTerrain=(parts:ExploredTerrain[]):ExploredTerrain=>parts.length?clipping.union(quantizeTerrain(parts[0]),...parts.slice(1).map(quantizeTerrain)):[];
let cachedWalls:PlayerVision['walls'],cachedWallKey='[]';const sharedCache=new Map<string,ExploredTerrain>();
const lightReachCache=new Map<string,number>();
function terrainLightReach(light:PlayerVision['lights'][number]){
 const key=`${light.radius}:${light.height}:${light.strength}:${!!light.transient}`,hit=lightReachCache.get(key);
 if(hit!==undefined)return hit;
 let lo=0,hi=light.radius*1.5;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,light)>.10)lo=mid;else hi=mid;}
 if(lightReachCache.size>=256)lightReachCache.delete(lightReachCache.keys().next().value!);lightReachCache.set(key,lo);return lo;
}
function terrainCacheFor(walls:PlayerVision['walls']){
 if(walls!==cachedWalls){cachedWalls=walls;const key=JSON.stringify(walls??[]);if(key!==cachedWallKey){cachedWallKey=key;sharedCache.clear();}}
 if(sharedCache.size>1024)sharedCache.clear();
 return sharedCache;
}
export function visibleTerrain(vision:PlayerVision,cache=terrainCacheFor(vision.walls)):ExploredTerrain{
 const combine=(parts:ExploredTerrain[])=>parts.length===1?parts[0]:unionTerrain(parts);
 const polygon=(point:{x:number;y:number},radius:number)=>{
  const key=`${point.x},${point.y}:${radius}`;let shape=cache.get(key);
  if(!shape){shape=markQuantized([[wallVisibilityPolygon(point,vision.walls??[],radius).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]]);cache.set(key,shape);}return shape;
 };
 if(!vision.origins.length)return [];
 if(!vision.heavy)return combine(vision.origins.map(o=>polygon(o,SIGHT_EXTENT)));
 const nearby=combine(vision.origins.map(o=>polygon(o,vision.radius)));
 // A carried light inside its carrier's darkvision changes color, not terrain
 // visibility. Avoid unlimited sight rays and polygon intersections when the
 // near-sight polygon already contains its whole contribution.
 const extending=vision.lights.flatMap(light=>{
  const lo=terrainLightReach(light);
  const covered=vision.origins.some(o=>o.x===light.x&&o.y===light.y&&lo+1/64<=vision.radius)||vision.origins.length===1&&Math.hypot(vision.origins[0].x-light.x,vision.origins[0].y-light.y)+lo<=vision.radius*Math.cos(Math.PI/96)-1/64;
  return covered?[]:[{light,radius:lo}];
 });
 if(!extending.length)return vision.origins.length===1?nearby:unionTerrain([nearby]);
 const sight=combine(vision.origins.map(o=>polygon(o,SIGHT_EXTENT)));
 const key='lights:'+JSON.stringify(extending);let lights=cache.get(key);
 if(!lights){lights=combine(extending.map(({light,radius})=>polygon(light,radius)));cache.set(key,lights);}
 return combine([nearby,...(lights.length?[clipping.intersection(sight,lights)]:[])]);
}
export function fogTerrain(map:MapState):ExploredTerrain{
 const rows=new Map<number,number[]>();for(const key of map.mapFogRevealed){const [x,y]=key.split(',').map(Number);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const row=rows.get(y)??[];row.push(x);rows.set(y,row);}
 const parts:ExploredTerrain[]=[];const g=map.gridSizePx;
 for(const [y,cols] of rows){const xs=[...new Set(cols)].sort((a,b)=>a-b);let i=0;while(i<xs.length){const start=xs[i];let end=start;while(i+1<xs.length&&xs[i+1]===end+1)end=xs[++i];i++;parts.push(markQuantized([[[[start*g,y*g],[(end+1)*g,y*g],[(end+1)*g,(y+1)*g],[start*g,(y+1)*g]]]]));}}
 return unionTerrain(parts);
}
export type WalkSightJob={walkSight:{map:MapState;tokens:Token[];tokenId:string;from:{x:number;y:number};to:{x:number;y:number}}};
/** Half-grid walking samples, capped at 128 intervals for pathological drags.
 * This is terrain history only; it never authorizes creature data. */
export function walkingTerrain({walkSight:{map,tokens,tokenId,from,to}}:WalkSightJob){
 const count=Math.min(128,Math.max(2,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/Math.max(1,map.gridSizePx/2))));
 const steps=count%2?Math.min(128,count+1):count,cache=terrainCacheFor(map.walls);
 const owned=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden).map(t=>t.refId));
 const combine=(parts:ExploredTerrain[])=>parts.length===1?parts[0]:unionTerrain(parts);
 const polygon=(point:{x:number;y:number},radius:number)=>{
  const key=`${point.x},${point.y}:${radius}`;let shape=cache.get(key);
  if(!shape){shape=markQuantized([[wallVisibilityPolygon(point,map.walls??[],radius).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]]);cache.set(key,shape);}return shape;
 };
 const fallbackOrigins=(at:Token[])=>at.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}));
 const dynamicLanterns=tokens.some(t=>t.carriedLantern&&!t.isHidden&&(t.kind!=='pc'||!owned.has(t.refId)));
 const baseAt=tokens.map(token=>token.id===tokenId?{...token,x:from.x,y:from.y}:token);
 const baseVision=!dynamicLanterns?(createPlayerVision(map,baseAt,owned)??{rangeFt:60 as const,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,origins:fallbackOrigins(baseAt),lights:[],daylight:true}):undefined;
 let staticLights:ExploredTerrain=[];
 if(baseVision?.heavy&&baseVision.lights.length){
  const extending=baseVision.lights.flatMap(light=>{
   const lo=terrainLightReach(light);
   const covered=baseVision.origins.some(o=>o.id===light.id&&lo+1/64<=baseVision.radius);
   return covered?[]:[{light,radius:lo}];
  });
  if(extending.length){
   const key='lights:'+JSON.stringify(extending);
   staticLights=cache.get(key)??(combine(extending.map(({light,radius})=>polygon(light,radius))));
   cache.set(key,staticLights);
  }
 }
 const sweep=(startStep:number,endStep:number,seed?:ExploredTerrain):ExploredTerrain=>{
  const nearSet=new Set<ExploredTerrain>(),byLights=new Map<string,{lights:ExploredTerrain;sights:Set<ExploredTerrain>}>(),staticSights=new Set<ExploredTerrain>();
  const parts:ExploredTerrain[]=seed?.length?[seed]:[];
  for(let i=startStep;i<=endStep;i++){
   const t=i/steps,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t;
   if(baseVision){
    if(!baseVision.origins.length)continue;
    for(const o of baseVision.origins){
     const pt=o.id===tokenId?{x,y}:o;
     if(!baseVision.heavy){nearSet.add(polygon(pt,SIGHT_EXTENT));continue;}
     nearSet.add(polygon(pt,baseVision.radius));
     if(staticLights.length)staticSights.add(polygon(pt,SIGHT_EXTENT));
    }
    continue;
   }
   const at=tokens.map(token=>token.id===tokenId?{...token,x,y}:token);
   const vision=createPlayerVision(map,at,owned)??{rangeFt:60 as const,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,origins:fallbackOrigins(at),lights:[],daylight:true};
   if(!vision.origins.length)continue;
   if(!vision.heavy){for(const o of vision.origins)nearSet.add(polygon(o,SIGHT_EXTENT));continue;}
   for(const o of vision.origins)nearSet.add(polygon(o,vision.radius));
   const extending=vision.lights.flatMap(light=>{
    const lo=terrainLightReach(light);
    const covered=vision.origins.some(o=>o.x===light.x&&o.y===light.y&&lo+1/64<=vision.radius);
    return covered?[]:[{light,radius:lo}];
   });
   if(!extending.length)continue;
   const key='lights:'+JSON.stringify(extending);
   let group=byLights.get(key);
   if(!group){
    let lights=cache.get(key);
    if(!lights){lights=combine(extending.map(({light,radius})=>polygon(light,radius)));cache.set(key,lights);}
    group={lights,sights:new Set()};byLights.set(key,group);
   }
   for(const o of vision.origins)group.sights.add(polygon(o,SIGHT_EXTENT));
  }
  for(const shape of nearSet)parts.push(shape);
  if(staticLights.length&&staticSights.size){
   const sight=combine([...staticSights]);
   parts.push(clipping.intersection(quantizeTerrain(sight),quantizeTerrain(staticLights)));
  }
  for(const {lights,sights} of byLights.values()){
   if(!lights.length||!sights.size)continue;
   const sight=combine([...sights]);
   parts.push(clipping.intersection(quantizeTerrain(sight),quantizeTerrain(lights)));
  }
  return combine(parts);
 };
 const half=sweep(0,steps/2),seen=sweep(steps/2+1,steps,half),fog=map.mapFogEnabled?fogTerrain(map):undefined;
 return {seen:fog?clipping.intersection(quantizeTerrain(seen),quantizeTerrain(fog)):seen,half:fog?clipping.intersection(quantizeTerrain(half),quantizeTerrain(fog)):half,samples:steps+1};
}
