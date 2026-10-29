import type {EnvironmentQuality} from './mapEnvironment.js';

/** Browser-only rendering budgets. Never used for visibility, movement or dice outcomes. */
export const DEFAULT_GRAPHICS_QUALITY='low' as const;
export type AutoGraphicsTier='high'|'balanced'|'low';
export function graphicsBudget(quality:EnvironmentQuality, viewportWidth=1440,autoTier?:AutoGraphicsTier){
  const resolved=quality==='auto'?(autoTier??(viewportWidth<900?'balanced':'high')):quality;
  const legacy=resolved==='legacy';
  const low=resolved==='low'||resolved==='off'||legacy;
  return {
    resolved,
    legacy,
    idleSceneFps:low?12:resolved==='balanced'?20:30,
    visibilityRefreshMs:legacy?500:0,
    modelQuality:resolved==='off'||legacy?'low' as const:resolved,
    miniatureLightMode:low?'ground' as const:'directional' as const,
    pixelRatioCap:low?1:resolved==='balanced'?1.5:2,
    localShadowSize:low?256:resolved==='balanced'?384:512,
    localShadowLights:resolved==='off'||legacy?0:low?2:4,
    localShadowMethod:resolved==='high'?'cube' as const:'floor' as const,
    localShadowFps:30,
    localShadowPoseFps:10,
    localShadowFloorSize:low?512:768,
    mapShadowSize:low?512:resolved==='balanced'?1024:2048,
    diceShadowSize:low?256:resolved==='balanced'?512:1024,
    diceRenderWidth:low?960:resolved==='balanced'?1200:1440,
    particleScale:resolved==='off'||legacy?0:low?.18:resolved==='balanced'?.35:1,
    mistQuality:resolved==='off'||legacy?'off' as const:resolved==='high'?'high' as const:'low' as const,
  };
}

export function parseGraphicsQuality(value:unknown):EnvironmentQuality{
  return value==='auto'||value==='high'||value==='balanced'||value==='low'||value==='off'||value==='legacy'?value:DEFAULT_GRAPHICS_QUALITY;
}
