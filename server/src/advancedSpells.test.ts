import {describe,it,expect,vi,afterEach} from 'vitest';
import {withDiceSource} from '../../shared/dice.js';
import {travelInSpikes,difficultTravel,isInvisible} from '../../shared/advancedSpells.js';
import {getSpell} from './spells/srd.js';
import {castInvisibility,breakInvisibility,invisibilityError,spikeConditions} from './advancedSpells.js';
import {deferCast,heldCasts,counterspellChoice,eligibleCounterspellers} from './counterspell.js';
import {resolveAbilityRoll,resolveAttack,applyDamageNoted} from './combat.js';
import {processHitEffects,expireTimedSpellEffects} from './hitEffectTurns.js';
import {teleportMistyStep} from './partySpellEffects.js';
import {buildSnapshot} from './visibility.js';
import {db} from './db.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getCharacter,getMonster,listRollLog,setSheetAbility,setCondition,endConcentration,moveToken,claimCharacter,setManualDamage,updateCharacter} from './sessions.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {setConn,dropConn,type IOServer} from './connections.js';
import type {SheetAbility} from '../../shared/types.js';
const spell=(name:string):SheetAbility=>({...getSpell(name)!,id:name});
function fixture(){
 const s=createSession('Advanced spell regression'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);setManualDamage(s.id,false);
 const c=createCharacter(s.id,{name:'Vanec',className:'Sorcerer',level:6,maxHp:100,curHp:100,stats:{CHA:18,CON:10},weapons:[{name:'Sword',kind:'melee',attackBonus:5,damage:'1d6',damageType:'slashing'}],spellSlots:{L1:{max:4,used:0},L2:{max:4,used:0},L3:{max:4,used:0}}});
 for(const name of ['Invisibility','Spike Growth','Counterspell','Fire Bolt'])setSheetAbility('pc',c.id,spell(name));
 const actor=createToken({mapId:map.id,kind:'pc',refId:c.id,x:100,y:100});
 const template=createMonsterTemplate(s.id,{name:'Enemy mage',maxHp:100,armorClass:10,stats:{CON:10,INT:18},disposition:'enemy',sheetAbilities:[spell('Fire Bolt')]});
 const m=instantiateMonster(template.id)!,enemy=createToken({mapId:map.id,kind:'monster',refId:m.id,x:400,y:100});
 return {s,map,c,actor,m,enemy,now:()=>getCharacter(c.id)!,foe:()=>getMonster(m.id)!,dice:(face:number,fn:()=>unknown)=>withDiceSource(sides=>sides.map(n=>n===20?face:3),fn),area:{mapId:map.id,points:[{x:300,y:100}],angle:0}};
}
function client(sid:string,mapId:string,id:string,dm=false){
 let connected!:(socket:unknown)=>void;
 const io={on:(_event:string,fn:typeof connected)=>{connected=fn;},to:()=>({emit:()=>{}})};
 registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
 const handlers=new Map<string,(p:unknown)=>void>(),emit=vi.fn();connected({id,on:(event:string,fn:(p:unknown)=>void)=>handlers.set(event,fn),emit});
 setConn(id,{sessionId:sid,role:dm?'dm':'player',viewMapId:mapId,playerId:null});
 return {send:(event:string,p:unknown)=>handlers.get(event)!(p),emit,close:()=>dropConn(id)};
}
afterEach(()=>vi.restoreAllMocks());
describe('Invisibility',()=>{
 it('casts through the authenticated workflow, spends a slot and makes a party ghost',()=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,'invis-owner');claimCharacter(f.c.id,'invis-owner');
  try{owner.send('ability:roll',{kind:'pc',refId:f.c.id,abilityId:'Invisibility',targetTokenIds:[f.actor.id],castLevel:2});
   expect(isInvisible(f.now())).toBe(true);expect(f.now().spellSlots.L2.used).toBe(1);
   expect(buildSnapshot(f.s.id,'player',null,'invis-owner')!.tokens.find(t=>t.id===f.actor.id)?.invisible).toBe(true);
  }finally{owner.close();}
 });
 it('upcasting permits multiple touch targets and attack breaking is per recipient',()=>{
  const f=fixture(),ally=createCharacter(f.s.id,{name:'Varis',className:'Ranger',maxHp:20,curHp:20}),token=createToken({mapId:f.map.id,kind:'pc',refId:ally.id,x:150,y:100});
  expect(castInvisibility(f.s.id,'Vanec','pc',f.c.id,3,[f.actor.id,token.id])).toBeUndefined();
  f.dice(12,()=>resolveAttack(f.s.id,'Vanec',f.actor.id,f.enemy.id,0));
  expect(isInvisible(f.now())).toBe(false);expect(isInvisible(getCharacter(ally.id))).toBe(true);
  expect(f.now().conditions.some(c=>c.isConcentration)).toBe(true);
  breakInvisibility('pc',ally.id,'casting a spell');expect(f.now().conditions.some(c=>c.isConcentration)).toBe(false);
 });
 it('ongoing damage also ends ordinary Invisibility granted by another caster',()=>{
  const f=fixture(),ally=createCharacter(f.s.id,{name:'Other wizard',maxHp:20,curHp:20});createToken({mapId:f.map.id,kind:'pc',refId:ally.id,x:150,y:100});
  castInvisibility(f.s.id,'Other wizard','pc',ally.id,2,[f.actor.id]);
  setCondition('monster',f.m.id,{id:'ongoing',label:'Burning',aura:'red',isConcentration:false,combatEffect:{casterKind:'pc',casterId:f.c.id,spell:'Test ongoing spell',dice:'1d4',damageType:'fire',phase:'start'}});
  f.dice(3,()=>processHitEffects(f.s.id,f.enemy,'start'));expect(isInvisible(f.now())).toBe(false);
 });
 it('rejects distant targets and too many level-2 recipients without starting concentration',()=>{
  const f=fixture();expect(invisibilityError(f.s.id,'pc',f.c.id,2,[f.enemy.id])).toMatch(/touch/);
  expect(invisibilityError(f.s.id,'pc',f.c.id,2,[f.actor.id,f.enemy.id])).toMatch(/up to 1/);
  expect(f.now().conditions).toHaveLength(0);
 });
 it('removes invisible hostile tokens and stat blocks from player snapshots; DM retains a ghost',()=>{
  const f=fixture();claimCharacter(f.c.id,'viewer');castInvisibility(f.s.id,'DM','monster',f.m.id,2,[f.enemy.id]);
  const view=buildSnapshot(f.s.id,'player',null,'viewer')!;
  expect(view.tokens.some(t=>t.id===f.enemy.id)).toBe(false);expect(view.monsters.some(m=>m.id===f.m.id)).toBe(false);
  expect(buildSnapshot(f.s.id,'dm')!.tokens.find(t=>t.id===f.enemy.id)?.invisible).toBe(true);
 });
 it('ends on concentration loss and expires after one hour outside combat',()=>{
  const f=fixture();castInvisibility(f.s.id,'Vanec','pc',f.c.id,2,[f.actor.id]);endConcentration('pc',f.c.id,'test');expect(isInvisible(f.now())).toBe(false);
  castInvisibility(f.s.id,'Vanec','pc',f.c.id,2,[f.actor.id]);vi.spyOn(Date,'now').mockReturnValue(Date.now()+3600001);expireTimedSpellEffects(f.s.id);expect(isInvisible(f.now())).toBe(false);
 });
});
describe('Spike Growth',()=>{
 it('overlapping areas count terrain and damage once',()=>{
  expect(difficultTravel({x:-30,y:0},{x:30,y:0},[{x:0,y:0,radiusFt:20},{x:0,y:0,radiusFt:20}],1)).toBeCloseTo(40);
  const f=fixture(),second=createCharacter(f.s.id,{name:'Other caster',maxHp:20,curHp:20});
  resolveAbilityRoll(f.s.id,'Vanec',f.now(),spell('Spike Growth'),2,undefined,undefined,undefined,f.area);
  resolveAbilityRoll(f.s.id,'Other caster',getCharacter(second.id)!,spell('Spike Growth'),2,undefined,undefined,undefined,f.area);
  f.dice(3,()=>moveToken(f.enemy.id,450,100));expect(f.foe().curHp).toBe(94);
 });
 it('applies Piercing resistance and breaks an invisible source dealing ongoing damage',()=>{
  const f=fixture();db.prepare('UPDATE monsters SET resistances=? WHERE id=?').run(JSON.stringify(['piercing']),f.m.id);
  resolveAbilityRoll(f.s.id,'Vanec',f.now(),spell('Spike Growth'),2,undefined,undefined,undefined,f.area);
  f.dice(3,()=>moveToken(f.enemy.id,450,100));expect(f.foe().curHp).toBe(97);
  const ally=createCharacter(f.s.id,{name:'Ally wizard',maxHp:20,curHp:20}),token=createToken({mapId:f.map.id,kind:'pc',refId:ally.id,x:150,y:100});
  castInvisibility(f.s.id,'Ally wizard','pc',ally.id,2,[f.actor.id]);expect(isInvisible(f.now())).toBe(true);
  applyDamageNoted('monster',f.m.id,1,'fire',{kind:'pc',refId:f.c.id});expect(isInvisible(f.now())).toBe(false);
 });
 it('clips entry/exit paths and counts grid diagonals correctly',()=>{
  expect(travelInSpikes({x:-30,y:0},{x:30,y:0},{x:0,y:0},20,1)).toBeCloseTo(40);
  expect(travelInSpikes({x:30,y:30},{x:50,y:50},{x:0,y:0},20,1)).toBe(0);
  expect(travelInSpikes({x:0,y:0},{x:5,y:5},{x:0,y:0},20,1)).toBeCloseTo(5);
 });
 it('has no placement damage, accumulates short moves, applies Piercing defenses and cleans up its template',()=>{
  const f=fixture();expect(resolveAbilityRoll(f.s.id,'Vanec',f.now(),spell('Spike Growth'),2,undefined,undefined,undefined,f.area)).toBe(true);
  expect(f.foe().curHp).toBe(100);expect(buildSnapshot(f.s.id,'dm')!.measurements.some(m=>m.spellName==='Spike Growth')).toBe(true);
  f.dice(3,()=>moveToken(f.enemy.id,425,100));expect(f.foe().curHp).toBe(100);
  f.dice(3,()=>moveToken(f.enemy.id,450,100));expect(f.foe().curHp).toBe(94);
  expect(listRollLog(f.s.id).at(-1)?.reveal?.damageDice?.[0].diceExpression).toBe('2d4');
  endConcentration('pc',f.c.id,'test');expect(spikeConditions(f.s.id)).toHaveLength(0);expect(buildSnapshot(f.s.id,'dm')!.measurements).toHaveLength(0);
 });
 it('charges only the portion traveled inside, including forced movement, and skips Misty Step',()=>{
  const f=fixture();resolveAbilityRoll(f.s.id,'Vanec',f.now(),spell('Spike Growth'),2,undefined,undefined,undefined,f.area);
  f.dice(3,()=>moveToken(f.enemy.id,600,100));expect(f.foe().curHp).toBe(88); // 10 ft inside, 10 ft outside.
  const before=f.now().curHp;expect(teleportMistyStep(f.s.id,'pc',f.c.id,{mapId:f.map.id,x:250,y:100})).toBe(true);expect(f.now().curHp).toBe(before);
 });
 it('does not charge a blocked movement through a wall',()=>{
  const f=fixture();resolveAbilityRoll(f.s.id,'Vanec',f.now(),spell('Spike Growth'),2,undefined,undefined,undefined,f.area);
  db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify([{id:'wall',ax:410,ay:0,bx:410,by:200,thickness:5}]),f.map.id);
  f.dice(3,()=>moveToken(f.enemy.id,600,100,true));expect(f.foe().curHp).toBe(100);
 });
});
describe('Counterspell',()=>{
 it('can interrupt Shield without spending its slot or losing the triggering attack',()=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,'shield-counter-owner'),dm=client(f.s.id,f.map.id,'shield-counter-dm',true);claimCharacter(f.c.id,'shield-counter-owner');
  setSheetAbility('pc',f.c.id,spell('Shield'));setSheetAbility('monster',f.m.id,spell('Counterspell'));
  db.prepare('UPDATE monsters SET weapons=? WHERE id=?').run(JSON.stringify([{name:'Sword',kind:'melee',damage:'1d6',attackBonus:5,damageType:'slashing'}]),f.m.id);
  try{
   f.dice(13,()=>resolveAttack(f.s.id,'DM',f.enemy.id,f.actor.id,0));const hit=listRollLog(f.s.id).find(r=>r.pending?.shield)!;expect(hit).toBeTruthy();
   owner.send('spell:shield',{rollId:hit.id,level:1});const held=heldCasts(f.s.id)[0];expect(held?.event).toBe('spell:shield');
   f.dice(1,()=>dm.send('spell:counterspell',{castId:held.id,reactorTokenId:f.enemy.id,level:3}));
   expect(f.now().spellSlots.L1.used).toBe(0);expect(f.now().conditions.some(c=>c.label==='Shield')).toBe(false);
   expect(f.now().conditions.some(c=>c.label==='Reaction spent (Shield)')).toBe(true);expect(f.now().curHp).toBe(97);
  }finally{owner.close();dm.close();}
 });
 it.each([true,false])('post-hit Smite is countered or passed without losing/doubling weapon damage (counter %s)',counter=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,`smite-counter-owner-${counter}`),dm=client(f.s.id,f.map.id,`smite-counter-dm-${counter}`,true);claimCharacter(f.c.id,`smite-counter-owner-${counter}`);
  setSheetAbility('pc',f.c.id,spell('Divine Smite'));setSheetAbility('monster',f.m.id,spell('Counterspell'));
  try{
   f.dice(13,()=>resolveAttack(f.s.id,'Vanec',f.actor.id,f.enemy.id,0));
   const hit=listRollLog(f.s.id).find(r=>r.smite)!;expect(hit).toBeTruthy();
   owner.send('combat:smite',{rollId:hit.id,level:1});const held=heldCasts(f.s.id)[0];expect(held?.event).toBe('combat:smite');expect(f.now().spellSlots.L1.used).toBe(0);
   f.dice(counter?1:3,()=>dm.send('spell:counterspell',{castId:held.id,reactorTokenId:f.enemy.id,pass:!counter,level:3}));
   expect(f.now().spellSlots.L1.used).toBe(counter?0:1);expect(f.foe().curHp).toBe(counter?97:91);
   expect(listRollLog(f.s.id).find(r=>r.id===hit.id)?.pending?.done).toBe(true);
  }finally{owner.close();dm.close();}
 });
 it('Counterspell can interrupt Mage Hand before its summon is created',()=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,'summon-counter-owner'),dm=client(f.s.id,f.map.id,'summon-counter-dm',true);claimCharacter(f.c.id,'summon-counter-owner');
  setSheetAbility('pc',f.c.id,spell('Mage Hand'));setSheetAbility('monster',f.m.id,spell('Counterspell'));
  try{
   owner.send('summon:cast',{kind:'pc',refId:f.c.id,abilityId:'Mage Hand',mapId:f.map.id,x:200,y:200});
   const held=heldCasts(f.s.id)[0];expect(held?.event).toBe('summon:cast');
   f.dice(1,()=>dm.send('spell:counterspell',{castId:held.id,reactorTokenId:f.enemy.id,level:3}));
   expect(buildSnapshot(f.s.id,'dm')!.tokens).toHaveLength(2);
  }finally{owner.close();dm.close();}
 });
 it.each([1,20])('holds spell effects before rolling and either interrupts or resumes (CON face %s)',face=>{
  const f=fixture(),dm=client(f.s.id,f.map.id,`counter-dm-${face}`,true),owner=client(f.s.id,f.map.id,`counter-owner-${face}`);claimCharacter(f.c.id,`counter-owner-${face}`);
  try{
   dm.send('ability:roll',{kind:'monster',refId:f.m.id,abilityId:'Fire Bolt',targetTokenId:f.actor.id});
   const pending=heldCasts(f.s.id)[0];expect(pending).toBeTruthy();expect(f.now().curHp).toBe(100);expect(listRollLog(f.s.id)).toHaveLength(0);
   f.dice(face,()=>owner.send('spell:counterspell',{castId:pending.id,reactorTokenId:f.actor.id,level:3}));
   expect(heldCasts(f.s.id)).toHaveLength(0);expect(f.now().spellSlots.L3.used).toBe(1);expect(f.now().conditions.some(c=>c.label==='Reaction spent (Counterspell)')).toBe(true);
   expect(f.now().curHp).toBe(face===1?100:94);expect(listRollLog(f.s.id).some(r=>r.reveal?.effectOutcome?.includes(face===1?'countered':'continues'))).toBe(true);
   owner.send('spell:counterspell',{castId:pending.id,reactorTokenId:f.actor.id,level:3});expect(f.now().spellSlots.L3.used).toBe(1);
  }finally{dm.close();owner.close();}
 });
 it('passes without spending a reaction and resumes the original caster as its original owner',()=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,'counter-pass-owner'),dm=client(f.s.id,f.map.id,'counter-pass-dm',true);claimCharacter(f.c.id,'counter-pass-owner');setSheetAbility('monster',f.m.id,spell('Counterspell'));
  try{owner.send('ability:roll',{kind:'pc',refId:f.c.id,abilityId:'Invisibility',targetTokenIds:[f.actor.id],castLevel:2});
   const pending=heldCasts(f.s.id)[0];expect(f.now().spellSlots.L2.used).toBe(0);
   dm.send('spell:counterspell',{castId:pending.id,reactorTokenId:f.enemy.id,pass:true});
   expect(isInvisible(f.now())).toBe(true);expect(f.now().spellSlots.L2.used).toBe(1);expect(f.foe().conditions.some(c=>/^Reaction spent/.test(c.label))).toBe(false);
  }finally{owner.close();dm.close();}
 });
 it('a successfully countered PC preserves the original spell slot and does not gain its effect',()=>{
  const f=fixture(),owner=client(f.s.id,f.map.id,'counter-pc-owner'),dm=client(f.s.id,f.map.id,'counter-pc-dm',true);claimCharacter(f.c.id,'counter-pc-owner');setSheetAbility('monster',f.m.id,spell('Counterspell'));
  try{owner.send('ability:roll',{kind:'pc',refId:f.c.id,abilityId:'Invisibility',targetTokenIds:[f.actor.id],castLevel:2});
   const pending=heldCasts(f.s.id)[0];f.dice(1,()=>dm.send('spell:counterspell',{castId:pending.id,reactorTokenId:f.enemy.id,level:3}));
   expect(f.now().spellSlots.L2.used).toBe(0);expect(isInvisible(f.now())).toBe(false);
  }finally{owner.close();dm.close();}
 });
 it('does not offer reactions across walls, to invisible casters, or without slots',()=>{
  const f=fixture(),base={casterTokenId:f.enemy.id,sessionId:f.s.id,declined:[]};expect(eligibleCounterspellers(base)).toHaveLength(1);
  castInvisibility(f.s.id,'DM','monster',f.m.id,2,[f.enemy.id]);expect(eligibleCounterspellers(base)).toHaveLength(0);endConcentration('monster',f.m.id,'test');
  updateCharacter(f.c.id,{spellSlots:{L3:{max:0,used:0}}});expect(eligibleCounterspellers(base)).toHaveLength(0);
 });
});
