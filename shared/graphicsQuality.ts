import type {EnvironmentQuality} from './mapEnvironment.js';

/** Browser-only rendering budgets. Never used for visibility, movement or dice outcomes. */
export function graphicsBudget(quality:EnvironmentQuality, viewportWidth=1440){
  const resolved=quality==='auto'?(viewportWidth<900?'balanced':'high'):quality;
  const low=resolved==='low'||resolved==='off';
  return {
    resolved,
    pixelRatioCap:low?1:resolved==='balanced'?1.5:2,
    localShadowSize:low?256:resolved==='balanced'?384:512,
    localShadowLights:resolved==='off'?0:low?2:4,
    mapShadowSize:low?512:resolved==='balanced'?1024:2048,
    diceShadowSize:low?256:resolved==='balanced'?512:1024,
    diceRenderWidth:low?960:resolved==='balanced'?1200:1440,
    particleScale:resolved==='off'?0:low?.18:resolved==='balanced'?.35:1,
    mistQuality:resolved==='off'?'off' as const:resolved==='high'?'high' as const:'low' as const,
  };
}

export function parseGraphicsQuality(value:unknown):EnvironmentQuality{
  return value==='high'||value==='balanced'||value==='low'||value==='off'?value:'auto';
}
