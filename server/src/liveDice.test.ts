import {createSession,createCharacter,createMap,setActiveMap,createToken,createMonsterTemplate,instantiateMonster,setManualDamage,listRollLog,getMonster,getRollEntry,getCharacter} from './sessions.js';
import {resolveAttack,resolveAttackDamage,resolveSmite} from './combat.js';
import {buildSnapshot} from './visibility.js';
import {describe,it,expect} from 'vitest';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';
import {rollDice,rollDicePool,withDiceSource} from '../../shared/dice.js';
import {rollD20Detail} from '../../shared/combatMath.js';
import {db} from './db.js';
import {runLiveCommand,keptPhysicalSet,physicalFaces} from './liveRolls.js';
import {afterRollCommit} from './liveRollContext.js';
import {LIVE_DICE_PRESENTATION_RATE,LIVE_DICE_REROLL_WAIT_SECONDS} from '../../shared/liveDiceTypes.js';

it('uses authoritative faces for expressions, advantage and d20 combat math',()=>{
 expect(withDiceSource(s=>s.map((_,i)=>i+2),()=>rollDice('2d6+3'))?.total).toBe(8);
 expect(withDiceSource(()=>[2,19],()=>rollD20Detail('adv')).face).toBe(19);
 expect(withDiceSource(()=>[2,19],()=>rollD20Detail('dis')).face).toBe(2);
 expect(withDiceSource(()=>{throw new Error('invalid expressions must not roll');},()=>rollDice('bad'))).toBeNull();
});
it('groups mixed normal and crit damage without doubling flat modifiers',()=>{
 const requests:any[]=[];
 const rolls=withDiceSource((sides,info)=>{requests.push({sides,info});return [3,4,5,6];},()=>rollDicePool([
  {expr:'1d8+2'},{expr:'1d8',critical:true},{expr:'1d6'},{expr:'1d6',critical:true},
 ]));
 expect(requests).toHaveLength(1);
 expect(requests[0].sides).toEqual([8,8,6,6]);
 expect(requests[0].info.criticalDice).toEqual([false,true,false,true]);
 expect(rolls.map(r=>r?.total)).toEqual([5,4,5,6]);
 expect(()=>withDiceSource(()=>[1],()=>rollDicePool([{expr:'2d6'}]))).toThrow('Invalid authoritative');
});
it('streams normal and gold critical dice together in the same live world',async()=>{
 const frames:any[]=[];
 const values=await physicalFaces([6,6,6,6],f=>frames.push(f),{label:'Critical damage',roller:'Druk',className:'Fighter'},42,
  {expr:'2d6+2d6',criticalDice:[false,false,true,true]});
 expect(new Set(frames.map(f=>f.id)).size).toBe(1);
 expect(frames[0].sides).toEqual([6,6,6,6]);
 expect(frames[0].values).toEqual([null,null,null,null]);
 expect(frames.every(f=>JSON.stringify(f.critical)==='[false,false,true,true]')).toBe(true);
 expect(frames.at(-1).values).toEqual(values);
},20000);
describe('incremental authoritative physics',()=>{
 it('releases jumbled dice with visible end-over-end and sideways tumble from every seat',()=>{
  for(const side of ['bottom','top','left','right'] as const)for(let seed=1;seed<=12;seed++){
   const w=createLiveWorld([{sides:6,value:1,index:0,set:0}],seed,side),b=w.bodies[0];
   const heading=b.velocity.clone();heading.z=0;heading.normalize();
   const crossSpin=b.angularVelocity.cross(heading).length();
   expect(crossSpin).toBeGreaterThan(20);
   expect(Math.abs(b.angularVelocity.dot(heading))).toBeGreaterThan(5);
   expect(b.angularVelocity.length()).toBeLessThan(50);
   const q=b.quaternion.clone();w.advance(.025);
   const dot=Math.abs(q.x*b.quaternion.x+q.y*b.quaternion.y+q.z*b.quaternion.z+q.w*b.quaternion.w);
   expect(2*Math.acos(Math.min(1,dot))).toBeGreaterThan(.5);
   expect(w.snapshot().done).toBe(false);
  }
 });
 for(const sides of [4,6,8,10,12,20])it(`reads fixed d${sides} faces and visibly rethrows unreadable dice`,()=>{
  const world=createLiveWorld([{sides,value:1,index:0,set:0}],42);
  expect(world.snapshot().done).toBe(false);
  let f=world.snapshot();for(let i=0;i<120*40&&!f.done;i++)f=world.advance(1/120);
  expect(f.done).toBe(true);expect(f.values[0]).toBeGreaterThanOrEqual(1);expect(f.values[0]).toBeLessThanOrEqual(sides);
  world.reroll(0);expect(world.snapshot().values[0]).toBeNull();expect(world.snapshot().rerolls[0]).toBeGreaterThan(0);
 });
 it('advances 40 dice without needing a completed trajectory',()=>{
  const w=createLiveWorld(Array.from({length:40},(_,index)=>({sides:6,value:1,index,set:0})),42);
  const a=w.snapshot(),b=w.advance(1/30);expect(b.poses).not.toEqual(a.poses);expect(b.done).toBe(false);
  let f=b;for(let i=0;i<120*40&&!f.done;i++)f=w.advance(1/120);expect(f.done).toBe(true);
 });
});
it('holds writes and effects until the streamed faces settle, then commits once',async()=>{
 db.exec('CREATE TEMP TABLE live_probe (n INTEGER)');const frames:any[]=[];let effects=0;let value=0;
 try{
 await runLiveCommand(()=>{db.prepare('INSERT INTO live_probe VALUES (1)').run();value=rollDice('1d6')!.total;afterRollCommit(()=>effects++);},f=>{
  frames.push(f);expect(db.prepare('SELECT COUNT(*) n FROM live_probe').get()).toEqual({n:0});expect(effects).toBe(0);
 },{label:'Test',roller:'Tester',className:''});
 expect(frames.length).toBeGreaterThan(2);expect(frames[0].values).toEqual([null]);expect(frames.at(-1).values).toEqual([value]);
 expect(db.prepare('SELECT COUNT(*) n FROM live_probe').get()).toEqual({n:1});expect(effects).toBe(1);
 }finally{db.exec('DROP TABLE live_probe');}
},20000);

