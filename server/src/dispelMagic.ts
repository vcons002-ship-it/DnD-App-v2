import {rollD20Detail} from '../../shared/combatMath.js';
import type {AbilityRollPayload,Condition,TokenKind} from '../../shared/types.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import {effectiveStats} from '../../shared/modifiers.js';
import {spellcastingMod} from '../../shared/spellMath.js';
import {spellcastingKeyFor} from '../../shared/spellExecution.js';
import {checkAdvantage} from '../../shared/conditionEffects.js';
import {withDiceMetadata,usingPhysicalDice} from '../../shared/dice.js';
import {activeMarks} from './marks.js';
import {getSpell} from './spells/srd.js';
import {newId} from './db.js';
import {getCharacter,getMonster,getMap,getToken,getSessionById,listTokens,listCharacters,listMonsters,clearCondition,endConcentration,addRollLog,queueSpellImpact} from './sessions.js';

type Target=NonNullable<AbilityRollPayload['dispelTarget']>;
const entity=(kind:TokenKind,id:string)=>kind==='pc'?getCharacter(id):getMonster(id);
// Instantaneous spells can leave non-dispellable consequences, including
// acid or next-turn attack penalties. Do not turn Dispel into damage undo.
const instantaneous=new Set(['ray of frost','ray of sickness','chill touch','shocking grasp','guiding bolt',"melf's acid arrow",'ice knife']);
const subjects=(sid:string)=>[...listCharacters(sid).map(e=>({kind:'pc' as const,e})),...listMonsters(sid).map(e=>({kind:'monster' as const,e}))];
const excluded=(c:Condition)=>c.isConcentration||!!c.combatEffect?.parentConditionId||/^Reaction spent|^Haste lethargy/i.test(c.label);
const controlsElsewhere=(c:Condition)=>!!c.combatEffect?.spellAction&&!['vampiric touch','flame blade'].includes(c.combatEffect.spell.toLowerCase());

/** Validate mechanical range and sight before any slot is spent or reaction offered. */
export function dispelTargetError(sid:string,kind:TokenKind,id:string,target:Target|undefined):string|undefined {
 const mapId=getSessionById(sid)?.activeMapId,map=mapId&&getMap(mapId),actor=map&&listTokens(map.id).find(t=>t.kind===kind&&t.refId===id);
 if(!map||!actor||!target)return 'Choose a creature, object, or tracked magical area for Dispel Magic.';
 let point:{x:number;y:number}|undefined;
 if('tokenId'in target){const t=typeof target.tokenId==='string'?getToken(target.tokenId):null;if(t?.mapId===map.id)point=t;}
 else if(typeof target.effectId==='string'&&target.mapId===map.id){point=subjects(sid).flatMap(({e})=>e.conditions).find(c=>c.id===target.effectId&&c.isConcentration&&c.combatEffect?.spikeArea?.mapId===map.id)?.combatEffect?.spikeArea;}
 if(!point)return 'That Dispel Magic target is unavailable on this map.';
 if(tokenDistanceFt(actor,{...actor,...point},map)>120+1e-6||!hasLineOfSight(actor,point,map.walls))return 'Dispel Magic requires a visible target within 120 ft.';
}

type SpellGroup={name:string;level?:number;castId?:string;casterKind:TokenKind;casterId:string;conditions:{kind:TokenKind;id:string;c:Condition}[];area?:Condition;mark?:boolean};
function groupsOn(sid:string,target:Target):SpellGroup[]{
 const all=subjects(sid),groups=new Map<string,SpellGroup>();
 const add=(kind:TokenKind,id:string,c:Condition,area=false,mark=false)=>{
  const fx=c.combatEffect;if(!fx||!getSpell(fx.spell)||['wall of force','forcecage','antimagic field'].includes(fx.spell.toLowerCase())||instantaneous.has(fx.spell.toLowerCase()))return;
  const parent=all.flatMap(({e})=>e.conditions).find(v=>v.id===fx.castId||v.combatEffect?.castId===fx.castId&&v.isConcentration);
  const level=fx.castLevel??parent?.combatEffect?.castLevel,key=fx.castId??`${fx.casterKind}:${fx.casterId}:${fx.spell}`;
  const group=groups.get(key)??{name:fx.spell,level,castId:fx.castId,casterKind:fx.casterKind,casterId:fx.casterId,conditions:[]};
  if(area)group.area=c;else if(mark)group.mark=true;else group.conditions.push({kind,id,c});groups.set(key,group);
 };
 if('effectId'in target){for(const {kind,e} of all){const c=e.conditions.find(c=>c.id===target.effectId&&c.isConcentration&&c.combatEffect?.spikeArea);if(c)add(kind,e.id,c,true);}}
 else {
  const token=getToken(target.tokenId),e=token&&entity(token.kind,token.refId);if(!token||!e)return [];
  for(const c of e.conditions)if(!excluded(c)&&!controlsElsewhere(c))add(token.kind,e.id,c);
  // Repeat-action links (such as Witch Bolt) are stored on their owner but
  // affect the linked target, not the owner.
  for(const {kind,e:source} of all)for(const c of source.conditions)if(controlsElsewhere(c)&&c.combatEffect?.targetTokenId===token.id)add(kind,source.id,c);
  // A mark is attached to the marked creature even though its owner stores it.
  for(const {kind,e:caster} of all)for(const a of activeMarks(caster,token)){
   const c=caster.conditions.find(c=>c.isConcentration&&c.combatEffect?.spell.toLowerCase()===a.name.toLowerCase());if(c)add(kind,caster.id,c,false,true);
  }
 }
 return [...groups.values()];
}
function removeGroup(sid:string,g:SpellGroup){
 if(g.area||g.mark){endConcentration(g.casterKind,g.casterId,'Dispel Magic');return;}
 for(const {kind,id,c} of g.conditions){
  const fx=c.combatEffect!;
  // A Spiritual Weapon's controlling condition owns its summoned instance.
  const source=entity(fx.casterKind,fx.casterId)?.conditions.find(v=>v.combatEffect?.summonTokenId&&v.combatEffect?.castId===fx.castId);
  if(source)clearCondition(fx.casterKind,fx.casterId,source.id);else clearCondition(kind,id,c.id);
 }
 if(!g.castId)return;
 const remaining=subjects(sid).some(({e})=>e.conditions.some(c=>!excluded(c)&&!controlsElsewhere(c)&&c.combatEffect?.castId===g.castId));
 if(!remaining){
  const caster=entity(g.casterKind,g.casterId),conc=caster?.conditions.find(c=>c.isConcentration&&c.combatEffect?.castId===g.castId);
  if(conc)endConcentration(g.casterKind,g.casterId,'last affected target dispelled');
  for(const c of entity(g.casterKind,g.casterId)?.conditions??[])if(controlsElsewhere(c)&&c.combatEffect?.castId===g.castId)clearCondition(g.casterKind,g.casterId,c.id);
 }
}

