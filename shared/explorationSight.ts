import clipping from 'polygon-clipping';
import {createPlayerVision,lightCoverage,type PlayerVision} from './playerVision.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from './mapWalls.js';
import type {ExploredTerrain} from './exploration.js';
import type {MapState,Token} from './types.js';
export const quantizeTerrain=(shape:ExploredTerrain):ExploredTerrain=>shape.map(p=>p.map(r=>r.map(([x,y])=>[Math.round(x*64)/64,Math.round(y*64)/64])));
export const unionTerrain=(parts:ExploredTerrain[]):ExploredTerrain=>parts.length?clipping.union(quantizeTerrain(parts[0]),...parts.slice(1).map(quantizeTerrain)):[];
export function visibleTerrain(vision:PlayerVision,cache=new Map<string,ExploredTerrain>()):ExploredTerrain{
 const polygon=(point:{x:number;y:number},radius:number)=>{
  const key=`${point.x},${point.y}:${radius}`;let shape=cache.get(key);
  if(!shape){shape=[[wallVisibilityPolygon(point,vision.walls??[],radius).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]];cache.set(key,shape);}return shape;
 };
 if(!vision.origins.length)return [];
 const sight=unionTerrain(vision.origins.map(o=>polygon(o,SIGHT_EXTENT)));if(!vision.heavy)return sight;
 const nearby=unionTerrain(vision.origins.map(o=>polygon(o,vision.radius)));
 const key='lights:'+JSON.stringify(vision.lights);let lights=cache.get(key);
 if(!lights){lights=unionTerrain(vision.lights.map(l=>{let lo=0,hi=l.radius*1.5;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,l)>.10)lo=mid;else hi=mid;}return polygon(l,lo);}));cache.set(key,lights);}
 return unionTerrain([nearby,...(lights.length?[clipping.intersection(sight,lights)]:[])]);
}
export function fogTerrain(map:MapState):ExploredTerrain{
 const rows=new Map<number,number[]>();for(const key of map.mapFogRevealed){const [x,y]=key.split(',').map(Number);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const row=rows.get(y)??[];row.push(x);rows.set(y,row);}
 const parts:ExploredTerrain[]=[];const g=map.gridSizePx;
 for(const [y,cols] of rows){const xs=[...new Set(cols)].sort((a,b)=>a-b);let i=0;while(i<xs.length){const start=xs[i];let end=start;while(i+1<xs.length&&xs[i+1]===end+1)end=xs[++i];i++;parts.push([[[[start*g,y*g],[(end+1)*g,y*g],[(end+1)*g,(y+1)*g],[start*g,(y+1)*g]]]]);}}
 return unionTerrain(parts);
}
export type WalkSightJob={walkSight:{map:MapState;tokens:Token[];tokenId:string;from:{x:number;y:number};to:{x:number;y:number}}};
/** Half-grid walking samples, capped at 128 intervals for pathological drags.
 * This is terrain history only; it never authorizes creature data. */
export function walkingTerrain({walkSight:{map,tokens,tokenId,from,to}}:WalkSightJob){
 const count=Math.min(128,Math.max(2,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/Math.max(1,map.gridSizePx/2))));
 const steps=count%2?Math.min(128,count+1):count,cache=new Map<string,ExploredTerrain>(),parts:ExploredTerrain[]=[];
 const owned=new Set(tokens.filter(t=>t.kind==='pc'&&!t.isHidden).map(t=>t.refId));let half:ExploredTerrain=[];
 for(let i=0;i<=steps;i++){
  const t=i/steps,at=tokens.map(token=>token.id===tokenId?{...token,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}:token);
  const vision=createPlayerVision(map,at,owned)??{rangeFt:60 as const,radius:60*map.gridSizePx/map.feetPerSquare,heavy:false,origins:at.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y})),lights:[],daylight:true};
  parts.push(visibleTerrain(vision,cache));if(i===steps/2)half=unionTerrain(parts);
 }
 const seen=unionTerrain(parts),fog=map.mapFogEnabled?fogTerrain(map):undefined;
 return {seen:fog?clipping.intersection(seen,fog):seen,half:fog?clipping.intersection(half,fog):half,samples:steps+1};
}
