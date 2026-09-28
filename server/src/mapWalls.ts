import {db} from './db.js';
import {getMap} from './sessions.js';
import {sanitizeWalls,MAX_MAP_WALLS} from '../../shared/mapWalls.js';

/** Incremental edits preserve segments added by another DM window. */
export function editMapWalls(sessionId:string,mapId:string,edit:{add?:unknown;removeId?:unknown}):string|null {
  const map=getMap(mapId);
  if(!map||map.sessionId!==sessionId)return 'Map not found in this campaign.';
  let walls=map.walls??[];
  if(edit.add!==undefined){
    const [wall]=sanitizeWalls([edit.add]);
    if(!wall)return 'Choose two different points for the wall.';
    if(walls.some(w=>w.id===wall.id))return null; // A retried edit is idempotent.
    if(walls.length>=MAX_MAP_WALLS)return `This map has reached its ${MAX_MAP_WALLS}-segment wall limit.`;
    walls=[...walls,wall];
  }else if(typeof edit.removeId==='string')walls=walls.filter(w=>w.id!==edit.removeId);
  else return 'Choose a wall to add or erase.';
  db.prepare('UPDATE maps SET walls = ? WHERE id = ? AND session_id = ?').run(JSON.stringify(walls),mapId,sessionId);
  return null;
}
