import {hasLineOfSight,type MapWall} from './mapWalls.js';
import {lightIrradiance} from './lightFalloff.js';
export const LOCAL_SHADOW_SOURCES=4;
export type ShadowCaster={id?:string;x:number;y:number;visible:boolean};
type Source={id:string;x:number;y:number;height:number;radius:number;strength:number;carried?:boolean};
/** A hip lantern passes through its carrier, but other lights still cast their shadow. */
export function castsLocalShadow(source:Pick<Source,'id'|'carried'>,caster:ShadowCaster){
 return caster.visible&&!(source.carried&&source.id===caster.id);
}
/** Compress the whole caster only during its shadow pass. The highest point
 * projects to a short footprint instead of losing the end of its silhouette. */
export function compactShadowHeightScale(lightHeight:number,distance:number,height:number,radius:number,diameter:number){
 const reach=Math.max(1,diameter*2.8);
 const projectedHeight=Math.max(.1,lightHeight)*reach/(Math.max(0,distance)+Math.max(0,radius)+reach);
 return Math.min(1,projectedHeight/Math.max(.1,height));
}
/** Parallel environmental silhouette, directed away from this particular lamp. */
export function environmentalShadowSlope(source:{x:number;y:number},caster:{x:number;y:number},length:number){
 const dx=caster.x-source.x,dy=caster.y-source.y,d=Math.hypot(dx,dy);
 const scale=Math.max(.1,Math.min(4,length));
 return d>.001?{x:dx/d*scale,y:dy/d*scale}:{x:0,y:0};
}
/** Spend the shadow-map budget on sources that actually reach visible figures. */
export function selectShadowLights<T extends Source>(lights:readonly T[],casters:readonly ShadowCaster[],walls:readonly MapWall[]):T[]{
 return lights.map(light=>({light,score:casters.reduce((sum,c)=>{
  if(!castsLocalShadow(light,c)||!hasLineOfSight(light,c,walls))return sum;
  return sum+lightIrradiance(Math.hypot(light.x-c.x,light.y-c.y,light.height),light.radius,light.strength);
 },0)})).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||a.light.id.localeCompare(b.light.id)).slice(0,LOCAL_SHADOW_SOURCES).map(entry=>entry.light);
}
