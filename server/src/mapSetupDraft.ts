import {createHash} from 'node:crypto';
import {db} from './db.js';
import {geometrySource,prepareWallDraft} from './mapGeometryDraft.js';
import {prepareDoorDraft} from './mapDoorDraft.js';
import {prepareWindowDraft} from './mapWindowDraft.js';
import {prepareArchDraft} from './mapArchDraft.js';
import {lightDraftSource,prepareLightDraft} from './mapLightDraft.js';
import {getMap,createWallDoorObject,updateMapEnvironment} from './sessions.js';
import {sanitizeWalls} from '../../shared/mapWalls.js';
import type {MapSetupDrafts,MapSetupSelection} from '../../shared/mapSetupDraft.js';

/** Validate all three independent drafts, then save the reviewed setup together. */
export async function applyMapSetupDraft(mapId:string,raw:unknown,selection:unknown){
  const drafts=raw as MapSetupDrafts,selected=selection as MapSetupSelection;
  if(!drafts||!selected||!['walls','doors','lights'].every(key=>{
    const ids=selected[key as keyof MapSetupSelection];
    return Array.isArray(ids)&&ids.length<=120&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length;
  }))throw new Error('Invalid map setup selection.');
  if(selected.windows!==undefined&&(!Array.isArray(selected.windows)||selected.windows.length>120||selected.windows.some(id=>typeof id!=='string')||new Set(selected.windows).size!==selected.windows.length))throw Error('Invalid window selection.');
  if(selected.arches!==undefined&&(!Array.isArray(selected.arches)||selected.arches.length>120||selected.arches.some(id=>typeof id!=='string')||new Set(selected.arches).size!==selected.arches.length))throw Error('Invalid arch selection.');
  if(!selected.walls.length&&!selected.doors.length&&!selected.lights.length&&!selected.windows?.length&&!selected.arches?.length)throw new Error('Select at least one wall, door, window, arch or light.');
  const {map:original,source}=await geometrySource(mapId);
  return db.transaction(()=>{
    const map=getMap(mapId);
    if(!map||['imagePath','gridSizePx','feetPerSquare','gridOffsetX','gridOffsetY'].some(key=>map[key as keyof typeof map]!==original[key as keyof typeof original])||createHash('sha256').update(JSON.stringify(map.walls??[])).digest('hex')!==source.wallsHash)throw new Error('The map changed during review. Run the analyses again.');
    const addedWalls=selected.walls.length?prepareWallDraft(drafts.walls,selected.walls,source):[];
    const walls=[...(map.walls??[]),...addedWalls];
    // Door masks may have arrived before wall masks. Fit to the final selection,
    // without saving those walls early or invalidating the original door draft.
    const addedDoors=selected.doors.length?prepareDoorDraft(drafts.doors,selected.doors,source,walls):[];
    walls.push(...addedDoors);
    const addedArches=selected.arches?.length?prepareArchDraft(drafts.arches,selected.arches,source,walls):[];
    walls.push(...addedArches);
    const addedWindows=selected.windows?.length?prepareWindowDraft(drafts.windows,selected.windows,source,walls):[];
    walls.push(...addedWindows);
    const addedLights=selected.lights.length?prepareLightDraft(drafts.lights,selected.lights,lightDraftSource(source,map.environment?.lights??[])):[];
    if(sanitizeWalls(walls).length!==walls.length)throw new Error('This setup contains invalid geometry. Review the selected walls and doors.');
    // No writes occur until every selected workflow has passed validation.
    for(const door of addedDoors.filter(w=>w.door)){
      const token=createWallDoorObject(map.sessionId,mapId,(door.ax+door.bx)/2,(door.ay+door.by)/2);
      door.tokenId=token.id;
    }
    if(addedWalls.length||addedDoors.length||addedWindows.length||addedArches.length)db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),mapId);
    if(addedLights.length)updateMapEnvironment(map.sessionId,mapId,{enabled:true,lights:[...(map.environment?.lights??[]),...addedLights]});
    return {walls:addedWalls.length+addedDoors.filter(w=>!w.door).length,doors:addedDoors.filter(w=>w.door).length,lights:addedLights.length,...(selected.windows!==undefined?{windows:addedWindows.length}:{}),...(selected.arches!==undefined?{arches:addedArches.length}:{})};
  })();
}
