import {syncPassWithoutTrace} from './partySpellEffects.js';
import {newId} from './db.js';
import { abilityKey } from '../../shared/hitFeatures.js';
import { rollDice, withDiceMetadata } from '../../shared/dice.js';
import { damageMultiplier } from '../../shared/combatMath.js';
import type { Token } from '../../shared/types.js';
import { markedEntity } from './marks.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import { hitEffectSave } from './hitFeatures.js';
import { listTokens,listCharacters,listMonsters,isDeadEntity,getSessionById,getToken,getMap,endConcentration,clearCondition,applyDamage,addRollLog,setCondition } from './sessions.js';
import { noteConcentration, stanceResistances } from './combat.js';

/** Expiration and lost concentration apply even to creatures on another map.
 * Called before commands publish changes as well as before turn hooks. */
export function expireTimedSpellEffects(sid:string) {
  const round=getSessionById(sid)?.combatRound??0;
  let changed=false;
  for(const [kind,entities] of [['pc',listCharacters(sid)],['monster',listMonsters(sid)]] as const)
    for(const e of entities) for(const c of e.conditions) {
      const fx=c.combatEffect;
      if(!fx || fx.parentConditionId || (!fx.castId&&!/^Reaction spent/.test(c.label))) continue;
      // Recovery is tied to the affected creature's next completed turn, not
      // the round boundary. Its six-second timer only applies outside combat.
      if(round>0 && c.label==='Haste lethargy')continue;
      // A one-minute spell begun before initiative retains its remaining
      // duration when combat begins rather than becoming an endless effect.
      if(round>0 && !fx.expiresRound && fx.expiresAt) {
        if(fx.expiresAt<=Date.now()) {clearCondition(kind,e.id,c.id);changed=true;continue;}
        setCondition(kind,e.id,{...c,combatEffect:{...fx,expiresRound:round+Math.ceil((fx.expiresAt-Date.now())/6000)}});
        changed=true;
      }
      const caster=markedEntity(fx.casterKind,fx.casterId);
      if(fx.spellAction&&fx.spell.toLowerCase()==='witch bolt'&&fx.targetTokenId) {
        const target=getToken(fx.targetTokenId),map=target&&getMap(target.mapId),actor=target&&listTokens(target.mapId).find(t=>t.kind===kind&&t.refId===e.id);
        if(!target||!actor||!map||tokenDistanceFt(actor,target,map)>60||!hasLineOfSight(actor,target,map.walls)) {
          endConcentration(kind,e.id,'Witch Bolt link broken by distance or Total Cover');changed=true;continue;
        }
      }
      const expired = round > 0 ? !fx.untilCasterTurn && !!fx.expiresRound && round>=fx.expiresRound
        : !!fx.expiresAt && fx.expiresAt<=Date.now();
      const ended = fx.concentration && !caster?.conditions.some(v=>v.isConcentration&&v.id===fx.castId);
      const dead = ['hold person','hold monster'].includes(fx.spell.toLowerCase()) && !c.isConcentration && isDeadEntity(kind,e);
      if(expired || ended || dead) {clearCondition(kind,e.id,c.id);changed=true;}
    }
  return syncPassWithoutTrace(sid)||changed;
}

