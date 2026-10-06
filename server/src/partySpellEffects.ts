import {breakInvisibility} from './advancedSpells.js';
import {partySpell} from '../../shared/partySpells.js';
import {shieldAcBonus,spellActionBlockMessage} from '../../shared/spellBuffs.js';
import {effectiveAc} from '../../shared/modifiers.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight,distanceToWall} from '../../shared/mapWalls.js';
import {spellSlotOptions,selectSpellSlot} from '../../shared/spellSlotPools.js';
import type {PendingDamage,TokenKind,AbilityRollPayload} from '../../shared/types.js';
import {newId,db} from './db.js';
import {markTeleport} from './tokenTeleports.js';
import {getCharacter,getMonster,getSessionById,getToken,getMap,listTokens,listCharacters,listMonsters,getRollEntry,setRollPending,setRollSmite,setRollReveal,addRollLog,setCondition,clearCondition,spendSpellSlot,queueSpellImpact,isDeadEntity} from './sessions.js';
import {resolveAttackDamage} from './combat.js';

const entity=(kind:TokenKind,id:string)=>kind==='pc'?getCharacter(id):getMonster(id);
const reactionBlock=(e:{conditions:import('../../shared/types.js').Condition[]})=>spellActionBlockMessage({conditions:e.conditions.filter(c=>c.combatEffect?.spell!=='Command')});
export const reactionSpent=(conditions:readonly {label:string}[])=>conditions.some(c=>/^reaction spent|^(incapacitated|paralyzed|petrified|stunned|unconscious)$/i.test(c.label));
export function shieldGate(sid:string,kind:TokenKind,id:string,attackTotal?:number,natural20=false):PendingDamage['shield'] {
  const e=entity(kind,id);
  if(!e||e.sessionId!==sid||e.curHp<=0||isDeadEntity(kind,e)||shieldAcBonus(e)||reactionSpent(e.conditions)||reactionBlock(e))return;
  const a=e.sheetAbilities.find(a=>partySpell(a)==='shield');
  if(!a||kind==='pc'&&!spellSlotOptions(getCharacter(id)!,1).some(o=>o.remaining>0))return;
  return {abilityId:a.id,attackTotal,natural20,automatic:!getSessionById(sid)?.manualDamage};
}

export function resolveShield(sid:string,roller:string,rollId:string,pass=false,level=1,pool?:'spellcasting'|'pact',interrupted=false):{ok:boolean;reason?:string;blocked?:boolean} {
  const entry=getRollEntry(rollId,sid),p=entry?.pending,gate=p?.shield;
  if(!p||p.done||!gate)return {ok:false,reason:'This Shield reaction has already been resolved.'};
  const e=entity(p.target.kind,p.target.refId);
  if(!e||e.sessionId!==sid)return {ok:false,reason:'The defender is no longer available.'};
  if(!pass) {
    if(!e.sheetAbilities.some(a=>a.id===gate.abilityId&&partySpell(a)==='shield')||reactionSpent(e.conditions)||e.curHp<=0||reactionBlock(e))return {ok:false,reason:'Shield requires an available reaction.'};
    if(p.target.kind==='pc') {
      const ch=getCharacter(e.id)!,slot=selectSpellSlot(ch,level,pool);
      if(!Number.isInteger(level)||level<1||level>9||!slot?.remaining||!spendSpellSlot(ch.id,slot.level,pool))return {ok:false,reason:'Choose an available spell slot for Shield.'};
    }
    breakInvisibility(p.target.kind,e.id,'casting Shield');
    const fx={casterKind:p.target.kind,casterId:e.id,spell:'Shield',castId:newId(),untilCasterTurn:true,expiresAt:Date.now()+6000};
    setCondition(p.target.kind,e.id,{id:fx.castId,label:'Shield',aura:'blue',isConcentration:false,combatEffect:fx});
    setCondition(p.target.kind,e.id,{id:newId(),label:'Reaction spent (Shield)',aura:'blue',isConcentration:false,combatEffect:{...fx,castId:undefined}});
    queueSpellImpact(sid,p.target.kind,e.id,'Shield');
  }
  if(interrupted){
    const fx={casterKind:p.target.kind,casterId:e.id,spell:'Shield',untilCasterTurn:true,expiresAt:Date.now()+6000};
    setCondition(p.target.kind,e.id,{id:newId(),label:'Reaction spent (Shield)',aura:'blue',isConcentration:false,combatEffect:fx});
    breakInvisibility(p.target.kind,e.id,'casting Shield');
  }
  const protectedNow=shieldAcBonus(entity(p.target.kind,e.id)!)>0;
  const blocked=protectedNow&&(gate.attackTotal===undefined||!gate.natural20&&gate.attackTotal<effectiveAc(entity(p.target.kind,e.id)!));
  setRollPending(rollId,{...p,shield:undefined,...(blocked?{done:true,amount:0}: {})});
  if(blocked) {
    if(entry?.smite)setRollSmite(rollId,{...entry.smite,used:true});
    if(entry?.reveal)setRollReveal(rollId,{...entry.reveal,outcome:'miss',effectOutcome:'Shield blocks the hit — no damage.'});
  }
  addRollLog(sid,{roller,label:'Shield reaction',expr:'Shield',total:0,detail:interrupted?'Shield countered. The hit continues.':pass?'Shield declined. The hit continues.':`Shield: +5 AC until the start of ${e.name}'s next turn. ${blocked?'The triggering hit is blocked.':'The triggering hit still lands.'}`});
  if(!blocked&&gate.automatic)resolveAttackDamage(sid,entry?.roller??roller,rollId);
  return {ok:true,blocked};
}

