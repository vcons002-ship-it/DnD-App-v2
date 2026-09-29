import {hasLineOfSight,type MapWall} from './mapWalls.js';
import {lightIrradiance} from './lightFalloff.js';
export const LOCAL_SHADOW_SOURCES=4;
export type ShadowCaster={x:number;y:number;visible:boolean};
type Source={id:string;x:number;y:number;height:number;radius:number;strength:number};
/** Spend the shadow-map budget on sources that actually reach visible figures. */
export function selectShadowLights<T extends Source>(lights:readonly T[],casters:readonly ShadowCaster[],walls:readonly MapWall[]):T[]{
 return lights.map(light=>({light,score:casters.reduce((sum,c)=>{
  if(!c.visible||!hasLineOfSight(light,c,walls))return sum;
  return sum+lightIrradiance(Math.hypot(light.x-c.x,light.y-c.y,light.height),light.radius,light.strength);
 },0)})).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||a.light.id.localeCompare(b.light.id)).slice(0,LOCAL_SHADOW_SOURCES).map(entry=>entry.light);
}
