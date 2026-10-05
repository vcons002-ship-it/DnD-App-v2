import type {MapEnvironment} from './mapEnvironment.js';
type TerrainLighting=Partial<Pick<MapEnvironment,'enabled'|'lighting'|'lightLevel'|'heavyDarkness'>>;
const opacity={day:0,dusk:.32,night:.73,dungeon:.84};
/** Current heavy-darkness sight keeps muted color; memory stays grayscale. */
export const HEAVY_DARKVISION_DESATURATION=.20;
/** Regular darkvision keeps a trace of the artwork's color without pale haze. */
export const REGULAR_DARKVISION_DESATURATION=.70;
export const REGULAR_DARKVISION_TERRAIN_BRIGHTNESS=.28;
/** Readable memory contours; current heavy sight retains its stronger colored detail. */
export const HEAVY_DARKVISION_MEMORY_BRIGHTNESS=1.02;
/** Unlit ground grading shared by live terrain and explored-map memory. */
export function terrainDarknessOpacity(settings:TerrainLighting,dmVisibility=false):number {
 const level=(settings.lightLevel??1)*(settings.heavyDarkness?.1:1);
 return Math.min(dmVisibility?.25:1,1-(1-opacity[settings.lighting??'day'])*level);
}
/** Memory never retains old lantern illumination. Heavy darkvision has its
 * contour pass; regular memory has a readability floor in low ambient light. */
export function exploredTerrainBrightness(settings:TerrainLighting|undefined,heavy=false):number {
 if(heavy)return .025*HEAVY_DARKVISION_MEMORY_BRIGHTNESS;
 if(!settings?.enabled)return .48;
 return Math.max(.20,Math.min(.48,(1-terrainDarknessOpacity(settings))*1.6));
}
