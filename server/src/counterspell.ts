import {advancedSpell,isInvisible} from '../../shared/advancedSpells.js';
import {seesInvisible} from '../../shared/invisibleSight.js';
import type {AbilityRollPayload,SheetAbility,Token,TokenKind,ClientToServerEvents} from '../../shared/types.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import {createPlayerVision,visionContains} from '../../shared/playerVision.js';
import {spellSlotOptions,selectSpellSlot} from '../../shared/spellSlotPools.js';
import {effectiveRecharge} from '../../shared/monsterAttacks.js';
import {effectiveStats} from '../../shared/modifiers.js';
import {spellcastingMod} from '../../shared/spellMath.js';
import {spellcastingKeyFor} from '../../shared/spellExecution.js';
import {spellActionBlockMessage} from '../../shared/spellBuffs.js';
import {db,newId} from './db.js';
import type {Conn} from './connections.js';
import {reactionSpent} from './partySpellEffects.js';
import {breakInvisibility} from './advancedSpells.js';
import {areaSaveRequest} from './combat.js';
import {rollSaveBatch} from './saveDiceBatch.js';
import {usingPhysicalDice} from '../../shared/dice.js';
import {getCharacter,getMonster,getMap,getSessionById,getToken,listTokens,setCondition,spendSpellSlot,addRollLog,queueSpellImpact,setAbilityRechargeSpent} from './sessions.js';

db.exec(`CREATE TABLE IF NOT EXISTS pending_spell_casts (id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,state TEXT NOT NULL)`);
export type HeldCast={id:string;sessionId:string;payload:AbilityRollPayload & {mapId?:string;x?:number;y?:number;rollId?:string;level?:number|string};event:'ability:roll'|'summon:cast'|'combat:hitFeature'|'combat:smite'|'spell:shield';source:Conn;socketId:string;roller:string;spell:string;casterTokenId:string;reactors:string[];declined:string[];expiresAt:number};
const entity=(t:Pick<Token,'kind'|'refId'>)=>t.kind==='pc'?getCharacter(t.refId):getMonster(t.refId);
export function heldCasts(sid:string):HeldCast[]{return (db.prepare('SELECT state FROM pending_spell_casts WHERE session_id=?').all(sid) as {state:string}[]).map(r=>JSON.parse(r.state));}
export function getHeldCast(sid:string,id:string){return heldCasts(sid).find(c=>c.id===id);}
const store=(c:HeldCast)=>db.prepare('INSERT OR REPLACE INTO pending_spell_casts VALUES (?,?,?)').run(c.id,c.sessionId,JSON.stringify(c));
export function finishHeldCast(c:HeldCast){db.prepare('DELETE FROM pending_spell_casts WHERE id=? AND session_id=?').run(c.id,c.sessionId);}

export function eligibleCounterspellers(c:Pick<HeldCast,'casterTokenId'|'sessionId'|'declined'>):Token[]{
 const caster=getToken(c.casterTokenId),map=caster&&getMap(caster.mapId),enemy=caster&&entity(caster);if(!caster||!map||!enemy)return [];
 const party=(t:Token)=>t.kind==='pc'||getMonster(t.refId)?.disposition==='friendly';
 const all=listTokens(map.id);
 return all.filter(t=>{
   const e=entity(t);if(!e||t.id===caster.id||party(t)===party(caster)||c.declined.includes(t.id)||e.curHp<=0||reactionSpent(e.conditions)||spellActionBlockMessage(e)||t.isHidden||caster.isHidden)return false;
   const spell=e.sheetAbilities.find(a=>advancedSpell(a)==='counterspell');
   if(!spell||effectiveRecharge(spell)?.spent||t.kind==='pc'&&!spellSlotOptions(getCharacter(t.refId)!,3).some(s=>s.remaining>0))return false;
   const distance=tokenDistanceFt(t,caster,map);
   if(distance>60+1e-6||!hasLineOfSight(t,caster,map.walls)||isInvisible(enemy)&&!seesInvisible(e,distance))return false;
   if(t.kind==='pc'){
     if(map.mapFogEnabled&&!map.mapFogRevealed.includes(`${Math.floor(caster.x/map.gridSizePx)},${Math.floor(caster.y/map.gridSizePx)}`)||map.tokenFogEnabled&&!map.tokenFogRevealed.includes(`${Math.floor(caster.x/map.gridSizePx)},${Math.floor(caster.y/map.gridSizePx)}`))return false;
     if(!visionContains(createPlayerVision(map,all,new Set([t.refId])),caster.x,caster.y))return false;
   }
   return true;
 });
}