it('rerolls only the unreadable die, keeping the other die in the live world',()=>{
 const w=createLiveWorld([6,6].map((sides,index)=>({sides,value:1,index,set:0})),17);
 w.bodies[0].position.z=20;w.bodies[0].sleep();w.advance(1/120);
 expect(w.snapshot().rerolls).toEqual([1,0]);expect(w.snapshot().values[0]).toBeNull();
});
it('holds a manual critical hit until damage click, rolls real damage then applies once',async()=>{
 const session=createSession('Live manual damage');const map=createMap(session.id,{name:'Test'});setActiveMap(session.id,map.id);setManualDamage(session.id,true);
 const pc=createCharacter(session.id,{name:'Fighter',className:'Fighter',stats:{STR:16},weapons:[{name:'Sword',kind:'melee',damage:'1d8',damageType:'slashing',attackBonus:100}]});
 const template=createMonsterTemplate(session.id,{name:'Target',maxHp:100,armorClass:1});const monster=instantiateMonster(template.id)!;
 const a=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:50,y:50}),b=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:100,y:50});
 const requests:number[][]=[];const dice=async(sides:number[])=>{requests.push(sides);return sides.map(s=>s===20?20:4);};
 const meta={label:'Test',roller:'Fighter',className:'Fighter'};
 await runLiveCommand(()=>{resolveAttack(session.id,'Fighter',a.id,b.id,0,undefined,false,false,pc.id);},()=>{},meta,dice);
 expect(requests).toEqual([[20]]);expect(getMonster(monster.id)?.curHp).toBe(100);
 const hit=listRollLog(session.id).at(-1)!;expect(hit.pending?.live).toBeTruthy();expect(hit.pending?.dice).toEqual([]);
 expect(buildSnapshot(session.id,'dm',map.id,'test')?.rollLog.at(-1)?.pending?.live).toBeUndefined();
 await runLiveCommand(()=>{resolveAttackDamage(session.id,'Fighter',hit.id);},()=>{},meta,dice);
 const result=listRollLog(session.id).find(e=>e.label==='Damage')!;
 expect(requests).toEqual([[20],[8,8]]);expect(result.total).toBe(11);expect(getMonster(monster.id)?.curHp).toBe(89);
 expect(getRollEntry(hit.id,session.id)?.pending?.done).toBe(true);
 await runLiveCommand(()=>{resolveAttackDamage(session.id,'Fighter',hit.id);},()=>{},meta,dice);
 expect(getMonster(monster.id)?.curHp).toBe(89);expect(requests).toHaveLength(2);
});

