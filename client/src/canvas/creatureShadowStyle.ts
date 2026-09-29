/** Build-only art review override. Normal gameplay uses full, lighter local
 * shadows until a different presentation is selected for the app. */
const review=import.meta.env.VITE_SHADOW_COMPARISON;
export const creatureShadowStyle:'compact'|'map'|'full'=review==='compact'||review==='map'?review:'full';
export const localCreatureShadowStrength=.45;
