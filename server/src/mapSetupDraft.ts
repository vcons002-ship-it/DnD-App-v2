import {createHash} from 'node:crypto';
import {db} from './db.js';
import {geometrySource,prepareWallDraft} from './mapGeometryDraft.js';
import {prepareDoorDraft} from './mapDoorDraft.js';
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
  if(!selected.walls.length&&!selected.doors.length&&!selected.lights.length)throw new Error('Select at least one wall, door or light.');
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
    const addedLights=selected.lights.length?prepareLightDraft(drafts.lights,selected.lights,lightDraftSource(source,map.environment?.lights??[])):[];
    if(sanitizeWalls(walls).length!==walls.length)throw new Error('This setup contains invalid geometry. Review the selected walls and doors.');
    // No writes occur until every selected workflow has passed validation.
    for(const door of addedDoors){
      const token=createWallDoorObject(map.sessionId,mapId,(door.ax+door.bx)/2,(door.ay+door.by)/2);
      door.tokenId=token.id;
    }
    if(addedWalls.length||addedDoors.length)db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),mapId);
    if(addedLights.length)updateMapEnvironment(map.sessionId,mapId,{enabled:true,lights:[...(map.environment?.lights??[]),...addedLights]});
    return {walls:addedWalls.length,doors:addedDoors.length,lights:addedLights.length};
  })();
}
