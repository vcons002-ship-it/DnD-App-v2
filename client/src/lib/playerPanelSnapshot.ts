import type {StateSnapshot,Token} from '../../../shared/types';
const boardKeys=new Set(['tokens','playerVision','exploredTerrain','legacyGeometry','tokenSprites','visionRaster','visionTiles','terrainRaster','tokenLayerRaster','tokenLayerIds','miniaturePreloadFamilies','legacyMotion','explorationEpoch']);
/** The player reference console delegates live positions/targeting to its own
 * subscriber. Keep all character, combat, map and permission changes live. */
export function samePlayerPanelSnapshot(a:StateSnapshot,b:StateSnapshot){
 return [...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>boardKeys.has(key)||a[key as keyof StateSnapshot]===b[key as keyof StateSnapshot]);
}
export function samePanelToken(a:Token,b:Token){
 const {x:ax,y:ay,facing:af,...old}=a,{x:bx,y:by,facing:bf,...next}=b;return JSON.stringify(old)===JSON.stringify(next);
}
