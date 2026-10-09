import {it,expect} from 'vitest';
import {runLiveCommand,hiddenRollNeedsApproval,type physicalFaces} from './liveRolls.js';
import {rollDice,withDiceMetadata} from '../../shared/dice.js';
import {afterRollCommit} from './liveRollContext.js';
import {createSession,createCharacter,getCharacter,applyDamage,setResource,addRollLog,listRollLog,drainHpFx} from './sessions.js';
import {createMap,setActiveMap,createToken,setManualDamage,createMonsterTemplate,instantiateMonster,getMonster} from './sessions.js';
import {resolveAbilityRoll,resolveAttack,resolveAttackDamage} from './combat.js';
import {getSpell} from './spells/srd.js';

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

it('standalone hidden damage resolves without a redundant DM confirmation',async()=>{
 const session=createSession('Automatic hidden attack'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 let reviews=0;
 const dice:typeof physicalFaces=async()=>[4];
 await runLiveCommand(()=>{
  const roll=rollDice('1d6+2')!;applyDamage('pc',hero.id,roll.total);
  addRollLog(session.id,{roller:'DM',label:'Attack damage',expr:roll.expr,total:roll.total,detail:roll.detail,reveal:{kind:'damage',attacker:'Goblin',target:'Hero',outcome:'none',damage:roll.total}});
 },()=>{},{label:'Attack damage',roller:'DM',className:'',review:async()=>{reviews++;return false;}},dice);
 expect(reviews).toBe(0);expect(getCharacter(hero.id)!.curHp).toBe(34);expect(listRollLog(session.id)).toHaveLength(1);
});

it('requires approval for hidden attacks, checks, plain rolls and saving-throw riders',()=>{
 const result=(kind?:'attack'|'damage'|'check'|'dice')=>({label:'Private result',total:10,detail:'Result',...(kind?{reveal:{kind,attacker:'DM',outcome:'none' as const}}:{})});
 expect(hiddenRollNeedsApproval([result('damage')])).toBe(false);
 for(const kind of ['attack','check','dice',undefined] as const)expect(hiddenRollNeedsApproval([result(kind)])).toBe(true);
 expect(hiddenRollNeedsApproval([result('attack'),result('damage'),result('check')])).toBe(true);
});

for(const apply of [false,true])it(`a private attack can reroll and enter a result before ${apply?'acceptance':'discard'}`,async()=>{
 const session=createSession('Private attack'),hero=createCharacter(session.id,{name:'Hero',maxHp:40});
 let reviews=0,rolls=0;
 await runLiveCommand(()=>{
  const die=rollDice('1d20')!,total=die.total+5,hit=total>=12;
  if(hit)applyDamage('pc',hero.id,7);
  addRollLog(session.id,{roller:'DM',label:'Attack',expr:'Scimitar',total,detail:die.detail,
   reveal:{kind:'attack',attacker:'Goblin',target:'Hero',d20:die.total,attackTotal:total,outcome:die.total===20?'crit':hit?'hit':'miss'}});
 },()=>{},{label:'Attack',roller:'DM',className:'',review:async(results,plans,manual)=>{
  expect(getCharacter(hero.id)!.curHp).toBe(40);expect(listRollLog(session.id)).toEqual([]);reviews++;
  expect(plans).toHaveLength(1);expect(plans[0].bonus).toBe(5);
  if(reviews===1){expect(results[0].reveal?.outcome).toBe('miss');return {action:'reroll'};}
  if(reviews===2){expect(results[0].reveal?.outcome).toBe('hit');return {action:'manual',faces:[{index:0,values:[20]}]};}
  expect(manual).toBe(true);expect(results[0]).toMatchObject({total:25,reveal:{outcome:'crit'}});
  return {action:apply?'apply':'discard'};
 }},async()=>[++rolls===1?2:15]);
 expect(rolls).toBe(2);expect(reviews).toBe(3);
 expect(getCharacter(hero.id)!.curHp).toBe(apply?33:40);expect(listRollLog(session.id)).toHaveLength(apply?1:0);
});

it('reviews a real two-step attack once and does not review its refreshed row on the damage click',async()=>{
 const session=createSession('Private two-step attack'),map=createMap(session.id,{name:'Arena'});
 setActiveMap(session.id,map.id);setManualDamage(session.id,true);
 const hero=createCharacter(session.id,{name:'Hero',className:'Fighter',stats:{STR:16},weapons:[{name:'Sword',kind:'melee',damage:'1d8',attackBonus:100}]});
 const monster=instantiateMonster(createMonsterTemplate(session.id,{name:'Target',maxHp:100,armorClass:1}).id)!;
 const attacker=createToken({mapId:map.id,kind:'pc',refId:hero.id,x:50,y:50});
 const target=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:100,y:50});
 let reviews=0;const requests:number[][]=[];
 const meta={label:'Attack',roller:'DM',className:'',review:async()=>{reviews++;expect(getMonster(monster.id)!.curHp).toBe(100);return true;}};
 const dice:typeof physicalFaces=async sides=>{requests.push(sides);return sides.map(s=>s===20?12:4);};
 await runLiveCommand(()=>resolveAttack(session.id,'DM',attacker.id,target.id,0),()=>{},meta,dice);
 const hit=listRollLog(session.id).at(-1)!;expect(reviews).toBe(1);expect(hit.pending?.live).toBeTruthy();expect(hit.pending?.done).not.toBe(true);
 await runLiveCommand(()=>resolveAttackDamage(session.id,'DM',hit.id),()=>{},meta,dice);
 expect(reviews).toBe(1);expect(requests).toEqual([[20],[8]]);
 expect(getMonster(monster.id)!.curHp).toBe(93);expect(listRollLog(session.id).at(-1)!.label).toBe('Damage');
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

it('reviews and replaces the saving throw total for a real zero-damage control spell',async()=>{
 const session=createSession('Private Hold Person'),map=createMap(session.id,{name:'Arena'});
 setActiveMap(session.id,map.id);setManualDamage(session.id,false);
 const caster=createCharacter(session.id,{name:'Mage',className:'Wizard',level:3,stats:{INT:16}});
 const target=createCharacter(session.id,{name:'Hero',className:'Fighter',maxHp:40,stats:{WIS:10}});
 const token=createToken({mapId:map.id,kind:'pc',refId:target.id,x:100,y:100});
 let reviews=0;
 await runLiveCommand(()=>{
  resolveAbilityRoll(session.id,'DM',getCharacter(caster.id)!,{...getSpell('Hold Person')!,id:'hold'},2,undefined,token.id);
 },()=>{},{label:'Hold Person',roller:'DM',className:'',review:async(results,plans,manual)=>{
  expect(getCharacter(target.id)!.conditions).toEqual([]);expect(listRollLog(session.id)).toEqual([]);
  const save=results.find(r=>r.reveal?.kind==='check')!;reviews++;
  expect(plans[0].bonus).toBe(0);
  if(reviews===1){
   expect(save).toMatchObject({total:18,reveal:{outcome:'pass',attackTotal:18}});
   return {action:'manual',faces:[{index:plans[0].index,values:[3]}]};
  }
  expect(manual).toBe(true);expect(save).toMatchObject({total:3,reveal:{outcome:'fail',attackTotal:3}});
  return {action:'apply'};
 }},async()=>[18]);
 expect(reviews).toBe(2);expect(getCharacter(target.id)!.conditions.map(c=>c.label)).toContain('Paralyzed');
 // The persisted log still uses its established applied-damage convention.
 expect(listRollLog(session.id).find(r=>r.label==='WIS save')).toMatchObject({total:0,reveal:{attackTotal:3,outcome:'fail'}});
});
