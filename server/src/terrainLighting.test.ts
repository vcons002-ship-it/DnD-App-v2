import {it,expect} from 'vitest';
import {terrainDarknessOpacity,exploredTerrainBrightness} from '../../shared/terrainLighting.js';
import {CARRIED_LANTERN_LIGHT_HEIGHT_FT} from '../../shared/lightFalloff.js';
import {createPlayerVision} from '../../shared/playerVision.js';
import {DEFAULT_MAP_ENVIRONMENT} from '../../shared/mapEnvironment.js';
import type {MapState,Token} from '../../shared/types.js';
it('uses the approved lantern source height and token center for authoritative sight',()=>{
 const map={gridSizePx:64,feetPerSquare:5,environment:{...DEFAULT_MAP_ENVIRONMENT,enabled:true,lighting:'dungeon'},walls:[]} as unknown as MapState;
 const token={id:'pc',kind:'pc',refId:'druk',x:400,y:190,carriedLantern:true} as Token;
 const vision=createPlayerVision(map,[token],new Set(['druk']))!;
 expect(vision.lights[0]).toMatchObject({x:400,y:190,height:CARRIED_LANTERN_LIGHT_HEIGHT_FT*64/5});
 expect(CARRIED_LANTERN_LIGHT_HEIGHT_FT).toBe(9);
});
it('matches regular dungeon memory to the unlit terrain budget and follows light level',()=>{
 const settings={enabled:true,lighting:'dungeon' as const,lightLevel:1};
 expect(terrainDarknessOpacity(settings)).toBeCloseTo(.84);
 expect(exploredTerrainBrightness(settings)).toBeCloseTo(.16);
 expect(exploredTerrainBrightness(settings)).toBeLessThanOrEqual(1-terrainDarknessOpacity(settings));
 expect(exploredTerrainBrightness({...settings,lightLevel:.5})).toBeCloseTo(.08);
 expect(exploredTerrainBrightness({...settings,lighting:'night'})).toBeCloseTo(.27);
});
it('preserves daylight memory, heavy darkvision and DM working-view grading',()=>{
 expect(exploredTerrainBrightness(undefined)).toBe(.48);
 expect(exploredTerrainBrightness({enabled:false,lighting:'dungeon'})).toBe(.48);
 expect(exploredTerrainBrightness({enabled:true,lighting:'day'})).toBe(.48);
 expect(exploredTerrainBrightness({enabled:true,lighting:'dungeon',heavyDarkness:true},true)).toBe(.025);
 expect(terrainDarknessOpacity({lighting:'dungeon',heavyDarkness:true})).toBeCloseTo(.984);
 expect(terrainDarknessOpacity({lighting:'dungeon'},true)).toBe(.25);
});
