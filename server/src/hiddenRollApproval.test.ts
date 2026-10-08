import {it,expect} from 'vitest';
import {runLiveCommand,type physicalFaces} from './liveRolls.js';
import {rollDice} from '../../shared/dice.js';
import {afterRollCommit} from './liveRollContext.js';
import {createSession,createCharacter,getCharacter,applyDamage,setResource,addRollLog,listRollLog,drainHpFx} from './sessions.js';

for(const apply of [false,true])it(`hidden result ${apply?'approval':'cancellation'} is atomic and uses the same rolled faces`,async()=>{
 const session=createSession('Secret approval'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 setResource(hero.id,'resources','Test uses',{max:3,used:0});
 let rolls=0,effects=0,reviews=0;
 const dice:typeof physicalFaces=async()=>{rolls++;return [4];};
 await runLiveCommand(()=>{
  const roll=rollDice('1d6+2')!;
  applyDamage('pc',hero.id,roll.total);setResource(hero.id,'resources','Test uses',{used:1});
  addRollLog(session.id,{roller:'DM',label:'Secret damage',expr:roll.expr,total:roll.total,detail:roll.detail,reveal:{kind:'damage',attacker:'Goblin',target:'Hero',outcome:'none',damage:roll.total}});
  afterRollCommit(()=>effects++);
 },()=>{},{label:'Secret damage',roller:'DM',className:'',review:async results=>{
  reviews++;expect(getCharacter(hero.id)!.curHp).toBe(40);
  expect(getCharacter(hero.id)!.resources['Test uses'].used).toBe(0);
  expect(listRollLog(session.id)).toHaveLength(0);expect(effects).toBe(0);expect(drainHpFx(session.id)).toHaveLength(0);
  expect(results[0]).toMatchObject({label:'Secret damage',total:6,reveal:{damage:6}});
  return apply;
 }},dice);
 expect(rolls).toBe(1);expect(reviews).toBe(1);expect(effects).toBe(apply?1:0);
 expect(getCharacter(hero.id)!.curHp).toBe(apply?34:40);
 expect(getCharacter(hero.id)!.resources['Test uses'].used).toBe(apply?1:0);
 expect(listRollLog(session.id)).toHaveLength(apply?1:0);expect(drainHpFx(session.id)).toHaveLength(apply?1:0);
});

it('refuses to apply a different result after approval without rerolling',async()=>{
 const session=createSession('Changed review');let bonus=2,rolls=0;
 const dice:typeof physicalFaces=async()=>{rolls++;return [4];};
 await expect(runLiveCommand(()=>{
  const roll=rollDice('1d6')!,total=roll.total+bonus;
  addRollLog(session.id,{roller:'DM',label:'Private check',expr:roll.expr,total,detail:`${roll.total} + ${bonus} = ${total}`});
 },()=>{},{label:'Private check',roller:'DM',className:'',review:async()=>{bonus=5;return true;}},dice)).rejects.toThrow('hidden roll context changed');
 expect(rolls).toBe(1);expect(listRollLog(session.id)).toHaveLength(0);
});
