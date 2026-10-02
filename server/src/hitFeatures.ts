import {materializeLiveDamage} from './combat.js';
import { abilityKey, hitFeature, hitSpell } from '../../shared/hitFeatures.js';
import type { Character, Token, Weapon, SheetAbility, Condition } from '../../shared/types.js';
import { tokenDistanceFt } from '../../shared/distance.js';
import { rollDice, rollDicePool, withDiceMetadata, usingPhysicalDice } from '../../shared/dice.js';
import { hasLineOfSight } from '../../shared/mapWalls.js';
import {rollSaveBatch} from './saveDiceBatch.js';
import { abilityMod, proficiencyBonus } from '../../shared/skills.js';
import { damageMultiplier, weaponIsMagical } from '../../shared/combatMath.js';
import { saveAdvantage, saveAutoFail } from '../../shared/conditionEffects.js';
import { effectiveStats, saveExtra } from '../../shared/modifiers.js';
import { spellSaveDC } from '../../shared/spellMath.js';
import { spellcastingKeyFor } from '../../shared/spellExecution.js';
import { classLevelFor } from '../../shared/multiclass.js';
import { spellSlotOptions, selectSpellSlot, type SpellSlotPool } from '../../shared/spellSlotPools.js';
import { newId } from './db.js';
import { markedEntity } from './marks.js';
import { getSessionById, getCharacter, getMonster, getMap, getToken, listTokens, getRollEntry,
  setRollPending, setSheetAbility, setResource, spendSpellSlot, setCondition, clearCondition,
  setConcentration, addRollLog, endConcentration, moveToken, queueSpellImpact } from './sessions.js';
import { resolveAttackDamage, applyDamageNoted, noteConcentration, stanceResistances, strFeatureAdv } from './combat.js';

