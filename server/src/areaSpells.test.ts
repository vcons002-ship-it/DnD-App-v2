import {describe,it,expect} from 'vitest';
import {spellAreaFor,pointInSpellArea,type SpellAreaPlacement} from '../../shared/spellAreas.js';
import {getAllSpells,getSpell} from './spells/srd.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getMonster,listRollLog,listMeasurements,setCondition,getCharacter,drainHpFx} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {resolveAbilityRoll} from './combat.js';
import {runLiveCommand} from './liveRolls.js';
import {withDiceSource} from '../../shared/dice.js';
import {areaPlacementError} from './areaSpells.js';
import {db} from './db.js';

describe('spell area placement',()=>{
 it('covers every tagged area spell, preserving hit-centered and individual-choice spells',()=>{
  const special=['Hail of Thorns','Ice Knife','Compulsion','Chain Lightning'];
  for(const a of getAllSpells().filter(a=>a.type==='spell'&&a.tags?.includes('aoe')&&!special.includes(a.name)))expect(spellAreaFor(a),a.name).toBeTruthy();
 });
 it('uses actual radii, cone lengths, line widths, cube sides, and multiple areas',()=>{
  expect(spellAreaFor(getSpell('Ice Storm')!)).toMatchObject({kind:'cylinder',sizeFt:20});
  expect(spellAreaFor(getSpell('Fireball')!)).toMatchObject({sizeFt:20,rangeFt:150});
  expect(spellAreaFor(getSpell('Meteor Swarm')!)).toMatchObject({sizeFt:40,count:4});
  const p={mapId:'map',points:[{x:0,y:0}],angle:0},caster={x:0,y:0};
  for(const [name,inside,outside] of [['Burning Hands',{x:10,y:4},{x:10,y:6}],['Lightning Bolt',{x:50,y:2},{x:50,y:3}],['Fireball',{x:19,y:0},{x:21,y:0}],['Thunderwave',{x:14,y:7},{x:-2,y:0}]] as const){
   const spec=spellAreaFor(getSpell(name)!)!;expect(pointInSpellArea(spec,p,caster,inside,1),name).toBe(true);expect(pointInSpellArea(spec,p,caster,outside,1),name).toBe(false);
  }
 });
 it('covers untagged protective fields, illusions, and 2024 area conjurations',()=>{
  for(const name of ['Antilife Shell','Antimagic Field','Wall of Force','Wall of Stone','Conjure Animals','Conjure Minor Elementals','Conjure Woodland Beings','Conjure Celestial','Alarm','Daylight','Magic Circle','Major Image','Plant Growth','Hallucinatory Terrain','Hallow','Move Earth','Mirage Arcane','Control Weather','Symbol','Guardian of Faith','Glyph of Warding','Globe of Invulnerability','Guards and Wards','Forcecage'])expect(spellAreaFor(getSpell(name)!),name).toBeTruthy();
 });
});
function setup(name:string){
 const s=createSession('Area spell test'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);
 const c=createCharacter(s.id,{name:'Caster',className:'Wizard',level:17,maxHp:100,stats:{INT:20}});createToken({mapId:map.id,kind:'pc',refId:c.id,x:0,y:0});
 const a={...getSpell(name)!,id:'spell'};
 const target=(x:number,y:number,extra:Partial<Parameters<typeof createMonsterTemplate>[1]>={})=>{
  const t=createMonsterTemplate(s.id,{name:'Target',maxHp:500,stats:{DEX:14},...extra}),m=instantiateMonster(t.id)!;
  return {m,token:createToken({mapId:map.id,kind:'monster',refId:m.id,x,y})};
 };
 const p:SpellAreaPlacement={mapId:map.id,points:[{x:200,y:100}],angle:0};
 return {s,map,c,a,target,p};
}
describe('authoritative area combat',()=>{
 it.each([false,true])('Ice Storm separates Cold and Bludgeoning defenses (passed save=%s)',async pass=>{
  const f=setup('Ice Storm'),one=f.target(200,100,{name:'Cold resistant',resistances:['cold']}),two=f.target(250,100,{name:'Bludgeoning immune',immunities:['bludgeoning']}),outside=f.target(2000,100);
  const stages:number[][]=[];
  await runLiveCommand(()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,4,undefined,undefined,undefined,f.p)).toBe(true),()=>{}, {label:'Ice Storm',roller:'Caster',className:'Wizard'},async sides=>{
   expect(getMonster(one.m.id)!.curHp).toBe(500);stages.push(sides);return sides.map(s=>s===20?(pass?20:1):4);
  });
  expect(stages).toEqual([[10,10],[6,6,6,6],[20,20]]);
  // Raw 8 bludgeoning + 16 cold; halves apply to each type before defenses.
  expect(getMonster(one.m.id)!.curHp).toBe(pass?492:484);
  expect(getMonster(two.m.id)!.curHp).toBe(pass?492:484);
  expect(getMonster(outside.m.id)!.curHp).toBe(500);
  const fx=drainHpFx(f.s.id).find(e=>e.refId===one.m.id&&e.delta<0)!;
  expect(fx.damageParts).toEqual([{amount:pass?4:8,damageType:'bludgeoning'},{amount:pass?4:8,damageType:'cold'}]);
  expect(fx.damageParts!.reduce((sum,p)=>sum+p.amount,0)).toBe(-fx.delta);
  expect(listRollLog(f.s.id).filter(r=>r.reveal).every(r=>r.reveal!.presentedLive)).toBe(true);
  expect(listRollLog(f.s.id).some(r=>r.apply)).toBe(false);
 });
 it('counts an overlapping Meteor Swarm once per creature and includes allies',()=>{
  const f=setup('Meteor Swarm'),one=f.target(200,100);
  const p={...f.p,points:[...f.p.points,{x:210,y:100}]};
  withDiceSource(sides=>sides.map(s=>s===20?1:2),()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,9,undefined,undefined,undefined,p)).toBe(true));
  expect(getMonster(one.m.id)!.curHp).toBe(420);
 });
 it('does not hit creatures outside the cone or behind a drawn wall',()=>{
  const f=setup('Burning Hands'),near=f.target(100,0),outside=f.target(100,100),blocked=f.target(160,0);
  editMapWalls(f.s.id,f.map.id,{add:{id:'wall',ax:130,ay:-30,bx:130,by:30}});
  withDiceSource(sides=>sides.map(s=>s===20?1:3),()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,1,undefined,undefined,undefined,{...f.p,points:[{x:0,y:0}]})).toBe(true));
  expect(getMonster(near.m.id)!.curHp).toBe(491);expect(getMonster(outside.m.id)!.curHp).toBe(500);expect(getMonster(blocked.m.id)!.curHp).toBe(500);
 });
 it('refuses forged placements before any dice or HP changes',()=>{
  const f=setup('Fireball');
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,3,{...f.p,points:[{x:100000,y:0}]})).toMatch(/within/);
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,3,{...f.p,points:[{x:NaN,y:0}]})).toMatch(/Invalid/);
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,3,{...f.p,excluded:['enemy']})).toMatch(/every creature/);
  expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,3,undefined,undefined,undefined,{...f.p,points:[]})).toBe(false);
  expect(listRollLog(f.s.id)).toHaveLength(0);
 });
 it('keeps ongoing damage dormant and preserves a rotated template',()=>{
  const f=setup('Cloud of Daggers'),one=f.target(200,100);
  withDiceSource(()=>{throw new Error('No damage dice until an entry/turn trigger');},()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,2,undefined,undefined,undefined,{...f.p,angle:Math.PI/4})).toBe(true));
  expect(getMonster(one.m.id)!.curHp).toBe(500);
  expect(listMeasurements(f.map.id)[0].spellArea).toMatchObject({spec:{kind:'cube',sizeFt:5},angle:Math.PI/4});
  expect(getCharacter(f.c.id)!.conditions.some(c=>c.isConcentration)).toBe(true);
 });
 it('checks Fire Storm cube face connections rather than accepting corner contact',()=>{
  const f=setup('Fire Storm');
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,7,{...f.p,points:[{x:200,y:100},{x:300,y:100}]})).toBeUndefined();
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,7,{...f.p,points:[{x:200,y:100},{x:300,y:200}]})).toMatch(/Connect/);
  expect(areaPlacementError(f.s.id,'pc',f.c.id,f.a,7,{...f.p,angle:Math.PI/4,points:[{x:200,y:100},{x:200+100/Math.sqrt(2),y:100+100/Math.sqrt(2)}]})).toBeUndefined();
 });
 it('uses save bonuses and advantage in the group before applying damage',async()=>{
  const f=setup('Fireball'),one=f.target(200,100,{stats:{DEX:16}});
  setCondition('monster',one.m.id,{id:'haste',label:'Haste',aura:'green',isConcentration:false});
  const frames:unknown[]=[];
  await runLiveCommand(()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,{...f.a,roll:{...f.a.roll!,dc:12}},3,undefined,undefined,undefined,f.p)).toBe(true),()=>{}, {label:'Fireball',roller:'Caster',className:'Wizard'},async(sides,_publish,_meta,_seed,info)=>{
    if(info?.saveDice){frames.push(info.saveDice);expect(getMonster(one.m.id)!.curHp).toBe(500);return sides.map((_,i)=>i===0?2:10);}
    return sides.map(()=>4);
  });
  expect(frames).toEqual([[expect.objectContaining({modifier:3,mode:'adv'}),expect.objectContaining({modifier:3,mode:'adv'})]]);
  expect(getMonster(one.m.id)!.curHp).toBe(484);
 });
 it('selects only chosen creatures for Mass Cure Wounds, respecting its six-target cap',()=>{
  const f=setup('Mass Cure Wounds'),one=f.target(200,100),two=f.target(220,100);
  // Hurt the practice targets without introducing death-state rules.
  db.prepare('UPDATE monsters SET cur_hp=100 WHERE id IN (?,?)').run(one.m.id,two.m.id);
  withDiceSource(sides=>sides.map(()=>3),()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,5,undefined,undefined,undefined,{...f.p,selected:[one.token.id]})).toBe(true));
  expect(getMonster(one.m.id)!.curHp).toBe(120);expect(getMonster(two.m.id)!.curHp).toBe(100);
 });
 it('refuses more than six chosen Mass Cure Wounds recipients before casting',()=>{
  const f=setup('Mass Cure Wounds'),targets=Array.from({length:7},(_,i)=>f.target(200+i*5,100));
  withDiceSource(()=>{throw new Error('An invalid target count must not roll');},()=>expect(resolveAbilityRoll(f.s.id,'Caster',f.c,f.a,5,undefined,undefined,undefined,{...f.p,selected:targets.map(t=>t.token.id)})).toBe(false));
  expect(listRollLog(f.s.id)).toHaveLength(0);
 });
});
