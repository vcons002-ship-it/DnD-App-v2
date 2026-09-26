import { abilityKey, hitFeature, hitSpell } from '../../shared/hitFeatures.js';
import type { Character, Token, Weapon, SheetAbility, Condition } from '../../shared/types.js';
import { tokenDistanceFt } from '../../shared/distance.js';
import { rollDice } from '../../shared/dice.js';
import { abilityMod, proficiencyBonus } from '../../shared/skills.js';
import { damageMultiplier, rollSavingThrow, weaponIsMagical } from '../../shared/combatMath.js';
import { saveAdvantage, saveAutoFail } from '../../shared/conditionEffects.js';
import { effectiveStats, saveExtra } from '../../shared/modifiers.js';
import { spellSaveDC } from '../../shared/spellMath.js';
import { spellcastingKeyFor } from '../../shared/spellExecution.js';
import { newId } from './db.js';
import { markedEntity } from './marks.js';
import { getSessionById, getCharacter, getMonster, getMap, getToken, listTokens, getRollEntry,
  setRollPending, setSheetAbility, setResource, spendSpellSlot, setCondition, clearCondition,
  setConcentration, addRollLog, endConcentration, moveToken } from './sessions.js';
import { resolveAttackDamage } from './combat.js';

export function turnKey(sid:string) {
  const s=getSessionById(sid);
  return `${s?.activeMapId}:${s?.combatRound}:${s?.activeTurnTokenId}`;
}
export function hitLevels(ch:Character, ab:SheetAbility) {
  return Object.entries(ch.spellSlots).filter(([k,v])=>/^L[1-9]$/.test(k)&&v.used<v.max&&Number(k.slice(1))>=(ab.level??1)).map(([k])=>Number(k.slice(1)));
}
function spent(ch:Character,key:string,turn:string) {
  if (!getSessionById(ch.sessionId)?.activeTurnTokenId) return false;
  return ch.sheetAbilities.some(a=>abilityKey(a)===key&&a.hitUsedTurn===turn);
}
const monkWeapon=(w:Weapon)=> /unarmed/i.test(w.name) || (w.tags??[]).some(t=>['monk','monk weapon'].includes(t.toLowerCase())) ||
  ['club','dagger','greatclub','handaxe','javelin','light hammer','mace','quarterstaff','sickle','spear','shortsword','scimitar'].includes(w.name.toLowerCase());
export function hitOptions(sid:string,ch:Character,at:Token,target:Token,w:Weapon,adv?:'adv'|'dis') {
  const victim=markedEntity(target.kind,target.refId), turn=turnKey(sid), s=getSessionById(sid);
  const wounded=!!victim && victim.curHp<victim.maxHp;
  const ally=listTokens(at.mapId).some(t=>t.id!==at.id&&t.id!==target.id &&
    (t.kind==='pc'||getMonster(t.refId)?.disposition==='friendly') &&
    (markedEntity(t.kind,t.refId)?.curHp??0)>0 &&
    !markedEntity(t.kind,t.refId)?.conditions.some(c=>/^(Incapacitated|Unconscious|Paralyzed|Stunned)$/i.test(c.label)) &&
    tokenDistanceFt(t,target,getMap(at.mapId))<=5);
  return ch.sheetAbilities.filter(ab=>{
    const key=hitFeature(ab); if(!key) return false;
    if(hitSpell(key)) return hitLevels(ch,ab).length>0 && (!s?.activeTurnTokenId||s.activeTurnTokenId===at.id) &&
      (!s?.activeTurnTokenId || !ch.sheetAbilities.some(a=>a.hitUsedTurn===`bonus:${turn}`)) && (key==='ensnaring strike'||w.kind==='melee');
    if(spent(ch,key,turn)) return false;
    if(key==='sneak attack') return (w.kind==='ranged'||(w.tags??[]).some(t=>t.toLowerCase()==='finesse')) && adv!=='dis' && (adv==='adv'||ally);
    if(key==='stunning strike') return monkWeapon(w) && ['Focus Points','Focus','Ki'].some(k=>ch.resources[k]?.used<ch.resources[k]?.max);
    if(key==='colossus slayer') return wounded;
    return !s?.activeTurnTokenId||s.activeTurnTokenId===at.id;
  });
}

