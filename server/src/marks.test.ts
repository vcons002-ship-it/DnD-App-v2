import { flattenDamageDice } from '../../shared/diceVisuals.js';
import { migrateActiveMarks } from './db.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSession, createMap, setActiveMap, createCharacter, createToken, setSheetAbility, getCharacter, applyDamage, setConcentration, clearCondition, setManualDamage, listRollLog } from './sessions.js';
import { castMark, markedDamage } from './marks.js';
import { resolveAttack, resolveAbilityRoll, resolveAttackDamage } from './combat.js';
import { effectiveSheetAbility } from '../../shared/spellExecution.js';
import type { SheetAbility } from '../../shared/types.js';
afterEach(()=>vi.restoreAllMocks());
function setup(manual=false) {
 const s=createSession('Marks'); const map=createMap(s.id,{name:'Field'}); setActiveMap(s.id,map.id); setManualDamage(s.id,manual);
 const c=createCharacter(s.id,{name:'Ranger',className:'Ranger',level:5,maxHp:50,stats:{DEX:16,WIS:16},weapons:[{name:'Bow',kind:'ranged',damage:'1d8',damageType:'piercing',attackBonus:50}]});
 const target=createCharacter(s.id,{name:'Target',maxHp:100,armorClass:1,resistances:['piercing']});
 const second=createCharacter(s.id,{name:'Second',maxHp:100,armorClass:1});
 const at=createToken({mapId:map.id,kind:'pc',refId:c.id,x:100,y:100});
 const tt=createToken({mapId:map.id,kind:'pc',refId:target.id,x:200,y:100});
 const nt=createToken({mapId:map.id,kind:'pc',refId:second.id,x:250,y:100});
 const hm:SheetAbility={id:'hm',name:"Hunter's Mark",type:'spell',level:1,description:'Old saved damage text',roll:{kind:'damage',dice:'1d6'},tags:['concentration']};
 setSheetAbility('pc',c.id,hm);
 return {s,c,target,second,at,tt,nt,hm};
}
describe('2024 marked attack workflow',()=>{
 it('upgrades active saved stance targets once without spending slots or resetting concentration',()=>{
 const f=setup();
 setSheetAbility('pc',f.c.id,{...f.hm,type:'stance',stance:{active:true,targeted:true,targetId:f.tt.id,bonusDamage:'1d6',appliesTo:'all'}});
 setConcentration('pc',f.c.id,"Hunter's Mark"); const before=getCharacter(f.c.id)!;
 migrateActiveMarks(); const once=getCharacter(f.c.id)!;
 expect(once.sheetAbilities[0].mark?.refId).toBe(f.target.id);
 expect(once.spellSlots).toEqual(before.spellSlots); expect(once.conditions).toEqual(before.conditions);
 migrateActiveMarks(); expect(getCharacter(f.c.id)!.sheetAbilities).toEqual(once.sheetAbilities);
 expect(markedDamage('pc',f.c.id,f.tt,false).amount).toBeGreaterThan(0);
 clearCondition('pc',f.c.id,once.conditions.find(c=>c.isConcentration)!.id);
 expect(getCharacter(f.c.id)!.sheetAbilities[0].mark!.active).toBe(false);
 });
 it('recognizes saved spell and stance entries without rewriting custom/manual spells',()=>{
 const {hm}=setup(); expect(effectiveSheetAbility(hm).roll?.dice).toBe('0');
 expect(effectiveSheetAbility({...hm,type:'stance',roll:undefined}).roll?.targetMode).toBe('single');
 expect(effectiveSheetAbility({...hm,source:'custom'}).roll?.dice).toBe('1d6');
 expect(effectiveSheetAbility({...hm,executionProfile:'manual'}).roll?.dice).toBe('1d6');
 });
 it('marks without damage, adds Force only to that target, and doubles mark dice on crits',()=>{
 const f=setup(); vi.spyOn(Math,'random').mockReturnValue(.5);
 expect(castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,1)).toBe(true);
 expect(getCharacter(f.target.id)!.curHp).toBe(100);
 expect(markedDamage('pc',f.c.id,f.tt,false).amount).toBe(4);
 expect(markedDamage('pc',f.c.id,f.tt,true).amount).toBe(8);
 expect(markedDamage('pc',f.c.id,f.nt,false).amount).toBe(0);
 });
 it.each([false,true])('combines weapon and mark into one damage application (manual=%s)',manual=>{
 const f=setup(manual); vi.spyOn(Math,'random').mockReturnValue(.5);
 castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,1);
 expect(resolveAttack(f.s.id,'Ranger',f.at.id,f.tt.id,0)).toBe(true);
 const hit=listRollLog(f.s.id).slice().reverse().find(r=>r.reveal?.kind==='attack')!;
 if(manual) {expect(getCharacter(f.target.id)!.curHp).toBe(100); resolveAttackDamage(f.s.id,'Ranger',hit.id);}
 const damage=listRollLog(f.s.id).slice().reverse().find(r=>r.reveal?.damageDice?.some(d=>d.label.includes("Hunter's Mark")))!;
 expect(damage).toBeTruthy();
 expect(flattenDamageDice(damage.reveal!.damageDice).map(d=>d.sides)).toEqual([8,6]);
 expect([...(damage.reveal!.damageDice??[]),...(damage.reveal!.damageMods??[])].reduce((sum,d)=>sum+d.value,0)).toBe(damage.reveal!.damage);
 expect(damage.reveal!.damageDice!.find(d=>d.label.includes("Hunter's Mark"))!.faces).toHaveLength(1);
 expect(getCharacter(f.target.id)!.curHp).toBe(100-damage.reveal!.damage!);
 });
 it('includes Force on spell attack hits and crits',()=>{
 const f=setup(); vi.spyOn(Math,'random').mockReturnValue(.999);
 castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,1);
 const bolt:SheetAbility={id:'bolt',name:'Test ray',type:'spell',level:0,description:'',source:'custom',roll:{kind:'attack',dice:'1d8',damageType:'fire'}};
 expect(resolveAbilityRoll(f.s.id,'Ranger',getCharacter(f.c.id)!,bolt,0,undefined,f.tt.id)).toBe(true);
 const roll=listRollLog(f.s.id).slice().reverse().find(r=>r.reveal?.kind==='attack')!;
 expect(roll.reveal!.outcome).toBe('crit');
 expect(flattenDamageDice(roll.reveal!.damageDice).map(d=>d.sides)).toEqual([8,8,6,6]);
 expect(flattenDamageDice(roll.reveal!.damageDice).map(d=>d.crit)).toEqual([false,true,false,true]);
 });
 it('transfers only after defeat, preserves expiry and slots, and uses the new target',()=>{
 const f=setup(); castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,3);
 const ability=()=>getCharacter(f.c.id)!.sheetAbilities[0]; const before=ability().mark!; const slots=getCharacter(f.c.id)!.spellSlots;
 expect(castMark(f.s.id,'pc',f.c.id,ability(),f.nt.id,1,true)).toBe(false);
 applyDamage('pc',f.target.id,100);
 expect(castMark(f.s.id,'pc',f.c.id,ability(),f.tt.id,1,true)).toBe(false);
 expect(castMark(f.s.id,'pc',f.c.id,ability(),f.nt.id,1,true)).toBe(true);
 expect(ability().mark!.expiresAt).toBe(before.expiresAt);
 expect(getCharacter(f.c.id)!.spellSlots).toEqual(slots);
 expect(markedDamage('pc',f.c.id,f.tt,false).amount).toBe(0);
 expect(markedDamage('pc',f.c.id,f.nt,false).amount).toBeGreaterThan(0);
 });
 it('ends the mark on concentration replacement and manual concentration removal',()=>{
 const f=setup(); castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,1);
 setConcentration('pc',f.c.id,'Bless'); expect(markedDamage('pc',f.c.id,f.tt,false).amount).toBe(0);
 castMark(f.s.id,'pc',f.c.id,f.hm,f.tt.id,1);
 const cond=getCharacter(f.c.id)!.conditions.find(c=>c.isConcentration)!;
 clearCondition('pc',f.c.id,cond.id); expect(getCharacter(f.c.id)!.sheetAbilities[0].mark!.active).toBe(false);
 });
 it('rejects out-of-range targets without replacing concentration',()=>{
 const f=setup(); const far=createToken({mapId:f.tt.mapId,kind:'pc',refId:f.second.id,x:5000,y:100});
 setConcentration('pc',f.c.id,'Bless'); expect(castMark(f.s.id,'pc',f.c.id,f.hm,far.id,1)).toBe(false);
 expect(getCharacter(f.c.id)!.conditions.some(c=>c.label.includes('Bless'))).toBe(true);
 });
});
