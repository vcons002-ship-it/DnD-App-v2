import {db} from './db.js';
import {effectiveServerRendering,type RenderingOverride,type RenderingPolicyChange} from '../../shared/serverRendering.js';
// Session-owned settings survive reconnects and server restarts. Defaults require no rows.
export function renderingOverride(sessionId:string,scope:'board'|'player',id:string|null|undefined):RenderingOverride{
 if(!id)return 'inherit';
 const row=db.prepare('SELECT value FROM rendering_policies WHERE session_id=? AND scope=? AND target_id=?').get(sessionId,scope,id) as {value:RenderingOverride}|undefined;
 return row?.value??'inherit';
}
export function changeRenderingPolicy(sessionId:string,change:RenderingPolicyChange):boolean{
 if(!change||!['inherit','on','off'].includes(change.value))return false;
 const board=typeof change.mapId==='string',player=typeof change.playerId==='string';
 if(board===player)return false;
 const id=board?change.mapId!:change.playerId!;
 if(!id.trim()||id.length>64)return false;
 if(board&&!db.prepare('SELECT id FROM maps WHERE id=? AND session_id=?').get(id,sessionId))return false;
 const scope=board?'board':'player';
 if(change.value==='inherit')db.prepare('DELETE FROM rendering_policies WHERE session_id=? AND scope=? AND target_id=?').run(sessionId,scope,id);
 else db.prepare('INSERT OR REPLACE INTO rendering_policies(session_id,scope,target_id,value) VALUES(?,?,?,?)').run(sessionId,scope,id,change.value);
 return true;
}
export function renderingState(sessionId:string,mapId:string|null|undefined,playerId:string|null,preference=true){
 const board=renderingOverride(sessionId,'board',mapId),player=renderingOverride(sessionId,'player',playerId);
 return {preference,board,player,...effectiveServerRendering(preference,board,player)};
}
