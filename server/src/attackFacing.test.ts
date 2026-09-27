import {describe,it,expect} from 'vitest';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,
  getToken,getMonster,faceTokenToward,setManualDamage,listRollLog} from './sessions.js';
import {resolveAttack,resolveAttackDamage,resolveAbilityRoll,resolveForcedSave,resolveOrbLeap} from './combat.js';
import {runLiveCommand} from './liveRolls.js';
import {withDiceSource} from '../../shared/dice.js';
import {getSpell} from './spells/srd.js';

function fixture(manual=false){
 const session=createSession('Attack facing'),map=createMap(session.id,{name:'Facing field'});
 setActiveMap(session.id,map.id);setManualDamage(session.id,manual);
 const pc=createCharacter(session.id,{name:'Vanec',className:'Sorcerer',level:5,stats:{CHA:20},weapons:[{name:'Sword',kind:'melee',damage:'1d8',attackBonus:100}]});
 const actor=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:200,y:200});
 const target=(x:number,y:number)=>{
  const template=createMonsterTemplate(session.id,{name:'Goblin',maxHp:200,armorClass:1});
  const monster=instantiateMonster(template.id)!;
  return createToken({mapId:map.id,kind:'monster',refId:monster.id,x,y});
 };
 return {session,map,pc,actor,target};
}
const spell=(name:string)=>({...getSpell(name)!,id:name});
const rolled=<T>(fn:()=>T)=>withDiceSource(sides=>sides.map(s=>s===20?12:4),fn);

describe('attack and cast facing',()=>{
 it('turns in place without moving, and ignores invalid sessions/maps and self-targets',()=>{
  const f=fixture(),east=f.target(400,200),before=getToken(f.actor.id)!;
  expect(faceTokenToward(f.session.id,f.actor.id,east.id)).toBe(true);
  expect(getToken(f.actor.id)).toEqual({...before,facing:Math.PI/2});
  expect(faceTokenToward('another-session',f.actor.id,f.target(200,400).id)).toBe(false);
  const other=createMap(f.session.id,{name:'Other'}),remote=createToken({mapId:other.id,kind:'pc',refId:f.pc.id,x:50,y:50});
  expect(faceTokenToward(f.session.id,f.actor.id,remote.id)).toBe(false);
  expect(faceTokenToward(f.session.id,f.actor.id,f.actor.id)).toBe(false);
  expect(getToken(f.actor.id)?.facing).toBeCloseTo(Math.PI/2);
 });
 it.each([1,12])('turns before live to-hit dice, including a miss (%i), without applying early damage',async(face)=>{
  const f=fixture(),east=f.target(400,200);let broadcasts=0,rolls=0;
  await runLiveCommand(()=>{resolveAttack(f.session.id,'Vanec',f.actor.id,east.id,0);},()=>{},
   {label:'Sword',roller:'Vanec',className:'Sorcerer',onFacing:()=>broadcasts++},async(sides)=>{
    expect(getToken(f.actor.id)).toMatchObject({x:200,y:200,facing:Math.PI/2});
    expect(getMonster(east.refId)?.curHp).toBe(200);rolls++;
    return sides.map(s=>s===20?face:4);
   });
  expect(broadcasts).toBe(1);expect(rolls).toBe(face===1?1:2);
 });
 it('does not turn on an invalid attack or retarget on a later manual damage click',async()=>{
  const f=fixture(true),east=f.target(400,200),south=f.target(200,400);
  expect(resolveAttack(f.session.id,'Vanec',f.actor.id,east.id,99)).toBe(false);
  expect(getToken(f.actor.id)?.facing).toBe(0);
  const meta={label:'Sword',roller:'Vanec',className:'Sorcerer'};
  const dice=async(sides:number[])=>sides.map(s=>s===20?12:4);
  await runLiveCommand(()=>{resolveAttack(f.session.id,'Vanec',f.actor.id,east.id,0);},()=>{},meta,dice);
  const hit=listRollLog(f.session.id).find(e=>e.pending)!;
  faceTokenToward(f.session.id,f.actor.id,south.id);
  await runLiveCommand(()=>{resolveAttackDamage(f.session.id,'Vanec',hit.id);},()=>{},meta,dice);
  expect(getToken(f.actor.id)?.facing).toBe(0);
  expect(getMonster(east.refId)!.curHp).toBeLessThan(200);
 });
 it.each(['Fire Bolt','Sacred Flame'])('faces the selected target before %s dice start',async(name)=>{
  const f=fixture(),west=f.target(0,200);
  await runLiveCommand(()=>{resolveAbilityRoll(f.session.id,'Vanec',f.pc,spell(name),0,undefined,west.id);},()=>{},
   {label:name,roller:'Vanec',className:'Sorcerer'},async(sides)=>{
    expect(getToken(f.actor.id)?.facing).toBeCloseTo(-Math.PI/2);
    return sides.map(s=>s===20?12:4);
   });
 });
 it('keeps the original direction for Magic Missile casts and dart assignments',()=>{
  const f=fixture(),east=f.target(400,200),west=f.target(0,200);
  rolled(()=>resolveAbilityRoll(f.session.id,'Vanec',f.pc,spell('Magic Missile'),1,undefined,east.id));
  const cast=listRollLog(f.session.id).find(e=>e.apply?.darts)!;
  expect(cast).toBeDefined();
  rolled(()=>resolveForcedSave(f.session.id,cast.id,east.id));
  rolled(()=>resolveForcedSave(f.session.id,cast.id,west.id));
  expect(getToken(f.actor.id)?.facing).toBe(0);
 });
 it('turns for the initial Chromatic Orb, but not its bouncing follow-up',()=>{
  const f=fixture(),east=f.target(300,200),north=f.target(200,100);
  rolled(()=>resolveAbilityRoll(f.session.id,'Vanec',f.pc,spell('Chromatic Orb'),1,undefined,east.id,'lightning'));
  expect(getToken(f.actor.id)?.facing).toBeCloseTo(Math.PI/2);
  const cast=listRollLog(f.session.id).find(e=>e.apply?.orb)!;
  expect(rolled(()=>resolveOrbLeap(f.session.id,cast.id,north.id))).toEqual({ok:true});
  expect(getToken(f.actor.id)?.facing).toBeCloseTo(Math.PI/2);
 });
});