export function turnKey(sid:string) {
  const s=getSessionById(sid);
  return `${s?.activeMapId}:${s?.combatRound}:${s?.activeTurnTokenId}`;
}
export function hitLevels(ch:Character, ab:SheetAbility) {
  return [...new Set(spellSlotOptions(ch,ab.level??1).filter(o=>o.remaining>0).map(o=>o.level))];
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
    if(hitSpell(key)&&victim&&'objectKind' in victim&&victim.objectKind)return false;
    if(hitSpell(key)) return hitLevels(ch,ab).length>0 && (!s?.activeTurnTokenId||s.activeTurnTokenId===at.id) &&
      (!s?.activeTurnTokenId || !ch.sheetAbilities.some(a=>a.hitUsedTurn===`bonus:${turn}`)) && (key==='hail of thorns'?w.kind==='ranged':key==='ensnaring strike'||w.kind==='melee');
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
  const state=saveAdvantage(labels,ab,adv,strFeatureAdv(target.kind,target.refId,ab)).state;
  const c={...e,stats:effectiveStats(e).scores,isMonster:target.kind==='monster',level:e.level??0};
  const killer=abilityKey({name:label})==='phantasmal killer';
  const ensnaring=abilityKey({name:label})==='ensnaring strike';
  const effectKey=abilityKey({name:label});
  const explain=(passed:boolean)=>ensnaring?(passed?'Resisted - no spell damage.':'Restrained - damage at the start of its turn.')
    : effectKey==='stunning strike'?(passed?'Not stunned - slowed until the caster\'s next turn.':'Stunned until the caster\'s next turn.')
    : effectKey==='thunderous smite'?(passed?'Push and knockdown resisted.':'Knocked prone and pushed 10 ft.')
    : effectKey==='wrathful smite'?(passed?'Fear resisted or ended.':'Frightened - the effect continues.')
    : effectKey==='searing smite'?(passed?'Flames end after this turn\'s damage.':'Flames continue burning.')
    : effectKey==='hold person'?(passed?'Hold Person ends - no longer Paralyzed.':'Hold Person continues - Paralyzed; save again at the end of the next turn.')
    : killer?(passed?'Phantasmal Killer ends - no damage.':'Phantasmal Killer continues - roll psychic damage.') : undefined;
  const [out]=rollSaveBatch([{target,c,ability:ab,dc,mode:state,proficient:(e.saveProficiencies??[]).some(v=>v.toUpperCase()===ab),extra:extra.total,autoFail:!!saveAutoFail(labels,ab),passEffect:explain(true),failEffect:explain(false)}],`${label} — ${killer?'End-of-turn ':''}${ab} Saving Throw`);
  const total=out.total+extra.total, passed=!saveAutoFail(labels,ab)&&total>=dc;
  const explanation=explain(passed);
  addRollLog(sid,{roller:e.name,label,expr:`${ab} save`,total,detail:`${e.name}: ${label} ${ab} save ${total} vs DC ${dc}: ${passed?'PASS':'FAIL'}${explanation?`. ${explanation}`:''}`,
    reveal:{kind:'check',presentedLive:usingPhysicalDice(),title:`${label} - ${ab} Saving Throw`,attacker:e.name,d20:out.face,attackTotal:total,
      toHit:[{label:`${ab} save modifiers`,value:total-out.face}],outcome:passed?'pass':'fail',effectOutcome:explanation,
      visibilityTarget:{kind:target.kind,refId:target.refId}}});
  return passed;
}
export function resolveHitFeature(sid:string,roller:string,rollId:string,abilityId:string,level?:number,slotPool?:SpellSlotPool) {
  const entry=getRollEntry(rollId,sid), p=entry?.pending, offer=p?.hitOptions;
  const ch=p?.attacker.kind==='pc'?getCharacter(p.attacker.refId):null;
  const ab=ch?.sheetAbilities.find(a=>a.id===abilityId), key=ab&&hitFeature(ab);
  const target=offer&&getToken(offer.targetTokenId), attacker=offer&&getToken(offer.attackerTokenId);
  if(!p||p.done||!offer||!ch||!ab||!key||!target||!attacker||ch.sessionId!==sid||
    !offer.abilityIds.includes(abilityId)||offer.used.includes(key)||offer.turn!==turnKey(sid)) return {ok:false,reason:'That hit no longer offers this ability.'};
  const spell=hitSpell(key), w=ch.weapons[offer.weaponIndex], victim=markedEntity(target.kind,target.refId);
  if(!w||victim?.sessionId!==sid) return {ok:false,reason:'The target or weapon is no longer available.'};
  const turn=offer.turn;
  const slot=spell ? selectSpellSlot(ch,level??ab.level??1,slotPool) : undefined;
  if(spell && (!slot || slot.remaining<=0)) return {ok:false,reason:'No available spell slot in that pool.'};
  if(slot) { level=slot.level; slotPool=slot.pool; }
  if(!spell&&spent(ch,key,turn)) return {ok:false,reason:'Already used this turn.'};
  if(spell && (!level||!hitLevels(ch,ab).includes(level)||(getSessionById(sid)?.activeTurnTokenId && ch.sheetAbilities.some(a=>a.hitUsedTurn===`bonus:${turn}`)))) return {ok:false,reason:'No available spell slot or bonus-action spell for this hit.'};
  const pool=['Focus Points','Focus','Ki'].find(k=>ch.resources[k]?.used<ch.resources[k]?.max);
  if(key==='stunning strike'&&!pool) return {ok:false,reason:'No Focus/Ki points remaining.'};
  if(p.live){materializeLiveDamage(sid,rollId);return resolveHitFeature(sid,roller,rollId,abilityId,level,slotPool);}
  // Claim the optional feature before spending its resource or resolving damage.
  setSheetAbility('pc',ch.id,{...ab,hitUsedTurn:spell?`bonus:${turn}`:turn,stance:ab.stance?{...ab.stance,active:false}:undefined});
  if(spell) spendSpellSlot(ch.id,level!,slotPool);
  if(key==='stunning strike') setResource(ch.id,'resources',pool!,{used:ch.resources[pool!].used+1});
  const n=level??1;
  if(key==='hail of thorns') {
    const map=getMap(target.mapId)!;
    const dc=spellSaveDC(ch.level,effectiveStats(ch).scores,spellcastingKeyFor(ch,ab));
    const seen=new Set<string>();
    const targets=listTokens(target.mapId).filter(t=>{
      const entity=markedEntity(t.kind,t.refId),id=`${t.kind}:${t.refId}`;
      if(!entity||('objectKind' in entity&&entity.objectKind)||seen.has(id)||
        tokenDistanceFt(t,target,map)>5+1e-6||!hasLineOfSight(target,t,map.walls))return false;
      seen.add(id);return true;
    });
    // Show the shared damage first, then all target saves in one labeled throw.
    const damage=withDiceMetadata({label:'Hail of Thorns — Piercing Damage'},()=>rollDice(`${n}d10`))!,impactId=newId();
    const requests=targets.map(t=>{
      const entity=markedEntity(t.kind,t.refId)!,labels=entity.conditions.map(c=>c.label);
      return {target:t,c:{...entity,stats:effectiveStats(entity).scores,isMonster:t.kind==='monster',level:entity.level??0},ability:'DEX',dc,
        mode:saveAdvantage(labels,'DEX').state,proficient:(entity.saveProficiencies??[]).some(v=>v.toUpperCase()==='DEX'),extra:saveExtra(entity,'DEX').total,autoFail:!!saveAutoFail(labels,'DEX')};
    });
    const outcomes=rollSaveBatch(requests,`${ab.name} — DEX Saving Throws`);
    const saves=requests.map((r,i)=>({t:r.target,entity:markedEntity(r.target.kind,r.target.refId)!,out:outcomes[i],total:outcomes[i].total+r.extra,passed:!r.autoFail&&outcomes[i].total+r.extra>=dc}));
    // The weapon and burst are distinct damage sources, but their map effects
    // wait for the final burst roll to finish (or be skipped).
    resolveAttackDamage(sid,roller,rollId,impactId);
    for(const {t,entity,total,out,passed} of saves){
      const multiplier=damageMultiplier('piercing',[...entity.resistances,...stanceResistances(t.kind,t.refId)],entity.weaknesses,entity.immunities,{magical:true});
      const amount=Math.floor(Math.floor(damage.total*(passed?.5:1))*multiplier);
      const hpNote=applyDamageNoted(t.kind,t.refId,amount,'piercing',attacker,false,impactId);
      noteConcentration(sid,t.kind,t.refId,amount);
      addRollLog(sid,{roller:entity.name,label:'Hail of Thorns: DEX save',expr:'DEX save',total,hpNote,
        hideMods:t.kind==='monster'&&getMonster(t.refId)?.disposition!=='friendly',
        detail:`${entity.name}: DEX save ${total} vs DC ${dc}: ${passed?'PASS (half damage)':'FAIL'}; ${amount} piercing damage.`,
        reveal:{presentedLive:usingPhysicalDice(),kind:'check',attacker:entity.name,target:entity.name,title:'Hail of Thorns: DEX save',effectOutcome:`${amount} piercing damage${passed?' (save for half)':''}.`,outcome:passed?'pass':'fail',d20:out.face,attackTotal:total,
          toHit:[{label:'DEX save modifiers',value:total-out.face}],visibilityTarget:{kind:t.kind,refId:t.refId}}});
    }
    queueSpellImpact(sid,target.kind,target.refId,'Hail of Thorns',impactId,Math.max(map.feetPerSquare,target.widthFt)+10);
    addRollLog(sid,{roller,label:'Hail of Thorns',expr:damage.expr,total:damage.total,
      detail:`${ch.name}: Hail of Thorns (${damage.expr}) → ${victim.name} and creatures within 5 ft. ${damage.detail}. DEX save for half.`,
      reveal:{presentedLive:usingPhysicalDice(),kind:'damage',attacker:roller,target:`${victim.name} · 5 ft burst`,outcome:'none',damage:damage.total,damageType:'piercing',
        damageDice:[{label:'Hail of Thorns',value:damage.total,faces:damage.rolls,diceExpression:damage.expr}]}},impactId);
    return {ok:true};
  }
  const expr=key==='sneak attack'?`${Math.ceil(classLevelFor(ch,'rogue')/2)}d6`:key==='colossus slayer'?'1d8':key==='divine strike'?(classLevelFor(ch,'cleric')>=14?'2d8':'1d8'):
    key==='searing smite'?`${n}d6`:key==='thunderous smite'?`${n+1}d6`:key==='wrathful smite'?`${n}d6`:undefined;
  const type=key==='searing smite'?'fire':key==='thunderous smite'?'thunder':key==='wrathful smite'?'necrotic':key==='divine strike'?(ab.roll?.damageType||'radiant'):w.damageType;
  const rolls=expr?rollDicePool(Array.from({length:p.crit?2:1},(_,i)=>({expr,critical:i>0}))).filter((r):r is NonNullable<typeof r>=>r!==null):[];
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
