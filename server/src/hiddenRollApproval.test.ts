import {it,expect} from 'vitest';
import {runLiveCommand,hiddenRollNeedsApproval,type physicalFaces} from './liveRolls.js';
import {rollDice,withDiceMetadata} from '../../shared/dice.js';
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
  addRollLog(session.id,{roller:'DM',label:'DEX save',expr:'1d20',total:4,detail:'Failed save',reveal:{kind:'check',attacker:'Hero',outcome:'fail'}});
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
 expect(listRollLog(session.id)).toHaveLength(apply?2:0);expect(drainHpFx(session.id)).toHaveLength(apply?1:0);
});

for(const kind of ['attack','damage'] as const)it(`hidden ${kind} resolves without a redundant DM confirmation`,async()=>{
 const session=createSession('Automatic hidden attack'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 let reviews=0;
 const dice:typeof physicalFaces=async()=>[4];
 await runLiveCommand(()=>{
  const roll=rollDice('1d6+2')!;applyDamage('pc',hero.id,roll.total);
  addRollLog(session.id,{roller:'DM',label:'Attack damage',expr:roll.expr,total:roll.total,detail:roll.detail,reveal:{kind,attacker:'Goblin',target:'Hero',outcome:'hit',damage:roll.total}});
 },()=>{},{label:'Attack damage',roller:'DM',className:'',review:async()=>{reviews++;return false;}},dice);
 expect(reviews).toBe(0);expect(getCharacter(hero.id)!.curHp).toBe(34);expect(listRollLog(session.id)).toHaveLength(1);
});

it('requires approval for checks, plain rolls and attacks with a saving-throw rider',()=>{
 const result=(kind?:'attack'|'damage'|'check'|'dice')=>({label:'Private result',total:10,detail:'Result',...(kind?{reveal:{kind,attacker:'DM',outcome:'none' as const}}:{})});
 expect(hiddenRollNeedsApproval([result('attack'),result('damage')])).toBe(false);
 for(const kind of ['check','dice',undefined] as const)expect(hiddenRollNeedsApproval([result(kind)])).toBe(true);
 expect(hiddenRollNeedsApproval([result('attack'),result('damage'),result('check')])).toBe(true);
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

it('rejecting rerolls the pending save with the same dice and keeps earlier damage',async()=>{
 const session=createSession('Reroll save'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 let reviews=0;const calls:number[][]=[];
 const dice:typeof physicalFaces=async sides=>{calls.push(sides);return sides.map(()=>sides[0]===6?5:calls.length===2?2:18);};
 await runLiveCommand(()=>{
  const damage=rollDice('1d6')!;
  const save=withDiceMetadata({label:'DEX Saving Throw'},()=>rollDice('1d20'))!;
  applyDamage('pc',hero.id,save.total>=12?2:damage.total);
  addRollLog(session.id,{roller:'DM',label:'Damage',expr:'1d6',total:damage.total,detail:damage.detail,reveal:{kind:'damage',attacker:'DM',outcome:'none',damage:damage.total}});
  addRollLog(session.id,{roller:'DM',label:'DEX save',expr:'1d20',total:save.total,detail:save.detail,reveal:{kind:'check',attacker:'Hero',d20:save.total,outcome:save.total>=12?'pass':'fail'}});
 },()=>{},{label:'Save-dependent damage',roller:'DM',className:'',review:async(results,plans)=>{
  expect(getCharacter(hero.id)!.curHp).toBe(40);expect(listRollLog(session.id)).toHaveLength(0);
  expect(plans).toHaveLength(1);expect(plans[0].sides).toEqual([20]);
  expect(results[0].total).toBe(5);reviews++;
  return {action:reviews===1?'reroll':'apply'};
 }},dice);
 expect(calls).toEqual([[6],[20],[20]]);expect(reviews).toBe(2);expect(getCharacter(hero.id)!.curHp).toBe(38);
});

it('manual save totals recalculate pass/fail and damage before separate approval',async()=>{
 const session=createSession('Manual save'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 let reviews=0,rolls=0;
 const dice:typeof physicalFaces=async()=>{rolls++;return [4];};
 await runLiveCommand(()=>{
  const result=rollDice('1d20')!,total=result.total+3,pass=total>=15;
  applyDamage('pc',hero.id,pass?2:8);
  addRollLog(session.id,{roller:'DM',label:'DEX save',expr:'1d20',total,detail:`${result.total} + 3 = ${total}`,reveal:{kind:'check',attacker:'Hero',d20:result.total,outcome:pass?'pass':'fail'}});
 },()=>{},{label:'Save',roller:'DM',className:'',review:async(results,plans,manual)=>{
  expect(getCharacter(hero.id)!.curHp).toBe(40);expect(listRollLog(session.id)).toHaveLength(0);reviews++;
  expect(plans[0].bonus).toBe(3);
  if(reviews===1)return {action:'manual',faces:[{index:0,values:[15]}]};
  expect(manual).toBe(true);expect(results[0]).toMatchObject({total:18,reveal:{outcome:'pass'}});
  return {action:'apply'};
 }},dice);
 expect(rolls).toBe(1);expect(reviews).toBe(2);expect(getCharacter(hero.id)!.curHp).toBe(38);
 expect(listRollLog(session.id)[0]).toMatchObject({total:18,detail:'15 + 3 = 18',reveal:{kind:'check',d20:15,outcome:'pass'}});
});

it('rejects invalid manual faces without applying an outcome',async()=>{
 const session=createSession('Invalid manual save');
 const dice:typeof physicalFaces=async()=>[4];
 await expect(runLiveCommand(()=>{
  const r=rollDice('1d20')!;addRollLog(session.id,{roller:'DM',label:'Save',expr:r.expr,total:r.total,detail:r.detail});
 },()=>{},{label:'Save',roller:'DM',className:'',review:async()=>({action:'manual',faces:[{index:0,values:[21]}]})},dice)).rejects.toThrow('Invalid manual die result');
 expect(listRollLog(session.id)).toHaveLength(0);
});
