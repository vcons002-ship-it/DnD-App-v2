/** Radius means useful illumination; the final soft spill ends at 1.5 radii. */
export const LIGHT_SPILL_MULTIPLIER=1.5;
export function lightIrradiance(distance:number,radius:number,strength:number){
 if(radius<=0||strength<=0)return 0;
 const q=Math.max(0,distance)/radius;
 const t=Math.min(1,Math.max(0,(q-1)/.5));
 return 3*strength/(1+q*q)*(1-t*t*(3-2*t));
}
/** Kept together with the CPU function for ground, figures and vision masks. */
export const lightFalloffGlsl=`
 float lightIrradiance(float distance,float radius,float strength){
  float q=max(0.,distance)/max(.001,radius);
  return 3.*strength/(1.+q*q)*(1.-smoothstep(1.,1.5,q));
 }
`;
