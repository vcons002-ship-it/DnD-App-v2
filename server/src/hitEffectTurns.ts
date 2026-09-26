import { abilityKey } from '../../shared/hitFeatures.js';
import { rollDice } from '../../shared/dice.js';
import { damageMultiplier } from '../../shared/combatMath.js';
import type { Token } from '../../shared/types.js';
import { markedEntity } from './marks.js';
import { hitEffectSave } from './hitFeatures.js';
import { listTokens,getSessionById,clearCondition,applyDamage,addRollLog,setCondition } from './sessions.js';
import { noteConcentration } from './combat.js';

export function processHitEffects(sid:string,token:Token,phase:'start'|'end') {
  const e=markedEntity(token.kind,token.refId); if(!e) return;
  for(const c of e.conditions) {
    const fx=c.combatEffect; if(!fx) continue;
    const caster=markedEntity(fx.casterKind,fx.casterId);
    const round=getSessionById(sid)?.combatRound??0;
    if((round>0 ? !!fx.expiresRound && round>=fx.expiresRound : !!fx.expiresAt && fx.expiresAt<=Date.now()) || fx.concentration && !caster?.conditions.some(v=>v.isConcentration&&abilityKey({name:v.label.replace(/^Concentration:\s*/i,'')})===abilityKey({name:fx.spell}))) {
      clearCondition(token.kind,token.refId,c.id); continue;
    }
    const tick=`${round}:${getSessionById(sid)?.activeTurnTokenId}:${phase}`;
    if(fx.phase!==phase || fx.lastTick===tick) continue;
    setCondition(token.kind,token.refId,{...c,combatEffect:{...fx,lastTick:tick}});
    if(fx.dice) {
      const roll=rollDice(fx.dice)!;
      const amount=Math.floor(roll.total*damageMultiplier(fx.damageType,e.resistances,e.weaknesses,e.immunities,{magical:true}));
      applyDamage(token.kind,token.refId,amount,fx.damageType);
      noteConcentration(sid,token.kind,token.refId,amount);
      addRollLog(sid,{roller:fx.spell,label:'Ongoing damage',expr:fx.dice,total:amount,detail:`${e.name}: ${fx.spell} deals ${amount} ${fx.damageType} damage.`});
    }
    if(fx.save&&hitEffectSave(sid,token,fx.save,fx.dc!,fx.spell)) clearCondition(token.kind,token.refId,c.id);
  }
}
export function expireOnCasterTurn(sid:string,token:Token) {
  const map=getSessionById(sid)?.activeMapId; if(!map) return;
  for(const t of listTokens(map)) for(const c of markedEntity(t.kind,t.refId)?.conditions??[]) {
    if(c.combatEffect?.untilCasterTurn&&c.combatEffect.casterKind===token.kind&&c.combatEffect.casterId===token.refId)
      clearCondition(t.kind,t.refId,c.id);
  }
}
export function consumeHitAdvantage(token:Token) {
  for(const c of markedEntity(token.kind,token.refId)?.conditions??[]) if(c.combatEffect?.nextAttackAdvantage)
    setCondition(token.kind,token.refId,{...c,combatEffect:{...c.combatEffect,nextAttackAdvantage:false}});
}
