import {db} from './db.js';import {getMap,updateMapEnvironment} from './sessions.js';import {pushUndo} from './undo.js';import {insertRow} from './backup.js';

/** DM-owned selection, deleted as one action; undo preserves later unrelated edits. */
export function deleteMapFeatures(sessionId:string,mapId:string,wallIds:unknown,lightIds:unknown):string|null {
 const valid=(ids:unknown):ids is string[]=>Array.isArray(ids)&&ids.length<=10000&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length;
 if(!valid(wallIds)||!valid(lightIds)||!wallIds.length&&!lightIds.length)return 'Select walls, doors, windows or lights to delete.';
 const map=getMap(mapId);if(!map||map.sessionId!==sessionId)return 'Map not found in this campaign.';
 const removedWalls=(map.walls??[]).filter(w=>wallIds.includes(w.id)),removedLights=(map.environment?.lights??[]).filter(l=>lightIds.includes(l.id));
 if(!removedWalls.length&&!removedLights.length)return null;
 const tokens=removedWalls.flatMap(w=>w.tokenId?[db.prepare('SELECT * FROM tokens WHERE id=? AND map_id=?').get(w.tokenId,mapId) as Record<string,unknown>|undefined]:[]).filter((row):row is Record<string,unknown>=>!!row);
 db.transaction(()=>{
  db.prepare('UPDATE maps SET walls=? WHERE id=? AND session_id=?').run(JSON.stringify((map.walls??[]).filter(w=>!wallIds.includes(w.id))),mapId,sessionId);
  for(const t of tokens)db.prepare('DELETE FROM tokens WHERE id=? AND map_id=?').run(t.id,mapId);
  if(removedLights.length)updateMapEnvironment(sessionId,mapId,{lights:(map.environment?.lights??[]).filter(l=>!lightIds.includes(l.id))});
 })();
 pushUndo(sessionId,'Delete map features',()=>db.transaction(()=>{
  const current=getMap(mapId);if(!current||current.sessionId!==sessionId)throw Error('Map no longer exists.');
  const walls=current.walls??[],lights=current.environment?.lights??[];
  db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify([...walls,...removedWalls.filter(w=>!walls.some(old=>old.id===w.id))]),mapId);
  if(removedLights.length)updateMapEnvironment(sessionId,mapId,{lights:[...lights,...removedLights.filter(l=>!lights.some(old=>old.id===l.id))]});
  for(const t of tokens)if(!db.prepare('SELECT id FROM tokens WHERE id=?').get(t.id))insertRow('tokens',t);
 })());return null;
}