it('never substitutes random values for a missing or invalid physical result',()=>{
  expect(()=>withDiceSource(()=>[],()=>rollDice('1d6'))).toThrow('Invalid authoritative');
  expect(()=>withDiceSource(()=>[7],()=>rollDice('1d6'))).toThrow('Invalid authoritative');
  expect(keptPhysicalSet([6,6,5,1],{expr:'1d6-1d6',advantage:'adv'})).toBe(1);
  expect(keptPhysicalSet([10,80],{expr:'1d100',advantage:'dis'})).toBe(0);
});
it('automatically rerolls a continuously moving die after four presentation seconds',()=>{
  const w=createLiveWorld([{sides:6,value:1,index:0,set:0}],8);
  const holdMoving=()=>{
    w.bodies[0].wakeUp();w.bodies[0].velocity.z=5;w.bodies[0].position.z=4;
    w.advance(1/120);
  };
  for(let i=0;i<120*(LIVE_DICE_REROLL_WAIT_SECONDS*LIVE_DICE_PRESENTATION_RATE-.05);i++)holdMoving();
  expect(w.snapshot().rerolls[0]).toBe(0);
  for(let i=0;i<12&&!w.snapshot().rerolls[0];i++)holdMoving();
  expect(w.snapshot().rerolls[0]).toBe(1);expect(w.snapshot().values[0]).toBeNull();
  expect(w.snapshot().elapsed/LIVE_DICE_PRESENTATION_RATE).toBeCloseTo(4,1);
});
it.each([5,11,13,32])('accepts flat Heat Metal d8s despite resting contact jitter (seed %i)',seed=>{
 const w=createLiveWorld([8,8].map((sides,index)=>({sides,value:1,index,set:0})),seed);
 let f=w.snapshot();for(let i=0;i<120*8&&!f.done;i++)f=w.advance(1/120);
 expect(f.done).toBe(true);expect(f.rerolls).toEqual([0,0]);
 expect(f.values.every(v=>v!==null&&v>=1&&v<=8)).toBe(true);
});
it('still rejects a stationary cocked d8 rather than assigning its nearest face',()=>{
 const w=createLiveWorld([{sides:8,value:1,index:0,set:0}],42),b=w.bodies[0];
 b.quaternion.setFromEuler(Math.PI/6,0,0);
 const shape=b.shapes[0] as import('cannon-es').ConvexPolyhedron;
 b.position.set(0,0,-Math.min(...shape.vertices.map(v=>b.quaternion.vmult(v).z)));b.sleep();w.advance(1/120);
 expect(w.snapshot().rerolls).toEqual([1]);expect(w.snapshot().values).toEqual([null]);
});
it('does not reroll or repay an attack maneuver on the later damage click',async()=>{
 const session=createSession('Live precision');const map=createMap(session.id,{name:'Test'});setActiveMap(session.id,map.id);setManualDamage(session.id,true);
 const pc=createCharacter(session.id,{name:'Fighter',className:'Fighter',stats:{STR:16},resources:{'Superiority Dice':{max:4,used:0}},weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}],sheetAbilities:[{id:'precision',name:'Precision Attack',type:'maneuver',description:'Add to the attack.',maneuver:{active:true,addDieTo:'attack'}}]});
 const template=createMonsterTemplate(session.id,{name:'Target',maxHp:100,armorClass:1});const monster=instantiateMonster(template.id)!;
 const a=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:50,y:50}),b=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:100,y:50});
 const requests:number[][]=[];const dice=async(sides:number[])=>{requests.push(sides);return sides.map(()=>4);};
 const meta={label:'Test',roller:'Fighter',className:'Fighter'};
 await runLiveCommand(()=>{resolveAttack(session.id,'Fighter',a.id,b.id,0);},()=>{},meta,dice);
 const hit=listRollLog(session.id).at(-1)!;
 expect(requests).toEqual([[8],[20]]);expect(getCharacter(pc.id)?.resources['Superiority Dice'].used).toBe(1);
 await runLiveCommand(()=>{resolveAttackDamage(session.id,'Fighter',hit.id);},()=>{},meta,dice);
 expect(requests).toEqual([[8],[20],[6]]);expect(getCharacter(pc.id)?.resources['Superiority Dice'].used).toBe(1);
 expect(getMonster(monster.id)?.curHp).toBe(93);
});

it('keeps live weapon and Smite damage atomic, and refuses invalid choices before rolling',async()=>{
 const session=createSession('Live smite');const map=createMap(session.id,{name:'Test'});setActiveMap(session.id,map.id);setManualDamage(session.id,false);
 const pc=createCharacter(session.id,{name:'Paladin',className:'Paladin',level:3,stats:{STR:16},spellSlots:{L1:{max:2,used:0}},weapons:[{name:'Sword',kind:'melee',damage:'1d8',attackBonus:100}],sheetAbilities:[{id:'smite',name:'Divine Smite',type:'spell',level:1,description:'Radiant damage on a hit.',smite:{dice:'2d8',damageType:'radiant'}}]});
 const target=createCharacter(session.id,{name:'Target',maxHp:20,curHp:1,armorClass:1});
 const a=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:50,y:50}),b=createToken({mapId:map.id,kind:'pc',refId:target.id,x:100,y:50});
 const requests:number[][]=[];const dice=async(sides:number[])=>{requests.push(sides);expect(getCharacter(target.id)?.curHp).toBe(1);expect(getCharacter(pc.id)?.spellSlots.L1.used).toBe(0);return sides.map(s=>s===20?20:4);};
 const meta={label:'Test',roller:'Paladin',className:'Paladin'};
 await runLiveCommand(()=>{resolveAttack(session.id,'Paladin',a.id,b.id,0);},()=>{},meta,dice);
 const hit=listRollLog(session.id).at(-1)!;
 await runLiveCommand(()=>{expect(resolveSmite(session.id,'Paladin',hit.id,9).ok).toBe(false);},()=>{},meta,dice);
 expect(requests).toEqual([[20]]);
 await runLiveCommand(()=>{expect(resolveSmite(session.id,'Paladin',hit.id,1).ok).toBe(true);},()=>{},meta,dice);
 expect(getCharacter(pc.id)?.spellSlots.L1.used).toBe(1);
 expect(getCharacter(target.id)?.deathSaves.failures).toBe(3);
 expect(listRollLog(session.id).find(e=>e.label==='Damage')?.total).toBe(27);
});