export function syncPassWithoutTrace(sid:string):boolean {
  let changed=false;
  const entities=[...listCharacters(sid).map(e=>({kind:'pc' as const,e})),...listMonsters(sid).map(e=>({kind:'monster' as const,e}))];
  for(const {kind,e} of entities)for(const c of e.conditions) {
    const fx=c.combatEffect;
    if(!c.isConcentration||fx?.spell!=='Pass without Trace'||!fx.auraRecipients)continue;
    const mapId=getSessionById(sid)?.activeMapId,map=mapId&&getMap(mapId),tokens=map?listTokens(map.id):[];
    const source=tokens.find(t=>t.kind===kind&&t.refId===e.id);
    for(const recipient of fx.auraRecipients) {
      const target=entity(recipient.kind,recipient.refId),tok=tokens.find(t=>t.kind===recipient.kind&&t.refId===recipient.refId);
      if(!target||target.sessionId!==sid)continue;
      const active=!!source&&!!tok&&!!map&&Math.hypot(source.x-tok.x,source.y-tok.y)*map.feetPerSquare/map.gridSizePx<=30+1e-6&&hasLineOfSight(source,tok,map.walls);
      const existing=target.conditions.find(v=>!v.isConcentration&&v.combatEffect?.castId===fx.castId&&v.combatEffect?.stealthBonus===10);
      if(active&&!existing){setCondition(recipient.kind,recipient.refId,{id:newId(),label:'Pass without Trace',aura:'green',isConcentration:false,combatEffect:{...fx,concentration:true,auraRecipients:undefined,stealthBonus:10}});changed=true;}
      if(!active&&existing){clearCondition(recipient.kind,recipient.refId,existing.id);changed=true;}
    }
  }
  return changed;
}

export function mistyStepError(sid:string,kind:TokenKind,id:string,d:AbilityRollPayload['destination']):string|undefined {
  const map=d&&getMap(d.mapId),e=entity(kind,id),source=map&&listTokens(map.id).find(t=>t.kind===kind&&t.refId===id);
  if(!d||![d.x,d.y].every(Number.isFinite)||!map||map.sessionId!==sid||getSessionById(sid)?.activeMapId!==map.id||!source||!e)return 'Place the caster and choose a destination on the active map.';
  if(tokenDistanceFt({...source,widthFt:0},{...d,widthFt:0},map)>30+1e-6)return 'Misty Step reaches up to 30 feet.';
  if((map.walls??[]).some(w=>!(w.door&&w.open)&&distanceToWall(d,w)<.1))return 'Choose a destination outside the wall.';
  // A visible window permits teleporting through it; closed opaque walls do not.
  if(!hasLineOfSight(source,d,map.walls))return 'Choose a destination the caster can see.';
  if(listTokens(map.id).some(t=>t.id!==source.id&&Math.hypot(t.x-d.x,t.y-d.y)<(source.widthFt+t.widthFt)*map.gridSizePx/map.feetPerSquare/2))return 'Choose an unoccupied destination.';
}
export function teleportMistyStep(sid:string,kind:TokenKind,id:string,d:NonNullable<AbilityRollPayload['destination']>):boolean {
  if(mistyStepError(sid,kind,id,d))return false;
  const token=listTokens(d.mapId).find(t=>t.kind===kind&&t.refId===id)!;
  db.prepare('UPDATE tokens SET x = ?, y = ? WHERE id = ?').run(d.x,d.y,token.id);
  markTeleport(token.id);
  queueSpellImpact(sid,kind,id,'Misty Step');
  addRollLog(sid,{roller:entity(kind,id)!.name,label:'Misty Step',expr:'Misty Step',total:0,detail:'Misty Step — teleported to the chosen visible, unoccupied destination (up to 30 ft).'});
  return true;
}
export function shakeAwake(sid:string,actorId:string,targetId:string):string|undefined {
  const actor=getToken(actorId),target=getToken(targetId),map=actor&&getMap(actor.mapId);
  if(!actor||!target||!map||map.sessionId!==sid||actor.mapId!==target.mapId||actor.kind===target.kind&&actor.refId===target.refId)return 'Choose another creature to shake awake.';
  const a=entity(actor.kind,actor.refId),e=entity(target.kind,target.refId);
  if(!a||a.curHp<=0||reactionSpent(a.conditions.filter(c=>!/^reaction spent/i.test(c.label)))||spellActionBlockMessage(a))return 'The acting creature cannot take an action.';
  if(tokenDistanceFt(actor,target,map)>5||!hasLineOfSight(actor,target,map.walls))return 'Move within 5 feet of the creature to shake them awake.';
  const conditions=e?.conditions.filter(c=>c.label==='Hypnotic Pattern'&&c.combatEffect?.spell==='Hypnotic Pattern')??[];
  if(!conditions.length)return 'This creature is not affected by Hypnotic Pattern.';
  conditions.forEach(c=>clearCondition(target.kind,target.refId,c.id));
  addRollLog(sid,{roller:a.name,label:'Shake awake',expr:'Action',total:0,detail:`${a.name} uses an action to shake ${e!.name} awake. Hypnotic Pattern ends for this creature.`});
}
