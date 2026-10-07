import {it,expect} from 'vitest';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';
import {rollDice,withDiceMetadata} from '../../shared/dice.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import {physicalFaces,runLiveCommand} from './liveRolls.js';
import {sorcerousBonus} from './linkedSpells.js';

const die={sides:8,value:1,index:0,set:0};
const settle=(world:ReturnType<typeof createLiveWorld>)=>{
 for(let i=0;i<3000&&!world.snapshot().done;i++)world.advance(1/120);
 expect(world.snapshot().done).toBe(true);return world.snapshot();
};
it('adds physical dice without moving or rereading the original settled faces',()=>{
 const world=createLiveWorld([die],1,'bottom',4),first=settle(world);
 expect(first.values).toEqual([8]);
 world.appendDice([{...die,index:1}]);
 expect(world.snapshot().values).toEqual([8,null]);
 const second=settle(world);
 expect(second.values).toEqual([8,8]);expect(second.poses.slice(0,7)).toEqual(first.poses);
 expect(second.trayScale).toBe(first.trayScale);expect(second.elapsed).toBeGreaterThan(first.elapsed);
 world.appendDice([{...die,index:2}]);const third=settle(world);
 expect(third.values).toEqual([8,8,5]);expect(third.poses.slice(0,14)).toEqual(second.poses);
 expect(()=>world.appendDice([die,die])).toThrow('Unsupported');
});
it('rejects insertion while a die is still rolling',()=>{
 const world=createLiveWorld([die],1,'bottom',4);
 expect(()=>world.appendDice([die])).toThrow('Finish the current throw');
});
it('keeps recursive Burst rolls, parent links and monotonically ordered frames in one tray',async()=>{
 const frames:LiveDiceFrame[]=[];let result:number[]=[];
 await runLiveCommand(()=>{
  const initial=withDiceMetadata({triggerRule:{kind:'sorcerous-burst',used:0,limit:3,queued:0}},()=>rollDice('1d8'))!;
  const extra=sorcerousBonus({spell:'Sorcerous Burst',abilityId:'burst',casterKind:'pc',casterId:'test',castLevel:0,dc:15,modifier:3},initial.rolls);
  result=[...initial.rolls,...extra.flatMap(r=>r.rolls)];
 },frame=>frames.push(frame),{label:'Burst',roller:'Vanec',className:'Sorcerer',waitForPresentation:async()=>{}},
 (sides,publish,meta,_seed,info)=>physicalFaces(sides,publish,meta,1,info));
 expect(result).toEqual([8,8,5]);
 expect(new Set(frames.map(f=>f.id)).size).toBe(1);
 expect(frames.every((f,i)=>i===0||f.seq>frames[i-1].seq)).toBe(true);
 const final=frames.at(-1)!;
 expect(final.values).toEqual(result);expect(final.burstLinks).toEqual([{from:0,to:1},{from:1,to:2}]);
 expect(final.burstProgress).toEqual({used:2,limit:3});expect(final.burstCapacity).toBe(4);
 expect(frames.find(f=>f.done&&f.sides.length===2)?.diceTrigger?.groups).toEqual([{value:8,indices:[1]}]);
 const initial=frames.find(f=>f.done)!;
 expect(frames.filter(f=>f.sides.length>1).every(f=>JSON.stringify(f.poses.slice(0,7))===JSON.stringify(initial.poses))).toBe(true);
},20000);
