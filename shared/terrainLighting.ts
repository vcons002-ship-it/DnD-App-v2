import type {MapEnvironment} from './mapEnvironment.js';
type TerrainLighting=Partial<Pick<MapEnvironment,'enabled'|'lighting'|'lightLevel'|'heavyDarkness'>>;
const opacity={day:0,dusk:.32,night:.73,dungeon:.84};
/** Current heavy-darkness sight keeps a trace of color; memory stays grayscale. */
export const HEAVY_DARKVISION_DESATURATION=.8;
/** Unlit ground grading shared by live terrain and explored-map memory. */
export function terrainDarknessOpacity(settings:TerrainLighting,dmVisibility=false):number {
 const level=(settings.lightLevel??1)*(settings.heavyDarkness?.1:1);
 return Math.min(dmVisibility?.25:1,1-(1-opacity[settings.lighting??'day'])*level);
}
/** Memory never retains old lantern illumination. Heavy darkvision has its
 * existing contour pass; regular memory follows the unlit scene's brightness. */
export function exploredTerrainBrightness(settings:TerrainLighting|undefined,heavy=false):number {
 if(heavy)return .025;
 if(!settings?.enabled)return .48;
 return Math.min(.48,1-terrainDarknessOpacity(settings));
}
