import {describe,it,expect} from 'vitest';
import {hpNumbers,placeHpNumbers} from '../../client/src/lib/hpFeedback.js';
import {createSession,createCharacter,applyDamage,drainHpFx,getCharacter,setTempHp} from './sessions.js';

describe('typed floating damage feedback',()=>{
 it('separates a bow, mark and same-type thorns by color and source without duplicating damage',()=>{
  const bow=hpNumbers({kind:'monster',refId:'g',delta:-13,damageParts:[
    {amount:9,damageType:'piercing'},{amount:4,damageType:'force',spell:"Hunter's Mark"}]});
  const thorns=hpNumbers({kind:'monster',refId:'g',delta:-7,damageParts:[{amount:7,damageType:'piercing',spell:'Hail of Thorns'}]});
  expect([...bow,...thorns].map(n=>n.delta)).toEqual([-9,-4,-7]);
  expect(new Set([...bow,...thorns].map(n=>n.color)).size).toBe(3);
  expect([...bow,...thorns].map(n=>n.label)).toEqual(['Piercing',"Hunter's Mark · force",'Hail of Thorns · piercing']);
 });
 it('keeps healing green, merges same-type weapon riders and falls back from stale metadata',()=>{
  expect(hpNumbers({kind:'pc',refId:'p',delta:4})[0]).toMatchObject({delta:4,label:'Healing'});
  expect(hpNumbers({kind:'pc',refId:'p',delta:0})).toEqual([]);
  expect(hpNumbers({kind:'pc',refId:'p',delta:-5,damageParts:[{amount:3,damageType:'piercing'},{amount:2,damageType:'piercing'}]})).toHaveLength(1);
  expect(hpNumbers({kind:'pc',refId:'p',delta:-9,damageParts:[{amount:5}]}).map(n=>n.delta)).toEqual([-9]);
 });
 it('keeps damage close to its own token, even in a crowded AoE, and retains live slots',()=>{
  const items=Array.from({length:12},(_,i)=>({id:String(i),target:String(Math.floor(i/3)),x:100+Math.floor(i/3)*30,y:100}));
  const positions=placeHpNumbers(items,24,new Map());
  for(const item of items){
    const p=positions.get(item.id)!;
    expect(Math.abs(p.x-item.x)).toBeLessThanOrEqual(24*.4);
    expect(item.y-p.y).toBeLessThanOrEqual(24*2.1);
  }
  for(let i=0;i<12;i+=3)expect(new Set(items.slice(i,i+3).map(item=>positions.get(item.id)!.x)).size).toBe(3);
  const remaining=placeHpNumbers(items.slice(4),24,positions);
  for(const [id,p] of remaining)expect(p).toEqual(positions.get(id));
  const moved=placeHpNumbers(items.map(item=>({...item,x:item.x+50})),24,positions);
  for(const [id,p] of moved)expect(p.x).toBe(positions.get(id)!.x+50);
 });
 it('transmits only additive defended damage parts and applies temp HP/overkill once',()=>{
  const s=createSession('Damage component feedback'),c=createCharacter(s.id,{name:'Hero',maxHp:8});
  setTempHp('pc',c.id,3);
  applyDamage('pc',c.id,15,'piercing',false,'hit',{damageParts:[{amount:11,damageType:'piercing'},{amount:4,damageType:'force',spell:"Hunter's Mark"}]});
  const events=drainHpFx(s.id);expect(events).toHaveLength(1);expect(events[0].delta).toBe(-15);
  expect(events[0].damageParts?.reduce((sum,p)=>sum+p.amount,0)).toBe(15);
  expect(getCharacter(c.id)).toMatchObject({curHp:0,tempHp:0});
  applyDamage('pc',c.id,2,'fire',false,'bad',{damageParts:[{amount:999,damageType:'fire',spell:'Secret weapon +9'}]});
  expect(drainHpFx(s.id)[0].damageParts).toBeUndefined();
 });
});
