import {effectiveSheetAbility} from '../../shared/spellExecution.js';
import type {SheetAbility} from '../../shared/types.js';
import {describe,it,expect} from 'vitest';
import {withDiceSource,type PhysicalDiceInfo} from '../../shared/dice.js';
import {rollSavingThrow} from '../../shared/combatMath.js';
import {rollSaveBatch} from './saveDiceBatch.js';
import {shapeSaveFrame} from './liveSaveFrame.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import {createSession,createCharacter,createMap,setActiveMap,createToken,setResource,applyDamage,listRollLog,drainHpFx,getCharacter,addRollLog,endConcentration,setConcentration,setActiveTurn,setCombatRound} from './sessions.js';
import {resolveAbilityRoll,resolveForcedSave} from './combat.js';
import {getSpell} from './spells/srd.js';

describe('save and healing presentation',()=>{
 it('restores the summon action for saved Mage Hand spells without changing other spells',()=>{
 const spell:SheetAbility={id:'hand',name:'Mage Hand',type:'spell',level:0,description:''};
 expect(effectiveSheetAbility(spell).summon?.name).toBe('Mage Hand');
 expect(spell.summon).toBeUndefined();
 expect(effectiveSheetAbility({...spell,name:'Fireball'}).summon).toBeUndefined();
 });
 it('targets Haste and removes only the linked buff when concentration ends, including across maps',()=>{
   const s=createSession('Haste'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);
   const caster=createCharacter(s.id,{name:'Vanec',maxHp:40}),ally=createCharacter(s.id,{name:'Druk',maxHp:50});
   const self=createToken({mapId:map.id,kind:'pc',refId:caster.id,x:100,y:100});
   const target=createToken({mapId:map.id,kind:'pc',refId:ally.id,x:150,y:100});
   const spell:SheetAbility={id:'haste',name:'Haste',type:'spell',level:3,description:'Saved spell'};
   expect(effectiveSheetAbility(spell).roll?.targetMode).toBe('single');
   expect(resolveAbilityRoll(s.id,'Vanec',caster,spell,3)).toBe(false);
   expect(getCharacter(caster.id)!.conditions).toHaveLength(0);
   withDiceSource(()=>{throw new Error('Haste should not roll dice');},()=>expect(resolveAbilityRoll(s.id,'Vanec',caster,spell,3,undefined,target.id)).toBe(true));
   expect(getCharacter(ally.id)!.conditions).toEqual(expect.arrayContaining([expect.objectContaining({label:'Haste',aura:'green',isConcentration:false})]));
   expect(getCharacter(caster.id)!.conditions.some(c=>c.isConcentration)).toBe(true);
   resolveAbilityRoll(s.id,'Vanec',getCharacter(caster.id)!,spell,3,undefined,self.id);
   expect(getCharacter(ally.id)!.conditions.some(c=>c.label==='Haste')).toBe(false);
   expect(getCharacter(caster.id)!.conditions.some(c=>c.label==='Haste')).toBe(true);
   setConcentration('pc',caster.id,'Hold Person');
   expect(getCharacter(caster.id)!.conditions.some(c=>c.label==='Haste')).toBe(false);
   expect(resolveAbilityRoll(s.id,'Vanec',getCharacter(caster.id)!,spell,3,undefined,target.id)).toBe(false);
   expect(getCharacter(ally.id)!.conditions.some(c=>c.label==='Haste')).toBe(false);
   // Self-Haste ending causes lethargy; recover through the caster's next turn
   // before attempting a new concentration spell.
   setCombatRound(s.id,1);setActiveTurn(s.id,self.id);setActiveTurn(s.id,target.id);
   expect(resolveAbilityRoll(s.id,'Vanec',getCharacter(caster.id)!,spell,3,undefined,target.id)).toBe(true);
   const elsewhere=createMap(s.id,{name:'Elsewhere'});setActiveMap(s.id,elsewhere.id);
   endConcentration('pc',caster.id,'ended');
   expect(getCharacter(ally.id)!.conditions.some(c=>c.label==='Haste')).toBe(false);
 });

 it('explains both outcomes of a control spell without mislabeling damaging spells',()=>{
   const s=createSession('Spell outcomes'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);
   const c=createCharacter(s.id,{name:'Target',maxHp:50,stats:{WIS:10}});
   const target=createToken({mapId:map.id,kind:'pc',refId:c.id,x:100,y:100});
   for(const [face,amount,expected] of [[2,0,'Hold Person successful!'],[19,0,'Hold Person resisted!'],[19,10,'Save passed - 5  damage (save for half).']] as const){
     const source=addRollLog(s.id,{roller:'Caster',label:'Hold Person',expr:'Hold Person',total:amount,detail:'Cast',apply:{amount,dc:12,save:'WIS'}});
     withDiceSource(sides=>sides.map(()=>face),()=>resolveForcedSave(s.id,source.id,target.id));
     const reveal=listRollLog(s.id).at(-1)!.reveal!;
     expect(reveal.effectOutcome).toBe(expected);
     expect(reveal.outcome).toBe(face===2?'fail':'pass');
     expect(reveal.title).toContain('Hold Person');expect(reveal.title).toContain('WIS Saving Throw');
   }
 });

 it('identifies saves by ability and batches mixed advantage correctly',()=>{
   const c={stats:{DEX:14},level:5,isMonster:false};const seen:{sides:number[];info:PhysicalDiceInfo}[]=[];
   withDiceSource((sides,info)=>{seen.push({sides,info});return [12];},()=>rollSavingThrow(c,'DEX',14));
   expect(seen[0].info.label).toBe('DEX Saving Throw');seen.length=0;
   const request={target:{kind:'monster' as const,refId:'one'},c,ability:'DEX',dc:14,proficient:false,extra:1,autoFail:false};
   const rolls=withDiceSource((sides,info)=>{seen.push({sides,info});return [3,17,4,18];},()=>rollSaveBatch([{...request,mode:'adv'},{...request,target:{kind:'monster',refId:'two'},mode:'dis'}],'Hail of Thorns — DEX Saving Throws'));
   expect(seen).toHaveLength(1);expect(seen[0].sides).toEqual([20,20,20,20]);expect(rolls.map(r=>r.face)).toEqual([17,4]);
   const frame:LiveDiceFrame={id:'save',seq:0,label:seen[0].info.label!,roller:'Varis',className:'Ranger',sides:[20,20,20,20],radius:1,poses:Array.from({length:28},(_,i)=>i),values:[3,17,4,18],rerolls:[0,0,0,0],sets:[0,0,0,0],critical:[false,false,false,false],percentile:[null,null,null,null],elapsed:5,done:true};
   const filtered=shapeSaveFrame(frame,seen[0].info.saveDice!,t=>t.refId==='two'?'G1':undefined)!;
   expect(filtered.sides).toEqual([20,20]);expect(filtered.values).toEqual([4,18]);expect(filtered.poses).toEqual(frame.poses.slice(14));
   expect(filtered.saveDice?.map(d=>d.label)).toEqual(['G1','G1']);expect(filtered.saveDice?.map(d=>d.group)).toEqual(['0','0']);
   expect(JSON.stringify(filtered)).not.toContain('refId');expect(filtered.dieOffset).toBeUndefined();
   expect(shapeSaveFrame(frame,seen[0].info.saveDice!,()=>undefined)).toBeNull();
 });
 it('includes Wisdom as an animated healing bonus and links HP effects to that reveal',()=>{
   const s=createSession('Healing'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);
   const c=createCharacter(s.id,{name:'Varis',className:'Ranger',level:6,maxHp:50,stats:{WIS:12}});
   const target=createToken({mapId:map.id,kind:'pc',refId:c.id,x:100,y:100});applyDamage('pc',c.id,30);drainHpFx(s.id);
   setResource(c.id,'spellSlots','L1',{max:3,used:0});const spell={...getSpell('Cure Wounds')!,id:'cure'};
   withDiceSource(sides=>sides.map(()=>4),()=>expect(resolveAbilityRoll(s.id,'Varis',getCharacter(c.id)!,spell,1,undefined,target.id)).toBe(true));
   const log=listRollLog(s.id).at(-1)!;
   expect(log.reveal?.damageMods).toContainEqual({label:'WIS modifier',value:1});expect(log.reveal?.target).toBe('Varis');
   expect(log.reveal!.damage).toBe(log.reveal!.damageDice!.reduce((n,d)=>n+d.value,0)+1);
   expect(log.detail).toContain('WIS modifier');expect(drainHpFx(s.id)[0].rollId).toBe(log.id);
 });
});
