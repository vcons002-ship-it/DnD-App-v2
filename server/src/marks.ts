import { markSpell, abilityKey } from '../../shared/hitFeatures.js';
import type { TokenKind, SheetAbility, Token, RevealStep, Character, Monster, HpDamagePart } from '../../shared/types.js';
import { tokenDistanceFt } from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import { rollDicePool, withDiceMetadata } from '../../shared/dice.js';
import { damageMultiplier } from '../../shared/combatMath.js';
import { getCharacter, getMonster, getToken, getSessionById, getMap, listTokens, listCharacters, listMonsters, queueSpellImpact, setSheetAbility, setCondition, setConcentration, addRollLog } from './sessions.js';

export const markedEntity = (kind:TokenKind,id:string) => kind === 'pc' ? getCharacter(id) : getMonster(id);
export function castMark(sessionId:string,kind:TokenKind,id:string,ability:SheetAbility,targetId:string|undefined,level:number,move=false,hexAbility?:string): boolean {
  const caster=markedEntity(kind,id), target=targetId ? getToken(targetId) : null;
  const mapId=getSessionById(sessionId)?.activeMapId;
  const source=mapId ? listTokens(mapId).find(t=>t.kind===kind && t.refId===id) : null;
  if (!caster || caster.sessionId!==sessionId || !markSpell(ability) || !source || !target || target.mapId!==mapId ||
      tokenDistanceFt(source,target,getMap(target.mapId))>90 ||
      !hasLineOfSight(source,target,getMap(target.mapId)?.walls) ||
      markedEntity(target.kind,target.refId)?.sessionId!==sessionId ||
      (target.kind==='monster' && getMonster(target.refId)?.objectKind)) return false;
  if (hexAbility && !['STR','DEX','CON','INT','WIS','CHA'].includes(hexAbility.toUpperCase())) return false;
  if (move) {
    if (ability.mark?.kind===target.kind && ability.mark.refId===target.refId) return false;
    if ((markedEntity(target.kind,target.refId)?.curHp ?? 0)<=0) return false;
    const old=ability.mark;
    if (!old?.active || old.expiresAt<=Date.now() || !caster.conditions.some(c=>c.isConcentration && abilityKey({name:c.label.replace(/^Concentration:\s*/i,'')})===abilityKey(ability)) ||
        (markedEntity(old.kind,old.refId)?.curHp ?? 1)>0) return false;
  } else setConcentration(kind,id,ability.name);
  const concentration=markedEntity(kind,id)!.conditions.find(c=>c.isConcentration);
  if(concentration)setCondition(kind,id,{...concentration,combatEffect:{casterKind:kind,casterId:id,spell:ability.name,castId:concentration.id,castLevel:level,...concentration.combatEffect}});
  // The effect belongs to this caster; it does not depend on a shared generic 'Marked' condition.
  setSheetAbility(kind,id,{...ability,stance:ability.stance ? {...ability.stance,active:false}:undefined,
    mark:{hexAbility:move?ability.mark?.hexAbility:hexAbility?.toUpperCase()??'STR',kind:target.kind,refId:target.refId,tokenId:target.id,active:true,
      expiresAt:move ? ability.mark!.expiresAt : Date.now()+(level>=5?24:level>=3?8:1)*3600000}});
  addRollLog(sessionId,{roller:caster.name,label:ability.name,expr:move?'Move mark':'Mark',total:0,
    detail:`${caster.name}: ${ability.name} ${move?'moved to':'marks'} ${markedEntity(target.kind,target.refId)!.name}${move?' (no spell slot)':''}.`});
  queueSpellImpact(sessionId,target.kind,target.refId,ability.name);
  return true;
}

/** One source for the damage eligibility and the persistent target indicator. */
export function activeMarks(caster:Character|Monster|undefined|null,target:Pick<Token,'kind'|'refId'>) {
  return (caster?.sheetAbilities??[]).filter(ab=>markSpell(ab)&&ab.mark?.active&&ab.mark.expiresAt>Date.now()&&
    ab.mark.kind===target.kind&&ab.mark.refId===target.refId&&caster!.conditions.some(c=>c.isConcentration&&
      abilityKey({name:c.label.replace(/^Concentration:\s*/i,'')})===abilityKey(ab)));
}

/** Mark damage has its own labeled throw, then joins the attack's HP application. */
export function markedDamage(kind:TokenKind,id:string,target:Token,crit:boolean) {
  const caster=markedEntity(kind,id), victim=markedEntity(target.kind,target.refId);
  const dice:RevealStep[]=[], mods:RevealStep[]=[], parts:HpDamagePart[]=[]; let amount=0;
  if (!caster || !victim) return {amount,dice,mods,parts};
  for(const ab of activeMarks(caster,target)) {
    const type=markSpell(ab), mark=ab.mark;
    if (!type || !mark?.active || mark.expiresAt<=Date.now() || mark.kind!==target.kind || mark.refId!==target.refId ||
        !caster.conditions.some(c=>c.isConcentration && abilityKey({name:c.label.replace(/^Concentration:\s*/i,'')})===abilityKey(ab))) continue;
    const rolls=withDiceMetadata({label:`${ab.name} — ${type} damage`},()=>rollDicePool([{expr:'1d6'},...(crit?[{expr:'1d6',critical:true}]:[])]));
    const total=rolls.reduce((sum,r)=>sum+(r?.total??0),0);
    const value=Math.floor(total*damageMultiplier(type,victim.resistances,victim.weaknesses,victim.immunities,{magical:true}));
    rolls.forEach((r,i)=>r?.rolls.forEach(face=>dice.push({label:`${ab.name} (${type})${i>0?' CRIT':''}`,value:face,faces:[face],diceExpression:'1d6',critical:i>0})));
    if (value!==total) mods.push({label:`${ab.name} ${type} adjustment`,value:value-total});
    amount+=value;
    if(value>0)parts.push({amount:value,damageType:type,spell:ab.name});
  }
  return {amount,dice,mods,parts};
}

export function hexDisadvantage(sid:string,kind:TokenKind,id:string,ability:string): string[] {
  return [...listCharacters(sid),...listMonsters(sid)].some(c=>c.sheetAbilities.some(a=>a.mark?.active&&a.mark.kind===kind&&a.mark.refId===id&&a.mark.expiresAt>Date.now()&&markSpell(a)==='necrotic'&&a.mark.hexAbility===ability&&c.conditions.some(v=>v.isConcentration&&abilityKey({name:v.label.replace(/^Concentration:\s*/i,'')})===abilityKey(a)))) ? ['Hex'] : [];
}
