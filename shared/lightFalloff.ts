/** Radius means useful illumination; the final soft spill ends at 1.5 radii. */
export const LIGHT_SPILL_MULTIPLIER=1.5;
/** Approved lantern source height; fixture stays at the hip. Shared with sight. */
export const CARRIED_LANTERN_LIGHT_HEIGHT_FT=9;
/** Optional line emitter in map space; ordinary lights remain point sources. */
export type LightBeam={ax:number;ay:number;bx:number;by:number};
type LightPosition={x:number;y:number;height:number;beam?:LightBeam};
export function nearestLightPoint(light:Pick<LightPosition,'x'|'y'|'beam'>,x:number,y:number){
 const b=light.beam;if(!b)return {x:light.x,y:light.y};
 const dx=b.bx-b.ax,dy=b.by-b.ay,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((x-b.ax)*dx+(y-b.ay)*dy)/length)):0;
 return {x:b.ax+dx*t,y:b.ay+dy*t};
}
export function lightSourceDistance(light:LightPosition,x:number,y:number,height=0){
 const p=nearestLightPoint(light,x,y);return Math.hypot(x-p.x,y-p.y,height-light.height);
}
export function lightBeamExtent(light:Pick<LightPosition,'x'|'y'|'beam'>){
 const b=light.beam;return b?Math.max(Math.hypot(b.ax-light.x,b.ay-light.y),Math.hypot(b.bx-light.x,b.by-light.y)):0;
}
export function lightBeamOutline(beam:LightBeam,radius:number,steps=12){
 const angle=Math.atan2(beam.by-beam.ay,beam.bx-beam.ax),points:{x:number;y:number}[]=[];
 for(const [x,y,start]of [[beam.bx,beam.by,angle-Math.PI/2],[beam.ax,beam.ay,angle+Math.PI/2]])
  for(let i=0;i<=steps;i++){const a=start+i*Math.PI/steps;points.push({x:x+Math.cos(a)*radius,y:y+Math.sin(a)*radius});}
 return points;
}
/** Luminous spell geometry has a soft energy falloff, not a torch's useful-radius pool. */
export function spellEmissionIrradiance(distance:number,radius:number,strength:number){
 if(radius<=0||strength<=0)return 0;
 return 5*strength*Math.exp(-7*(Math.max(0,distance)/radius)**2);
}
export function lightIrradiance(distance:number,radius:number,strength:number){
 if(radius<=0||strength<=0)return 0;
 const q=Math.max(0,distance)/radius;
 const t=Math.min(1,Math.max(0,(q-1)/.5));
 return 3*strength/(1+q*q)*(1-t*t*(3-2*t));
}
/** Fully lit surfaces must have no residual grayscale/detail veil. */
export function lightColorCoverage(irradiance:number){
 const t=Math.min(1,Math.max(0,(irradiance-.05)/1.05));
 return t*t*(3-2*t);
}
/** Kept together with the CPU function for ground, figures and vision masks. */
export const lightFalloffGlsl=`
 float lightSegmentDistance(vec3 point,vec4 beam,float height){
  vec2 delta=beam.zw-beam.xy;
  float t=clamp(dot(point.xz-beam.xy,delta)/max(.000001,dot(delta,delta)),0.,1.);
  return length(point-vec3(beam.x+delta.x*t,height,beam.y+delta.y*t));
 }
 float spellEmissionIrradiance(float distance,float radius,float strength){
  float q=max(0.,distance)/max(.001,radius);return 5.*strength*exp(-7.*q*q);
 }
 float lightColorCoverage(float irradiance){return smoothstep(.05,1.1,irradiance);}
 float lightIrradiance(float distance,float radius,float strength){
  float q=max(0.,distance)/max(.001,radius);
  return 3.*strength/(1.+q*q)*(1.-smoothstep(1.,1.5,q));
 }
`;