/** One check per higher-level spell, never one check per bundled condition.
 * Concentration bookkeeping alone is not a spell affecting its caster. */
export function castDispelMagic(sid:string,roller:string,kind:TokenKind,id:string,abilityId:string,level:number,target:Target,manual?:'adv'|'dis'){
 const caster=entity(kind,id)!,ability=caster.sheetAbilities.find(a=>a.id===abilityId)!;
 const token='tokenId'in target?getToken(target.tokenId):null;
 const groups=groupsOn(sid,target),unknown=groups.filter(g=>g.level===undefined),known=groups.filter(g=>g.level!==undefined);
 const label=token?entity(token.kind,token.refId)?.name??'Target':'Spike Growth area';
 const area=groups.find(g=>g.area)?.area?.combatEffect?.spikeArea;
 const point=token??area;
 const flash=(rollId?:string)=>{if(point)queueSpellImpact(sid,token?.kind??kind,token?.refId??id,'Dispel Magic',rollId,undefined,area?{mapId:area.mapId,x:point.x,y:point.y,radiusFt:area.radiusFt}:undefined);};
 for(const g of known){
  let success=true,rollId:string|undefined;
  if(g.level!>level){
   const key=kind==='pc'?spellcastingKeyFor(getCharacter(id)!,ability):ability.roll?.castingAbility??(['INT','WIS','CHA'] as const).reduce((best,k)=>caster.stats[k]>caster.stats[best]?k:best,'INT');
   const mod=spellcastingMod(effectiveStats(caster).scores,key),adv=checkAdvantage(caster.conditions.map(c=>c.label),manual,[],caster.conditions.filter(c=>c.combatEffect?.checkDisadvantage).map(c=>c.combatEffect!.spell));
   const roll=withDiceMetadata({label:`Dispel Magic — ${key} Spellcasting Check`,target:token??undefined},()=>rollD20Detail(adv.state));
   const total=roll.face+mod,dc=10+g.level!;success=total>=dc;rollId=newId();
   addRollLog(sid,{roller,label:'Dispel Magic check',expr:`d20 + ${key}`,total,hideMods:kind==='monster',detail:`Dispel Magic → ${label}: ${g.name}, ${total} vs DC ${dc} — ${success?'dispelled':'remains'}.`,
    reveal:{kind:'check',title:`Dispel Magic — ${key} Spellcasting Check`,attacker:caster.name,target:label,d20:roll.face,attackTotal:total,toHit:[{label:`${key} spellcasting ability`,value:mod}],outcome:success?'pass':'fail',effectOutcome:success?`${g.name} dispelled!`:`${g.name} remains!`,presentedLive:usingPhysicalDice(),...(token?{visibilityTarget:{kind:token.kind,refId:token.refId}}:{})}},rollId);
  }else addRollLog(sid,{roller,label:'Dispel Magic',expr:'Spell ended',total:0,detail:`Dispel Magic → ${label}: ${g.name} ends automatically.`});
  if(success){removeGroup(sid,g);flash(rollId);}
 }
 if(!known.length)flash();
 if(!known.length||unknown.length)addRollLog(sid,{roller,label:'Dispel Magic',expr:'Effects checked',total:0,detail:unknown.length?`Dispel Magic → ${label}: ${unknown.length} legacy spell effect(s) have no recorded casting level; the DM must resolve those manually.`:`Dispel Magic → ${label}: no tracked ongoing spell to remove. Manual conditions and non-spell effects remain.`});
 return unknown.length?'Some older spell effects have no recorded casting level. The DM must resolve those manually.':undefined;
}
