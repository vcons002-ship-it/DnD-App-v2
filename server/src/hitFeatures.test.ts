import {describe,it,expect,vi,afterEach} from 'vitest';
import {createSession,createMap,setActiveMap,createCharacter,createMonsterTemplate,instantiateMonster,createToken,setSheetAbility,setResource,getCharacter,getMonster,setManualDamage,setActiveTurn,setCombatRound,listRollLog,applyDamage,setConcentration} from './sessions.js';
import {resolveAttack,resolveAttackDamage} from './combat.js';
import {resolveHitFeature,hitOptions} from './hitFeatures.js';
import {processHitEffects,expireOnCasterTurn,consumeHitAdvantage} from './hitEffectTurns.js';
import type {SheetAbility} from '../../shared/types.js';
afterEach(()=>vi.restoreAllMocks());
function fixture(name:string,combat=true) {
 const s=createSession('Hit options'), map=createMap(s.id,{name:'Arena'}); setActiveMap(s.id,map.id);setManualDamage(s.id,false);
 const ch=createCharacter(s.id,{name:'Hero',className:'Rogue',level:5,maxHp:50,stats:{STR:20,DEX:20,WIS:20,CHA:20},weapons:[{name:'Shortsword',kind:'melee',damage:'1d6',damageType:'piercing',tags:['finesse'],attackBonus:50}]});
 const mon=instantiateMonster(createMonsterTemplate(s.id,{name:'Target',maxHp:200,armorClass:1,stats:{STR:1,CON:1,WIS:1}}).id)!;
 const at=createToken({mapId:map.id,kind:'pc',refId:ch.id,x:100,y:100}), tt=createToken({mapId:map.id,kind:'monster',refId:mon.id,x:150,y:100});
 const spell=/smite|ensnaring/i.test(name);const ab:SheetAbility={id:'feature',name,type:spell?'spell':'ability',level:spell?1:undefined,description:''};setSheetAbility('pc',ch.id,ab);
 setResource(ch.id,'spellSlots','L1',{max:3,used:0});setResource(ch.id,'resources','Focus Points',{max:5,used:0});
 if(combat){setCombatRound(s.id,1);setActiveTurn(s.id,at.id);}
 vi.spyOn(Math,'random').mockReturnValue(.5);
 const attack=()=>{expect(resolveAttack(s.id,'Hero',at.id,tt.id,0,'adv')).toBe(true);return listRollLog(s.id).filter(r=>r.pending).at(-1)!;};
 return {s,ch,mon,at,tt,ab,attack};
}
describe('optional on-hit abilities',()=>{
 it('offers Sneak Attack next to normal damage, scales it, and spends it only once per turn',()=>{
 const f=fixture('Sneak Attack'),roll=f.attack();expect(getMonster(f.mon.id)!.curHp).toBe(200);
 expect(roll.pending!.hitOptions!.abilityIds).toContain(f.ab.id);
 expect(resolveHitFeature(f.s.id,'Hero',roll.id,f.ab.id).ok).toBe(true);
 expect(getMonster(f.mon.id)!.curHp).toBe(179); // 1d6+5 + 3d6
 expect(resolveHitFeature(f.s.id,'Hero',roll.id,f.ab.id).ok).toBe(false);
 expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0],'adv')).toEqual([]);
 });
 it('ordinary damage leaves Sneak Attack available; disadvantage does not offer it',()=>{
 const f=fixture('Sneak Attack'),roll=f.attack();resolveAttackDamage(f.s.id,'Hero',roll.id);
 expect(getMonster(f.mon.id)!.curHp).toBe(191);
 expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0],'adv')).toHaveLength(1);
 expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0],'dis')).toHaveLength(0);
 });
 it('does not permanently exhaust a once-per-turn feature outside initiative',()=>{
 const f=fixture('Sneak Attack',false);resolveHitFeature(f.s.id,'Hero',f.attack().id,f.ab.id);
 expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0],'adv')).toHaveLength(1);
 });
 it.each(['Searing Smite','Thunderous Smite','Wrathful Smite'])('%s spends one slot, doubles only dice on crits, and applies its effect',name=>{
 const f=fixture(name);vi.spyOn(Math,'random').mockReturnValue(.999);const roll=f.attack();
 expect(resolveHitFeature(f.s.id,'Hero',roll.id,f.ab.id,1).ok).toBe(true);
 expect(getCharacter(f.ch.id)!.spellSlots.L1.used).toBe(1);
 const damage=listRollLog(f.s.id).find(r=>r.reveal?.kind==='damage')!.reveal!;
 const rider=damage.damageDice!.filter(d=>d.label.includes(name));expect(rider).toHaveLength(2);expect(rider.map(d=>d.critical)).toEqual([false,true]);
 expect(getMonster(f.mon.id)!.curHp).toBe(200-damage.damage!);
 expect(getMonster(f.mon.id)!.conditions.some(c=>c.label===({ 'Searing Smite':'Searing Smite: Burning','Thunderous Smite':'Prone','Wrathful Smite':'Frightened'}[name]))).toBe(true);
 expect(resolveHitFeature(f.s.id,'Hero',roll.id,f.ab.id,1).ok).toBe(false);expect(getCharacter(f.ch.id)!.spellSlots.L1.used).toBe(1);
 });
 it('Stunning Strike spends Focus, stuns on failure and expires at caster turn',()=>{
 const f=fixture('Stunning Strike');expect(resolveHitFeature(f.s.id,'Hero',f.attack().id,f.ab.id).ok).toBe(true);
 expect(getCharacter(f.ch.id)!.resources['Focus Points'].used).toBe(1);
 expect(getMonster(f.mon.id)!.conditions.some(c=>c.label==='Stunned')).toBe(true);
 expireOnCasterTurn(f.s.id,f.at);expect(getMonster(f.mon.id)!.conditions.some(c=>c.label==='Stunned'||c.label==='Incapacitated')).toBe(false);
 });
 it('Ensnaring Strike adds no initial rider damage, then ticks and ends with concentration',()=>{
 const f=fixture('Ensnaring Strike');resolveHitFeature(f.s.id,'Hero',f.attack().id,f.ab.id,1);
 expect(getMonster(f.mon.id)!.curHp).toBe(191);
 expect(getMonster(f.mon.id)!.conditions.some(c=>c.label==='Restrained')).toBe(true);
 processHitEffects(f.s.id,f.tt,'start');expect(getMonster(f.mon.id)!.curHp).toBe(187);
 processHitEffects(f.s.id,f.tt,'start');expect(getMonster(f.mon.id)!.curHp).toBe(187);
 setConcentration('pc',f.ch.id,'Bless');expect(getMonster(f.mon.id)!.conditions.some(c=>c.label==='Restrained')).toBe(false);
 });
 it('Colossus Slayer requires a wounded target',()=>{
 const f=fixture('Colossus Slayer');expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0])).toHaveLength(0);
 applyDamage('monster',f.mon.id,1);expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0])).toHaveLength(1);
 resolveHitFeature(f.s.id,'Hero',f.attack().id,f.ab.id);expect(getMonster(f.mon.id)!.curHp).toBe(185);
 });
 it('Divine Strike adds its typed die and is limited to the owner turn',()=>{
 const f=fixture('Divine Strike');resolveHitFeature(f.s.id,'Hero',f.attack().id,f.ab.id);expect(getMonster(f.mon.id)!.curHp).toBe(186);
 setActiveTurn(f.s.id,f.tt.id);expect(hitOptions(f.s.id,getCharacter(f.ch.id)!,f.at,f.tt,f.ch.weapons[0])).toHaveLength(0);
 });
});
