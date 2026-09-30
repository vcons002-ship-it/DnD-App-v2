/** Radius means useful illumination; the final soft spill ends at 1.5 radii. */
export const LIGHT_SPILL_MULTIPLIER=1.5;
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
 float spellEmissionIrradiance(float distance,float radius,float strength){
  float q=max(0.,distance)/max(.001,radius);return 5.*strength*exp(-7.*q*q);
 }
 float lightColorCoverage(float irradiance){return smoothstep(.05,1.1,irradiance);}
 float lightIrradiance(float distance,float radius,float strength){
  float q=max(0.,distance)/max(.001,radius);
  return 3.*strength/(1.+q*q)*(1.-smoothstep(1.,1.5,q));
 }
`;
