/** One lifetime and fade curve keep roots and attached foliage together. */
export const DICE_TRAIL_LIFETIME=1800;
export function diceTrailFade(age:number){
 const t=Math.max(0,Math.min(1,(age-.40)/.60));
 return 1-t*t*(3-2*t);
}
