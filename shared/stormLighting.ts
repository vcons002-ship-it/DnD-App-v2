/** Sparse cloud-lightning pulses, shared by clients using the wall clock.
 * No rapidly alternating strobe: a short rise and a slower afterglow. */
export function stormLightningAt(seconds:number):number {
  if(!Number.isFinite(seconds)||seconds<=0)return 0;
  const cycle=Math.floor(seconds/19),phase=seconds-cycle*19;
  const delay=3+((Math.imul(cycle,1664525)+1013904223)>>>0)%700/100;
  const age=phase-delay;
  if(age<0||age>1.1)return 0;
  return age<.09?Math.sin(age/.09*Math.PI/2):Math.exp(-(age-.09)*5.4)*(1-(age/1.1)**4);
}