export function processHitEffects(sid:string,token:Token,phase:'start'|'end') {
  expireTimedSpellEffects(sid);
  if(phase==='end')expireOnCasterTurn(sid,token,'end');
  const e=markedEntity(token.kind,token.refId); if(!e) return;
  for(const c of e.conditions) {
    const fx=c.combatEffect; if(!fx || fx.parentConditionId) continue;
    if(phase==='start' && fx.untilTargetStart){clearCondition(token.kind,token.refId,c.id);continue;}
    if(c.label==='Haste lethargy') {
      if(phase==='start') setCondition(token.kind,token.refId,{...c,combatEffect:{...fx,lethargyTurnStarted:true}});
      else if(fx.lethargyTurnStarted) clearCondition(token.kind,token.refId,c.id);
      continue;
    }
    if(phase==='start' && c.label==='Haste') setCondition(token.kind,token.refId,{...c,combatEffect:{...fx,hasteActionUsed:undefined}});
    const caster=markedEntity(fx.casterKind,fx.casterId);
    const round=getSessionById(sid)?.combatRound??0;
    if((round>0 ? !!fx.expiresRound && round>=fx.expiresRound : !!fx.expiresAt && fx.expiresAt<=Date.now()) || fx.concentration && !caster?.conditions.some(v=>v.isConcentration&&
      (fx.castId?v.id===fx.castId:abilityKey({name:v.label.replace(/^Concentration:\s*/i,'')})===abilityKey({name:fx.spell})))) {
      clearCondition(token.kind,token.refId,c.id); continue;
    }
    const tick=`${round}:${getSessionById(sid)?.activeTurnTokenId}:${phase}`;
    if(fx.phase!==phase || fx.lastTick===tick) continue;
    setCondition(token.kind,token.refId,{...c,combatEffect:{...fx,lastTick:tick}});
    if(fx.saveBeforeDamage&&fx.save&&hitEffectSave(sid,token,fx.save,fx.dc!,fx.spell)) {
      clearCondition(token.kind,token.refId,c.id);
      if(fx.spell.toLowerCase()==='phantasmal killer'&&caster?.conditions.some(v=>v.isConcentration&&v.id===fx.castId))
        endConcentration(fx.casterKind,fx.casterId,'Phantasmal Killer ended by a successful save');
      continue;
    }
    if(fx.dice) {
      const roll=withDiceMetadata({label:`${fx.spell} - ${phase==='start'?'Start':'End'}-of-turn Damage`,target:{kind:token.kind,refId:token.refId}},()=>rollDice(fx.dice!))!;
      const rollId=newId();
      const amount=Math.floor(roll.total*damageMultiplier(fx.damageType,[...e.resistances,...stanceResistances(token.kind,token.refId)],e.weaknesses,e.immunities,{magical:true}));
      applyDamage(token.kind,token.refId,amount,fx.damageType,false,rollId,{spell:fx.spell});
      noteConcentration(sid,token.kind,token.refId,amount);
      addRollLog(sid,{roller:fx.spell,label:'Ongoing damage',expr:fx.dice,total:amount,detail:`${e.name}: ${fx.spell} deals ${amount} ${fx.damageType} damage at the ${phase} of its turn.`,
        reveal:{kind:'damage',title:`${fx.spell} - ${phase==='start'?'Start':'End'}-of-turn Damage`,attacker:fx.spell,target:e.name,outcome:'none',damage:amount,damageType:fx.damageType,
          damageDice:[{label:fx.dice,value:roll.total,faces:roll.rolls}],damageMods:amount!==roll.total?[{label:'Damage adjustment',value:amount-roll.total}]:[],
          visibilityTarget:{kind:token.kind,refId:token.refId}}},rollId);
    }
    if(fx.once || !fx.saveBeforeDamage&&fx.save&&hitEffectSave(sid,token,fx.save,fx.dc!,fx.spell)) clearCondition(token.kind,token.refId,c.id);
  }
}
export function expireOnCasterTurn(sid:string,token:Token,phase:'start'|'end'='start') {
  for(const [kind,entities] of [['pc',listCharacters(sid)],['monster',listMonsters(sid)]] as const) for(const e of entities) for(const c of e.conditions) {
    const fx=c.combatEffect;
    if(!fx||fx.casterKind!==token.kind||fx.casterId!==token.refId)continue;
    if(phase==='start'&&fx.untilCasterEnd)setCondition(kind,e.id,{...c,combatEffect:{...fx,casterTurnStarted:true}});
    if(phase==='end'&&fx.untilCasterEnd&&fx.casterTurnStarted || phase==='start'&&fx.untilCasterTurn) {
      if(fx.spell.toLowerCase()==='heat metal')setCondition(kind,e.id,{...c,combatEffect:{...fx,untilCasterTurn:false,attackDisadvantage:false,checkDisadvantage:false}});
      else clearCondition(kind,e.id,c.id);
    }
  }
}
export function consumeHitAdvantage(token:Token) {
  for(const c of markedEntity(token.kind,token.refId)?.conditions??[]) if(c.combatEffect?.nextAttackAdvantage)
    setCondition(token.kind,token.refId,{...c,combatEffect:{...c.combatEffect,nextAttackAdvantage:false}});
}
