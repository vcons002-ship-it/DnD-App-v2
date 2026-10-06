import {db} from './db.js';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {withDiceSource} from '../../shared/dice.js';
import {effectiveAc,skillExtra} from '../../shared/modifiers.js';
import {effectiveSpeed,spellActionBlock} from '../../shared/spellBuffs.js';
import {partySpell} from '../../shared/partySpells.js';
import {spellCombatSupport} from '../../shared/spellSupport.js';
import {getSpell} from './spells/srd.js';
import {resolveAttack,resolveAttackDamage,resolveAbilityRoll,resolveForcedSave,resolveTargetedSpellAttack} from './combat.js';
import {resolveShield,shieldGate,mistyStepError,teleportMistyStep,syncPassWithoutTrace,shakeAwake} from './partySpellEffects.js';
import {expireTimedSpellEffects} from './hitEffectTurns.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getCharacter,getMonster,getToken,listRollLog,setSheetAbility,setManualDamage,setCombatRound,setActiveTurn,setTempHp,setCondition,applyDamage,endConcentration,moveToken,claimCharacter,updateCharacter,drainHpFx} from './sessions.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {setConn,dropConn,type IOServer} from './connections.js';
import {buildSnapshot} from './visibility.js';
import type {SheetAbility} from '../../shared/types.js';
const setWalls=(id:string,walls:unknown[])=>db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),id);
const spell=(name:string):SheetAbility=>({...getSpell(name)!,id:name});
function client(sid:string,mapId:string,id:string){
 let connected!:(socket:unknown)=>void;
 const io={on:(_event:string,fn:typeof connected)=>{connected=fn;},to:()=>({emit:()=>{}})};
 registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
 const handlers=new Map<string,(payload:unknown)=>void>(),emit=vi.fn();
 connected({id,on:(event:string,fn:(payload:unknown)=>void)=>handlers.set(event,fn),emit});
 setConn(id,{sessionId:sid,role:'player',viewMapId:mapId,playerId:null});
 return {send:(event:string,payload:unknown)=>handlers.get(event)!(payload),emit,close:()=>dropConn(id)};
}
afterEach(()=>vi.restoreAllMocks());
function fixture(){
 const session=createSession('Party spell regressions'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);setManualDamage(session.id,false);
 const caster=createCharacter(session.id,{name:'Vanec',className:'Sorcerer',level:6,maxHp:100,curHp:100,armorClass:16,speed:'30 ft.',stats:{CHA:18,DEX:10,WIS:10},spellSlots:{L1:{max:4,used:0},L2:{max:3,used:0},L3:{max:3,used:0}}});
 for(const name of ['Shield','Misty Step','Hypnotic Pattern','Pass without Trace'])setSheetAbility('pc',caster.id,spell(name));
 const actor=createToken({mapId:map.id,kind:'pc',refId:caster.id,x:100,y:100});
 const template=createMonsterTemplate(session.id,{name:'Enemy',maxHp:100,armorClass:10,stats:{WIS:10},weapons:[{name:'Sword',kind:'melee',damage:'1d6+2',attackBonus:4,damageType:'slashing'}]}),monster=instantiateMonster(template.id)!;
 const enemy=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:200,y:100});
 const dice=(face:number,fn:()=>unknown)=>withDiceSource(s=>s.map(n=>n===20?face:3),fn);
 return {session,map,caster,actor,monster,enemy,dice,now:()=>getCharacter(caster.id)!,hit:(face=13)=>dice(face,()=>resolveAttack(session.id,'DM',enemy.id,actor.id,0))};
}
describe('Shield reaction',()=>{
 it.each([
  {face:13,pass:false,blocked:true},
  {face:17,pass:false,blocked:false},
  {face:20,pass:false,blocked:false},
  {face:13,pass:true,blocked:false},
 ])('only announces Blocked! when the triggering hit is stopped: %j',({face,pass,blocked})=>{
  const f=fixture(),owner=client(f.session.id,f.map.id,`shield-owner-${face}-${pass}`);
  claimCharacter(f.caster.id,`shield-owner-${face}-${pass}`);
  try{
   f.hit(face);const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;
   f.dice(3,()=>owner.send('spell:shield',{rollId:hit.id,pass,level:1}));
   const notices=owner.emit.mock.calls.filter(([event,p])=>event==='notice'&&p.message==='Blocked!');
   expect(notices).toHaveLength(blocked?1:0);
   if(blocked){expect(notices[0][1]).toEqual({message:'Blocked!',presentation:'blocked',durationMs:4000});expect(f.now().curHp).toBe(100);}
   else {
    const damage=listRollLog(f.session.id).find(e=>e.label==='Damage')!;
    expect(damage.reveal?.attacker).toBe(hit.reveal?.attacker);
   }
   // Replaying an already resolved reaction must not celebrate twice.
   owner.send('spell:shield',{rollId:hit.id,level:1});
   expect(owner.emit.mock.calls.filter(([event,p])=>event==='notice'&&p.message==='Blocked!')).toHaveLength(blocked?1:0);
  }finally{owner.close();}
 });
 it.each([false,true])('pauses a hit, spends one slot/reaction, blocks it with +5 AC, and expires on the caster turn (manual %s)',manual=>{
  const f=fixture();setManualDamage(f.session.id,manual);setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.enemy.id);f.hit();
  const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;
  expect(f.now().curHp).toBe(100);expect(()=>resolveAttackDamage(f.session.id,'DM',hit.id)).toThrow(/Waiting/);
  expect(resolveShield(f.session.id,'Vanec',hit.id)).toEqual({ok:true,blocked:true});
  expect(f.now().spellSlots.L1.used).toBe(1);expect(effectiveAc(f.now())).toBe(21);expect(f.now().armorClass).toBe(16);expect(f.now().curHp).toBe(100);
  expect(resolveShield(f.session.id,'Vanec',hit.id).ok).toBe(false);expect(shieldGate(f.session.id,'pc',f.caster.id)).toBeUndefined();
  const publicView=buildSnapshot(f.session.id,'player',null,'other')!;expect(JSON.stringify(publicView.rollLog)).not.toContain('attackTotal":17');
  setActiveTurn(f.session.id,f.actor.id);expect(effectiveAc(f.now())).toBe(16);expect(f.now().conditions.some(c=>/^Reaction spent/.test(c.label))).toBe(false);
 });
 it.each([false,true])('passing resumes automatic damage or leaves the manual damage click (manual %s)',manual=>{
  const f=fixture();setManualDamage(f.session.id,manual);f.hit();const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;
  f.dice(3,()=>resolveShield(f.session.id,'Vanec',hit.id,true));expect(f.now().curHp).toBe(manual?100:95);
  if(manual)f.dice(3,()=>resolveAttackDamage(f.session.id,'DM',hit.id));expect(f.now().curHp).toBe(95);expect(f.now().spellSlots.L1.used).toBe(0);
 });
 it('a natural 20 still hits; later ordinary attacks use the raised AC',()=>{
  const f=fixture();f.hit(20);const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;f.dice(3,()=>resolveShield(f.session.id,'Vanec',hit.id));expect(f.now().curHp).toBe(92);
  f.hit(13);expect(f.now().curHp).toBe(92);expect(listRollLog(f.session.id).at(-1)?.reveal?.outcome).toBe('miss');
 });
 it('works on spell attacks and Magic Missile, with no second reaction or damage',()=>{
  const f=fixture();f.dice(13,()=>resolveTargetedSpellAttack({sessionId:f.session.id,roller:'DM',title:'Fire Bolt',attackBonus:4,dice:'1d10',damageType:'fire',attacker:{kind:'monster',refId:f.monster.id},targetTokenId:f.actor.id}));
  const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;resolveShield(f.session.id,'Vanec',hit.id);expect(f.now().curHp).toBe(100);
  const missile=spell('Magic Missile');f.dice(3,()=>resolveAbilityRoll(f.session.id,'Vanec',f.now(),missile,1));const source=listRollLog(f.session.id).find(e=>e.apply?.darts)!;
  resolveForcedSave(f.session.id,source.id,f.actor.id);expect(f.now().curHp).toBe(100);
 });
 it('offers Shield when Magic Missile targets an unprotected caster',()=>{
  const f=fixture();f.dice(3,()=>resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Magic Missile'),1));const source=listRollLog(f.session.id).find(e=>e.apply?.darts)!;
  f.dice(3,()=>resolveForcedSave(f.session.id,source.id,f.actor.id));const hit=listRollLog(f.session.id).find(e=>e.pending?.shield)!;expect(hit).toBeDefined();expect(f.now().curHp).toBe(100);
  resolveShield(f.session.id,'Vanec',hit.id);resolveForcedSave(f.session.id,source.id,f.actor.id);expect(f.now().curHp).toBe(100);
 });
});
describe('Hypnotic Pattern linked conditions',()=>{
 it('uses area saves without a target cap, blocks actions/movement, has no repeat saves and wakes on temp-HP damage',()=>{
  const f=fixture();f.dice(1,()=>resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Hypnotic Pattern'),3,undefined,undefined,undefined,{mapId:f.map.id,points:[{x:350,y:100}],angle:0}));
  const e=getMonster(f.monster.id)!;expect(e.conditions.map(c=>c.label)).toEqual(expect.arrayContaining(['Hypnotic Pattern','Charmed','Incapacitated']));expect(effectiveSpeed(e)).toBe('0 ft.');expect(spellActionBlock(e)).toBe('Hypnotic Pattern');
  expect(e.conditions.find(c=>c.label==='Hypnotic Pattern')!.combatEffect?.save).toBeUndefined();
  setTempHp('monster',e.id,10);applyDamage('monster',e.id,1);expect(getMonster(e.id)!.curHp).toBe(100);expect(getMonster(e.id)!.conditions).toEqual([]);
 });
 it('shaking wakes just that target and retains separately applied conditions; concentration cleans up others',()=>{
  const f=fixture();setCondition('monster',f.monster.id,{id:'manual-charm',label:'Charmed',aura:'red',isConcentration:false});
  f.dice(1,()=>resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Hypnotic Pattern'),3));const source=listRollLog(f.session.id).find(e=>e.apply?.effect)!;f.dice(1,()=>resolveForcedSave(f.session.id,source.id,f.enemy.id));
  moveToken(f.actor.id,150,100);expect(shakeAwake(f.session.id,f.actor.id,f.enemy.id)).toBeUndefined();expect(getMonster(f.monster.id)!.conditions.map(c=>c.id)).toEqual(['manual-charm']);
  f.dice(1,()=>resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Hypnotic Pattern'),3));const source2=listRollLog(f.session.id).filter(e=>e.apply?.effect).at(-1)!;f.dice(1,()=>resolveForcedSave(f.session.id,source2.id,f.enemy.id));endConcentration('pc',f.caster.id,'test');expect(getMonster(f.monster.id)!.conditions.map(c=>c.id)).toEqual(['manual-charm']);
 });
});
describe('Pass without Trace',()=>{
 it('grants a labelled, non-stacking bonus to chosen creatures inside the moving aura; leave/re-enter and concentration cleanup',()=>{
  const f=fixture();resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Pass without Trace'),2,undefined,undefined,undefined,{mapId:f.map.id,points:[f.actor],angle:0,selected:[f.actor.id,f.enemy.id]});
  expect(drainHpFx(f.session.id)).toEqual([expect.objectContaining({spell:'Pass without Trace',delta:0,refId:f.caster.id})]);
  expect(skillExtra(f.now(),'Stealth')).toEqual({total:10,parts:[{source:'Pass without Trace',value:10}]});expect(skillExtra(getMonster(f.monster.id)!,'stealth').total).toBe(10);
  syncPassWithoutTrace(f.session.id);expect(skillExtra(f.now(),'stealth').total).toBe(10);
  moveToken(f.enemy.id,1000,100);syncPassWithoutTrace(f.session.id);expect(skillExtra(getMonster(f.monster.id)!,'Stealth').total).toBe(0);
  moveToken(f.enemy.id,200,100);syncPassWithoutTrace(f.session.id);expect(skillExtra(getMonster(f.monster.id)!,'Stealth').total).toBe(10);
  endConcentration('pc',f.caster.id,'test');expect(skillExtra(f.now(),'stealth').total).toBe(0);expect(skillExtra(getMonster(f.monster.id)!,'Stealth').total).toBe(0);
 });
 it('expires after one hour outside combat',()=>{
  const f=fixture();const start=Date.now();vi.spyOn(Date,'now').mockReturnValue(start);resolveAbilityRoll(f.session.id,'Vanec',f.now(),spell('Pass without Trace'),2,undefined,undefined,undefined,{mapId:f.map.id,points:[f.actor],angle:0,selected:[]});
  vi.spyOn(Date,'now').mockReturnValue(start+3600001);expireTimedSpellEffects(f.session.id);expect(skillExtra(f.now(),'stealth').total).toBe(0);
 });
});
describe('Misty Step destination',()=>{
 it('rejects another player, a hidden destination and an empty pool without moving or spending; cancellation is free',()=>{
  const f=fixture(),owner=client(f.session.id,f.map.id,'misty-owner'),other=client(f.session.id,f.map.id,'misty-other');claimCharacter(f.caster.id,'misty-owner');
  const payload={kind:'pc',refId:f.caster.id,abilityId:'Misty Step',castLevel:2,destination:{mapId:f.map.id,x:350,y:100}};
  try{
   other.send('ability:roll',payload);expect(getToken(f.actor.id)!.x).toBe(100);expect(f.now().spellSlots.L2.used).toBe(0);
   owner.send('ability:roll',{...payload,destination:undefined});expect(f.now().spellSlots.L2.used).toBe(0);
   db.prepare('UPDATE maps SET map_fog_enabled=1,map_fog_revealed=? WHERE id=?').run('[]',f.map.id);
   // A manually covered destination is never accepted.
   owner.send('ability:roll',payload);expect(getToken(f.actor.id)!.x).toBe(100);expect(owner.emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringMatching(/see/)}));
   updateCharacter(f.caster.id,{spellSlots:{L2:{max:1,used:1}}});
   db.prepare('UPDATE maps SET map_fog_enabled=0,token_fog_enabled=0 WHERE id=?').run(f.map.id);
   owner.send('ability:roll',payload);expect(getToken(f.actor.id)!.x).toBe(100);expect(f.now().spellSlots.L2.used).toBe(1);
  }finally{owner.close();other.close();}
 });
 it('validates range/visibility/occupancy and crosses a window without walking through it',()=>{
  const f=fixture();const d={mapId:f.map.id,x:350,y:100};
  expect(mistyStepError(f.session.id,'pc',f.caster.id,{...d,x:900})).toMatch(/30/);expect(mistyStepError(f.session.id,'pc',f.caster.id,{...d,x:200})).toMatch(/unoccupied/);
  setWalls(f.map.id,[{id:'wall',ax:250,ay:0,bx:250,by:300}]);expect(mistyStepError(f.session.id,'pc',f.caster.id,d)).toMatch(/see/);
  setWalls(f.map.id,[{id:'window',ax:250,ay:0,bx:250,by:300,window:true}]);expect(teleportMistyStep(f.session.id,'pc',f.caster.id,d)).toBe(true);expect(getToken(f.actor.id)).toMatchObject({x:350,y:100});
 });
 it('preserves explicitly custom/manual entries and leaves Command/Alter Self untouched',()=>{
  for(const name of ['Shield','Misty Step','Hypnotic Pattern','Pass without Trace']){
    const a=spell(name),copy=structuredClone(a);expect(partySpell(a)).toBe(name.toLowerCase());expect(spellCombatSupport(a)?.status).toBe('ready');expect(a).toEqual(copy);expect(partySpell({...a,source:'custom'})).toBeUndefined();expect(partySpell({...a,executionProfile:'manual'})).toBeUndefined();
  }
  expect(partySpell(spell('Command'))).toBeUndefined();expect(partySpell(spell('Alter Self'))).toBeUndefined();
 });
});
