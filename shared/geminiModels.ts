/** Quality-first defaults verified against Google's model catalog, 2026-09-29. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';
export function upgradeLegacyGeminiModel(value:string|undefined,image=false):string {
  const name=value?.trim()??'';
  const old=image?/^gemini-(?:2\.5-flash-image(?:-preview)?|3\.1-flash-image|3-pro-image-preview)$/:/^gemini-(?:flash-latest|pro-latest|2\.5-(?:flash(?:-lite)?|pro)|3-(?:flash|pro)-preview|3\.[5-8]-flash(?:-lite)?)$/;
  return !name||old.test(name)?(image?DEFAULT_GEMINI_IMAGE_MODEL:DEFAULT_GEMINI_MODEL):name;
}
export function preferredGeminiTextModel(names:string[]):string|undefined {
 const candidates=names.filter(n=>/^gemini-\d+(?:\.\d+)?-(?:pro|flash)(?:-preview(?:-\d+)?)?$/.test(n));
 return candidates.sort((a,b)=>{
   const tier=(n:string)=>n.includes('-pro')?1:0;
   return tier(b)-tier(a)||Number(b.match(/^gemini-([\d.]+)/)![1])-Number(a.match(/^gemini-([\d.]+)/)![1]);
 })[0];
}
