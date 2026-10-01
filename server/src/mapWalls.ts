import {randomUUID} from 'node:crypto';
import {cutPolygonDoor} from './wallPolygonDoor.js';
import {eraseWallArea} from './wallErase.js';
import {db} from './db.js';
import {getMap,listTokens,getToken,getMonster,createWallDoorObject,setCondition,clearCondition} from './sessions.js';
import {sanitizeWalls,cutDoor,distanceToWall,wallCollisionRadiusFt,type WallEdit} from '../../shared/mapWalls.js';

/** Incremental edits preserve segments added by another DM window. */
export function editMapWalls(sessionId:string,mapId:string,edit:WallEdit):string|null {
  const map=getMap(mapId);
  if(!map||map.sessionId!==sessionId)return 'Map not found in this campaign.';
  let walls=map.walls??[];
  if(edit.door){
    if(walls.some(w=>w.id===edit.door!.id))return null;
    const wall=walls.find(w=>w.id===edit.door!.wallId),parts=wall&&(cutDoor(wall,edit.door)??cutPolygonDoor(wall,edit.door));
    if(!parts)return 'Drag along an existing wall to set the door width.';
    const next=[...walls.filter(w=>w.id!==wall!.id),...parts];
    if(sanitizeWalls(next).length!==next.length)return 'The door could not be fitted safely. Try a shorter, straighter opening.';
    let token=edit.door.tokenId?getToken(edit.door.tokenId):null;
    if(edit.door.tokenId&&(!token||token.mapId!==mapId||token.kind!=='monster'||getMonster(token.refId)?.objectKind!=='door'||walls.some(w=>w.tokenId===token!.id)))return 'Select an unattached door object on this map.';
    const door=next.find(w=>w.door&&w.id===edit.door!.id)!;
    token??=createWallDoorObject(sessionId,mapId,(door.ax+door.bx)/2,(door.ay+door.by)/2);
    door.tokenId=token.id;
    db.prepare('UPDATE tokens SET x=?, y=? WHERE id=?').run((door.ax+door.bx)/2,(door.ay+door.by)/2,token.id);
    door.open=!!getMonster(token.refId)?.conditions.some(c=>c.label.toLowerCase()==='open');
    walls=next;
  }else if(edit.eraseArea!==undefined){
    try{
      const next=eraseWallArea(walls,edit.eraseArea);
      if(sanitizeWalls(next).length!==next.length)return 'That cut leaves an invalid wall shape. Try a slightly larger erase area.';
      walls=next;
    }catch(error){return error instanceof Error?error.message:'Unable to erase that wall section.';}
  }else if(edit.update!==undefined){
    const old=walls.find(w=>w.id===edit.update!.id);
    if(!old)return 'Wall not found.';
    // Transforming geometry must not change lock state or detach the door object.
    const [wall]=sanitizeWalls([{...edit.update,door:old.door,open:old.open,tokenId:old.tokenId}]);
    if(!wall)return 'Invalid wall shape.';
    const next=walls.map(w=>w.id===old.id?wall:w);
    if(old.tokenId)db.prepare('UPDATE tokens SET x=?, y=? WHERE id=? AND map_id=?').run((wall.ax+wall.bx)/2,(wall.ay+wall.by)/2,old.tokenId,mapId);
    walls=next;
  }else if(edit.add!==undefined){
    const [wall]=sanitizeWalls([edit.add]);
    if(!wall)return 'Draw a wall with a visible length and thickness.';
    if(walls.some(w=>w.id===wall.id))return null; // A retried edit is idempotent.
    walls=[...walls,wall];
  }else if(typeof edit.removeId==='string')walls=walls.filter(w=>w.id!==edit.removeId);
  else return 'Choose a wall to add or erase.';
  db.prepare('UPDATE maps SET walls = ? WHERE id = ? AND session_id = ?').run(JSON.stringify(walls),mapId,sessionId);
  return null;
}


export function setWallDoor(sessionId:string,mapId:string,doorId:string,open:boolean):string|null {
 const map=getMap(mapId);
 if(!map||map.sessionId!==sessionId)return 'Map not found in this campaign.';
 const door=map.walls?.find(w=>w.id===doorId&&w.door);
 if(!door)return 'Door not found.';
 const token=door.tokenId?getToken(door.tokenId):null,obj=token?getMonster(token.refId):null;
 if(open&&obj?.conditions.some(c=>c.label.toLowerCase()==='locked'))return 'The door is locked. Unlock it first.';
 if(!open&&door.open&&listTokens(mapId).some(t=>!map.walls?.some(w=>w.tokenId===t.id)&&distanceToWall(t,door)<wallCollisionRadiusFt(t.widthFt)*map.gridSizePx/map.feetPerSquare))return 'Move the token clear of the doorway before closing it.';
 if(obj){
  const existing=obj.conditions.find(c=>c.label.toLowerCase()==='open');
  if(open&&!existing)setCondition('monster',obj.id,{id:randomUUID(),label:'Open',aura:'green',isConcentration:false});
  else if(!open&&existing)clearCondition('monster',obj.id,existing.id);
 }
 const walls=(map.walls??[]).map(w=>w.id===doorId?{...w,open}:w);
 db.prepare('UPDATE maps SET walls = ? WHERE id = ? AND session_id = ?').run(JSON.stringify(walls),mapId,sessionId);
 return null;
}
