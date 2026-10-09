import type {AbilityRollPayload,SpellAreaPreview,SpellAreaPreviewIntent,SpellRepeatPayload} from '../../shared/types.js';
import {spellAreaFor} from '../../shared/spellAreas.js';
import {broadcastSpellArea,getConn,type IOServer} from './connections.js';
import {getActiveMapId,getCharacter,getMap,getMonster,listTokens} from './sessions.js';

/** Cosmetic only: canonical sheet geometry, no target names or combat mutations. */
export class SpellAreaPreviewController {
 private preview:SpellAreaPreview|null=null;
 private sessionId:string|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private io:IOServer,private id:string){}
 private validate(payload:SpellAreaPreviewIntent):SpellAreaPreview|null {
  const conn=getConn(this.id),area=payload?.area;
  if(!conn||!area||typeof area.mapId!=='string'||payload.castLevel!==undefined&&(!Number.isFinite(payload.castLevel)||payload.castLevel<0)||!['pc','monster'].includes(payload.kind)||typeof payload.refId!=='string'||typeof payload.abilityId!=='string')return null;
  const map=getMap(area.mapId),entity=payload.kind==='pc'?getCharacter(payload.refId):getMonster(payload.refId);
  if(!map||map.sessionId!==conn.sessionId||map.id!==(conn.viewMapId??getActiveMapId(conn.sessionId))||!entity||entity.sessionId!==conn.sessionId)return null;
  if(conn.role!=='dm'&&(payload.kind!=='pc'||getCharacter(payload.refId)?.claimedBy!==this.id||map.id!==getActiveMapId(conn.sessionId)))return null;
  const ability=entity.sheetAbilities.find(a=>a.id===payload.abilityId),spec=ability&&spellAreaFor(ability,payload.castLevel);
  const caster=listTokens(map.id).find(t=>t.kind===payload.kind&&t.refId===payload.refId);
  if(!spec||!caster||!Number.isFinite(area.angle)||!Array.isArray(area.points)||area.points.length>(spec.count??1)||area.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e7||Math.abs(p.y)>1e7))return null;
  return {id:this.id,name:ability!.name,spec,area:{mapId:map.id,points:area.points.map(p=>({x:p.x,y:p.y})),angle:area.angle},caster:{x:caster.x,y:caster.y},resolving:false};
 }
 update(payload:SpellAreaPreviewIntent|null):void {
  if(this.preview?.resolving)return;
  if(payload===null){this.clear();return;}
  const preview=this.validate(payload);if(!preview)return;
  this.sessionId=getConn(this.id)!.sessionId;this.preview=preview;
  broadcastSpellArea(this.io,this.sessionId,this.id,preview);
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.clear(),300000);this.timer.unref();
 }
 begin(payload:AbilityRollPayload|SpellRepeatPayload):boolean {
  if(!payload?.area||this.preview?.resolving||typeof payload.refId!=='string'||!['pc','monster'].includes(payload.kind))return false;
  let abilityId='abilityId'in payload?payload.abilityId:undefined,castLevel='castLevel'in payload?payload.castLevel:undefined;
  if('conditionId'in payload){const entity=payload.kind==='pc'?getCharacter(payload.refId):getMonster(payload.refId),fx=entity?.conditions.find(c=>c.id===payload.conditionId)?.combatEffect;abilityId=fx?.abilityId;castLevel=fx?.castLevel;}
  if(!abilityId)return false;
  const preview=this.validate({...payload,abilityId,castLevel,area:payload.area});if(!preview)return false;
  clearTimeout(this.timer);this.sessionId=getConn(this.id)!.sessionId;this.preview={...preview,resolving:true};
  broadcastSpellArea(this.io,this.sessionId,this.id,this.preview);return true;
 }
 clear():void {clearTimeout(this.timer);if(this.sessionId)broadcastSpellArea(this.io,this.sessionId,this.id,null);this.preview=null;this.sessionId=undefined;}
}