function save(sid:string,target:Token,ab:string,dc:number,label:string,adv?:'adv') {
  const e=markedEntity(target.kind,target.refId)!;
  const labels=e.conditions.map(c=>c.label), extra=saveExtra(e,ab);
  const state=saveAdvantage(labels,ab,adv).state;
  const c={...e,stats:effectiveStats(e).scores,isMonster:target.kind==='monster',level:e.level??0};
  const out=rollSavingThrow(c,ab,dc,state,(e.saveProficiencies??[]).some(v=>v.toUpperCase()===ab));
  const total=out.total+extra.total, passed=!saveAutoFail(labels,ab)&&total>=dc;
  addRollLog(sid,{roller:e.name,label,expr:`${ab} save`,total,detail:`${e.name}: ${label} ${ab} save ${total} vs DC ${dc}: ${passed?'PASS':'FAIL'}`});
  return passed;
}
export function resolveHitFeature(sid:string,roller:string,rollId:string,abilityId:string,level?:number) {
  const entry=getRollEntry(rollId,sid), p=entry?.pending, offer=p?.hitOptions;
  const ch=p?.attacker.kind==='pc'?getCharacter(p.attacker.refId):null;
  const ab=ch?.sheetAbilities.find(a=>a.id===abilityId), key=ab&&hitFeature(ab);
  const target=offer&&getToken(offer.targetTokenId), attacker=offer&&getToken(offer.attackerTokenId);
  if(!p||p.done||!offer||!ch||!ab||!key||!target||!attacker||ch.sessionId!==sid||
    !offer.abilityIds.includes(abilityId)||offer.used.includes(key)||offer.turn!==turnKey(sid)) return {ok:false,reason:'That hit no longer offers this ability.'};
  const spell=hitSpell(key), w=ch.weapons[offer.weaponIndex], victim=markedEntity(target.kind,target.refId);
  if(!w||victim?.sessionId!==sid) return {ok:false,reason:'The target or weapon is no longer available.'};
  const turn=offer.turn;
  if(!spell&&spent(ch,key,turn)) return {ok:false,reason:'Already used this turn.'};
  if(spell && (!level||!hitLevels(ch,ab).includes(level)||(getSessionById(sid)?.activeTurnTokenId && ch.sheetAbilities.some(a=>a.hitUsedTurn===`bonus:${turn}`)))) return {ok:false,reason:'No available spell slot or bonus-action spell for this hit.'};
  const pool=['Focus Points','Focus','Ki'].find(k=>ch.resources[k]?.used<ch.resources[k]?.max);
  if(key==='stunning strike'&&!pool) return {ok:false,reason:'No Focus/Ki points remaining.'};
  // Claim first. All subsequent damage remains part of the original attack.
  setSheetAbility('pc',ch.id,{...ab,hitUsedTurn:spell?`bonus:${turn}`:turn,stance:ab.stance?{...ab.stance,active:false}:undefined});
  if(spell) spendSpellSlot(ch.id,level!);
  if(key==='stunning strike') setResource(ch.id,'resources',pool!,{used:ch.resources[pool!].used+1});
  const n=level??1;
  const expr=key==='sneak attack'?`${Math.ceil(ch.level/2)}d6`:key==='colossus slayer'?'1d8':key==='divine strike'?(ch.level>=14?'2d8':'1d8'):
    key==='searing smite'?`${n}d6`:key==='thunderous smite'?`${n+1}d6`:key==='wrathful smite'?`${n}d6`:undefined;
  const type=key==='searing smite'?'fire':key==='thunderous smite'?'thunder':key==='wrathful smite'?'necrotic':key==='divine strike'?(ab.roll?.damageType||'radiant'):w.damageType;
  const rolls=expr?Array.from({length:p.crit?2:1},()=>rollDice(expr)!):[];
  const raw=rolls.reduce((sum,r)=>sum+r.total,0);
  const sameType=type===w.damageType;
  const multiplier=sameType?offer.multiplier:damageMultiplier(type,victim.resistances,victim.weaknesses,victim.immunities,{magical:spell||key==='divine strike'||weaponIsMagical(w)});
  const added=sameType?Math.floor((offer.rawDamage+raw)*multiplier)-Math.floor(offer.rawDamage*multiplier):Math.floor(raw*multiplier);
  const dice=rolls.map((r,i)=>({label:`${ab.name}${i>0?' CRIT':''}`,value:r.total,faces:r.rolls,diceExpression:r.expr,critical:i>0}));
  const mods=added!==raw?[{label:`${ab.name} adjustment`,value:added-raw}]:[];
  setRollPending(rollId,{...p,hitOptions:{...offer,used:[...offer.used,key]},amount:p.amount+added,
    weapon:`${p.weapon} + ${ab.name}`,dice:[...p.dice,...dice],mods:[...p.mods,...mods],
    damageBreakdown:{dice:[...(p.damageBreakdown?.dice??p.dice),...dice],mods:[...(p.damageBreakdown?.mods??p.mods),...mods],mixedTypes:!sameType||p.damageBreakdown?.mixedTypes}});
  resolveAttackDamage(sid,roller,rollId);
  const dc=key==='stunning strike'?8+proficiencyBonus(ch.level)+abilityMod(effectiveStats(ch).scores.WIS??10):
    spellSaveDC(ch.level,effectiveStats(ch).scores,spellcastingKeyFor(ch,ab));
  const effect:NonNullable<Condition['combatEffect']>={casterKind:'pc',casterId:ch.id,spell:ab.name,dc,expiresAt:Date.now()+60000,expiresRound:(getSessionById(sid)?.combatRound??0)+10};
  const condition=(label:string,extra:Partial<NonNullable<Condition['combatEffect']>>={})=>setCondition(target.kind,target.refId,{id:newId(),label,aura:'red',isConcentration:false,combatEffect:{...effect,...extra}});
  if(key==='stunning strike') {
    const pass=save(sid,target,'CON',dc,ab.name);
    condition(pass?'Stunning Strike: Slowed':'Stunned',{untilCasterTurn:true,slow:pass,nextAttackAdvantage:pass});
  }
  if(key==='ensnaring strike') {
    setConcentration('pc',ch.id,ab.name);
    if(save(sid,target,'STR',dc,ab.name,target.widthFt>=10?'adv':undefined)) endConcentration('pc',ch.id,'target resisted');
    else condition('Restrained',{concentration:true,phase:'start',dice:`${n}d6`,damageType:'piercing'});
  }
  if(key==='searing smite') condition('Searing Smite: Burning',{phase:'start',dice:`${n}d6`,damageType:'fire',save:'CON'});
  if(key==='wrathful smite'&&!save(sid,target,'WIS',dc,ab.name)) condition('Frightened',{phase:'end',save:'WIS'});
  if(key==='thunderous smite'&&!save(sid,target,'STR',dc,ab.name)) {
    setCondition(target.kind,target.refId,{id:newId(),label:'Prone',aura:'red',isConcentration:false});
    const dx=target.x-attacker.x,dy=target.y-attacker.y,length=Math.max(Math.abs(dx),Math.abs(dy))||1;
    const map=getMap(target.mapId)!; const pixels=10*map.gridSizePx/map.feetPerSquare;
    moveToken(target.id,target.x+dx/length*pixels,target.y+dy/length*pixels);
  }
  addRollLog(sid,{roller,label:ab.name,expr:expr??'Save',total:added,detail:`${ch.name}: ${ab.name} on ${victim.name}${spell?` (level ${level})`:''}.`});
  return {ok:true};
}
export { save as hitEffectSave };