export function deferCast(sid:string,payload:HeldCast['payload'],a:SheetAbility,source:Conn,socketId:string,roller:string,event:HeldCast['event']='ability:roll'):HeldCast|undefined {
 const waiting=heldCasts(sid).find(c=>c.payload.kind===payload.kind&&c.payload.refId===payload.refId);if(waiting)return waiting;
 if(a.type!=='spell'||a.executionProfile==='manual'||advancedSpell(a)==='counterspell'||/subtle|no components/i.test(a.meta??''))return;
 // Unspecified components are conservatively treated as a normal perceptible spell.
 const mapId=getSessionById(sid)?.activeMapId,caster=mapId&&listTokens(mapId).find(t=>t.kind===payload.kind&&t.refId===payload.refId);
 if(!caster)return;
 const c:HeldCast={id:newId(),sessionId:sid,payload,event,source,socketId,roller,spell:a.name,casterTokenId:caster.id,reactors:[],declined:[],expiresAt:Date.now()+30000};
 c.reactors=eligibleCounterspellers(c).map(t=>t.id);if(!c.reactors.length)return;
 store(c);return c;
}

export function counterspellChoice(sid:string,id:string,tokenId:string,pass:boolean,level=3,pool?:'spellcasting'|'pact'):{error?:string;resume?:HeldCast;interrupted?:boolean}{
 const c=getHeldCast(sid,id);if(!c)return {error:'That cast has already resolved.'};
 const token=eligibleCounterspellers(c).find(t=>t.id===tokenId);
 if(!token||!c.reactors.includes(tokenId))return {error:'Counterspell requires an available reaction and sight of the caster within 60 ft.'};
 if(pass){c.declined.push(tokenId);store(c);if(!eligibleCounterspellers(c).some(t=>c.reactors.includes(t.id))){finishHeldCast(c);return {resume:c};}return {};}
 const e=entity(token)!,a=e.sheetAbilities.find(a=>advancedSpell(a)==='counterspell')!,caster=getToken(c.casterTokenId)!,victim=entity(caster)!;
 if(!Number.isInteger(level)||level<3||level>9)return {error:'Choose an available level 3 or higher Counterspell slot.'};
 if(token.kind==='pc'){
   const slot=selectSpellSlot(getCharacter(e.id)!,level,pool);
   if(!slot?.remaining)return {error:'No spell slot available for Counterspell.'};
   spendSpellSlot(e.id,slot.level,slot.pool);
 }
 setAbilityRechargeSpent(token.kind,e.id,a.id,true);
 const dc=a.roll?.dc??8+(token.kind==='pc'?Math.ceil((e.level||1)/4)+1:2+Math.floor(Math.max(0,e.level-1)/4))+spellcastingMod(effectiveStats(e).scores,token.kind==='pc'?spellcastingKeyFor(getCharacter(e.id)!,a):a.roll?.castingAbility??(['INT','WIS','CHA'] as const).reduce((best,k)=>e.stats[k]>e.stats[best]?k:best,'INT'));
 setCondition(token.kind,e.id,{id:newId(),label:'Reaction spent (Counterspell)',aura:'blue',isConcentration:false,combatEffect:{casterKind:token.kind,casterId:e.id,spell:'Counterspell',untilCasterTurn:true,expiresAt:Date.now()+6000}});
 breakInvisibility(token.kind,e.id,'casting Counterspell');
 const request=areaSaveRequest(caster,'CON',dc)!;
 const [result]=rollSaveBatch([{...request,passEffect:`${c.spell} continues.`,failEffect:`${c.spell} interrupted; its spell slot is preserved.`}],'Counterspell — CON Saving Throw');
 const total=result.total+(request.extra??0),passed=total>=dc&&!request.autoFail;
 const idRoll=newId();
 queueSpellImpact(sid,caster.kind,caster.refId,'Counterspell',idRoll);
 addRollLog(sid,{roller:e.name,label:'Counterspell',expr:'CON save',total,hideMods:caster.kind==='monster',detail:`${victim.name}: CON save ${total} vs DC ${dc} — ${passed?'PASS: '+c.spell+' continues.':'FAIL: '+c.spell+' interrupted; no effects or spell-slot expenditure.'}`,
  reveal:{kind:'check',title:'Counterspell — CON Saving Throw',attacker:e.name,target:victim.name,d20:result.face,attackTotal:total,toHit:[{label:'CON save modifiers',value:total-result.face}],outcome:passed?'pass':'fail',effectOutcome:passed?`${c.spell} continues!`:`${c.spell} countered!`,presentedLive:usingPhysicalDice(),visibilityTarget:{kind:caster.kind,refId:caster.refId}}},idRoll);
 if(!passed)breakInvisibility(caster.kind,caster.refId,'casting a countered spell');
 finishHeldCast(c);
 return passed?{resume:c}:{interrupted:true};
}
