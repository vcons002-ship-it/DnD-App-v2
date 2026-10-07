import {describe,it,expect} from 'vitest';
import {withDiceSource} from '../../shared/dice.js';
import {getSpell} from './spells/srd.js';
import {castDispelMagic,dispelTargetError} from './dispelMagic.js';
import {castInvisibility,castSpikeGrowth} from './advancedSpells.js';
import {resolveAbilityRoll} from './combat.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,getCharacter,setSheetAbility,setCondition,listRollLog,setManualDamage,createSummon,getToken,getMonster} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import type {SheetAbility} from '../../shared/types.js';
function fixture(){
 const s=createSession('Dispel regression'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);setManualDamage(s.id,false);
 const c=createCharacter(s.id,{name:'Vanec',className:'Sorcerer',level:8,maxHp:50,curHp:50,stats:{CHA:18},spellSlots:{L3:{max:3,used:0},L4:{max:3,used:0}}});
 const ally=createCharacter(s.id,{name:'Druk',maxHp:50,curHp:50}),other=createCharacter(s.id,{name:'Varis',maxHp:50,curHp:50});
 const actor=createToken({mapId:map.id,kind:'pc',refId:c.id,x:100,y:100}),target=createToken({mapId:map.id,kind:'pc',refId:ally.id,x:130,y:100}),third=createToken({mapId:map.id,kind:'pc',refId:other.id,x:100,y:130});
 const spells=['Dispel Magic','Haste','Spike Growth'].map(name=>({...getSpell(name)!,id:name}) as SheetAbility);spells.forEach(a=>setSheetAbility('pc',c.id,a));
 const dispel=(level=3,tokenId=target.id,face=10)=>withDiceSource(sides=>sides.map(()=>face),()=>castDispelMagic(s.id,'Vanec','pc',c.id,'Dispel Magic',level,{tokenId}));
 return {s,map,c,ally,actor,target,third,other,dispel,now:()=>getCharacter(ally.id)!};
}
describe('2024 Dispel Magic',()=>{
 it('removes Haste and its modifiers, applies lethargy and cleans up the last target concentration',()=>{
  const f=fixture();resolveAbilityRoll(f.s.id,'Vanec',getCharacter(f.c.id)!,getCharacter(f.c.id)!.sheetAbilities.find(a=>a.name==='Haste')!,3,undefined,f.target.id);
  expect(f.now().conditions.some(c=>c.label==='Haste')).toBe(true);f.dispel();
  expect(f.now().conditions.some(c=>c.label==='Haste')).toBe(false);expect(f.now().conditions.some(c=>c.label==='Haste lethargy')).toBe(true);
  expect(getCharacter(f.c.id)!.conditions.some(c=>c.isConcentration)).toBe(false);
  expect(listRollLog(f.s.id).some(r=>r.label==='Dispel Magic check')).toBe(false);
 });
 it('uses the actual upcast level, an ability check without proficiency, and preserves a failed effect',()=>{
  const f=fixture();castInvisibility(f.s.id,'Vanec','pc',f.c.id,5,[f.target.id]);f.dispel(3,f.target.id,10);
  expect(f.now().conditions.some(c=>c.label==='Invisible')).toBe(true);
  let r=listRollLog(f.s.id).reverse().find(r=>r.label==='Dispel Magic check')!;expect(r.total).toBe(14);expect(r.reveal?.outcome).toBe('fail');expect(r.reveal?.toHit).toEqual([{label:'CHA spellcasting ability',value:4}]);
  f.dispel(3,f.target.id,11);expect(f.now().conditions.some(c=>c.label==='Invisible')).toBe(false);
  r=listRollLog(f.s.id).reverse().find(r=>r.label==='Dispel Magic check')!;expect(r.reveal?.outcome).toBe('pass');expect(r.reveal?.title).toContain('Spellcasting Check');
 });
 it('automatically ends spells up to the dispel slot level and retains other recipients',()=>{
  const f=fixture();castInvisibility(f.s.id,'Vanec','pc',f.c.id,5,[f.target.id,f.third.id]);f.dispel(5);
  expect(f.now().conditions.some(c=>c.label==='Invisible')).toBe(false);expect(getCharacter(f.other.id)!.conditions.some(c=>c.label==='Invisible')).toBe(true);
  expect(getCharacter(f.c.id)!.conditions.some(c=>c.isConcentration)).toBe(true);expect(listRollLog(f.s.id).some(r=>r.label==='Dispel Magic check')).toBe(false);
 });
 it('does not dispel a spell elsewhere merely by targeting its concentrating caster',()=>{
  const f=fixture();castInvisibility(f.s.id,'Vanec','pc',f.c.id,2,[f.target.id]);f.dispel(3,f.actor.id);
  expect(f.now().conditions.some(c=>c.label==='Invisible')).toBe(true);expect(getCharacter(f.c.id)!.conditions.some(c=>c.isConcentration)).toBe(true);
 });
 it('can target the magical terrain itself; removing it ends the whole area',()=>{
  const f=fixture();castSpikeGrowth(f.s.id,'Vanec','pc',f.c.id,{...getSpell('Spike Growth')!,id:'Spike Growth'},{mapId:f.map.id,points:[{x:300,y:100}],angle:0});
  const area=buildSnapshot(f.s.id,'dm')!.measurements.find(m=>m.spellName==='Spike Growth')!;
  expect(dispelTargetError(f.s.id,'pc',f.c.id,{effectId:area.id,mapId:f.map.id})).toBeUndefined();
  castDispelMagic(f.s.id,'Vanec','pc',f.c.id,'Dispel Magic',3,{effectId:area.id,mapId:f.map.id});
  expect(buildSnapshot(f.s.id,'dm')!.measurements).toHaveLength(0);
 });
 it('leaves manual conditions, unknown legacy levels and non-spell features untouched',()=>{
  const f=fixture();setCondition('pc',f.ally.id,{id:'manual',label:'Invisible',aura:'blue',isConcentration:false});
  setCondition('pc',f.ally.id,{id:'legacy',label:'Shield',aura:'blue',isConcentration:false,combatEffect:{casterKind:'pc',casterId:f.c.id,spell:'Shield'}});
  setCondition('pc',f.ally.id,{id:'feature',label:'Rage',aura:'blue',isConcentration:false,combatEffect:{casterKind:'pc',casterId:f.c.id,spell:'Rage',castLevel:1}});
  expect(f.dispel()).toContain('older spell');expect(f.now().conditions).toHaveLength(3);
 });
 it('deletes a provenance-tracked summon and its token without touching ordinary creatures',()=>{
  const f=fixture(),summon=createSummon(f.s.id,f.map.id,200,100,'Mage Hand','✋');
  setCondition('monster',summon.refId,{id:'summoned',label:'Mage Hand',aura:'blue',isConcentration:false,combatEffect:{casterKind:'pc',casterId:f.c.id,spell:'Mage Hand',castId:'hand',castLevel:0,summoned:true}});
  f.dispel(3,summon.id);expect(getToken(summon.id)).toBeNull();expect(getMonster(summon.refId)).toBeNull();expect(getCharacter(f.ally.id)).not.toBeNull();
 });
 it('does not undo instantaneous-spell consequences or dispel explicit exceptions',()=>{
  const f=fixture();for(const name of ["Melf's Acid Arrow",'Ray of Frost','Wall of Force'])setCondition('pc',f.ally.id,{id:name,label:name,aura:'red',isConcentration:false,combatEffect:{casterKind:'pc',casterId:f.c.id,spell:name,castLevel:5}});
  f.dispel(9);expect(f.now().conditions).toHaveLength(3);
 });
 it('rejects remote, cross-map and non-existent targets before casting',()=>{
  const f=fixture(),remote=createToken({mapId:f.map.id,kind:'pc',refId:f.other.id,x:2000,y:100});
  expect(dispelTargetError(f.s.id,'pc',f.c.id,{tokenId:remote.id})).toContain('120 ft');
  expect(dispelTargetError(f.s.id,'pc',f.c.id,{effectId:'missing',mapId:f.map.id})).toContain('unavailable');
 });
});
