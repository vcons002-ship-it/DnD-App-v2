import {describe,it,expect} from 'vitest';
import {hpNumbers,hpNumberStacks,hpNumberSequence,hpTotalTimeline,hpFeedbackDuration,hpStackStart,hpStackEnd,scheduleHpFeedback} from '../../client/src/lib/hpFeedback.js';
import {createSession,createCharacter,applyDamage,drainHpFx,getCharacter,setTempHp} from './sessions.js';

describe('typed floating damage feedback',()=>{
 it('shows one red total per victim for a combined weapon, mark and thorns impact',()=>{
  const events=[{id:1,kind:'monster' as const,refId:'g',rollId:'hit',delta:-13,damageParts:[{amount:9,damageType:'piercing'},{amount:4,damageType:'force',spell:"Hunter's Mark"}]},
    {id:2,kind:'monster' as const,refId:'g',rollId:'hit',delta:-7,damageParts:[{amount:7,damageType:'piercing',spell:'Hail of Thorns'}]},
    {id:3,kind:'monster' as const,refId:'neighbor',rollId:'hit',delta:-3,damageType:'piercing',spell:'Hail of Thorns'},
    {id:4,kind:'monster' as const,refId:'g',rollId:'other-hit',delta:-2},
    {id:5,kind:'pc' as const,refId:'hero',delta:5}];
  const groups=hpNumberStacks(events);
  expect(groups[0].numbers.at(-1)).toMatchObject({delta:-20,color:'#ff5a60',total:true});
  expect(groups[0].numbers.slice(0,-1).map(n=>n.delta)).toEqual([-9,-4,-7]);
  expect(groups[0].numbers.slice(0,-1).reduce((sum,n)=>sum+n.delta,0)).toBe(groups[0].numbers.at(-1)!.delta);
  expect(groups[1].numbers).toHaveLength(2);expect(groups[1].numbers[0]).toMatchObject({delta:-3,color:'#b4f47e'});
  expect(groups[1].numbers[1]).toMatchObject({delta:-3,total:true});
  expect(hpTotalTimeline(groups[1].numbers)).toEqual([{delta:-3,delayMs:220}]);
  expect(groups[2].numbers[0].delta).toBe(-2);
  expect(groups[3].numbers[0]).toMatchObject({delta:5,color:'#62efa0'});
 });
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
 it('shows parts one at a time, accumulates the hovering total, and queues later hits only for the same token',()=>{
  const event={id:1,kind:'monster' as const,refId:'g',rollId:'hit',delta:-13,
    damageParts:[{amount:9,damageType:'piercing'},{amount:4,damageType:'force'}]};
  const numbers=hpNumberStacks([event])[0].numbers,sequence=hpNumberSequence(numbers);
  expect(sequence.map(s=>s.number.delta)).toEqual([-9,-4]);
  expect(sequence.map(s=>s.delayMs)).toEqual([0,640]);
  expect(hpTotalTimeline(numbers)).toEqual([{delta:-9,delayMs:220},{delta:-13,delayMs:860}]);
  sequence.slice(1).forEach((s,i)=>expect(s.delayMs).toBeGreaterThan(sequence[i].delayMs+sequence[i].holdMs+sequence[i].fadeMs));
  const first=scheduleHpFeedback([event],100);
  expect(first.expiryMs).toBeGreaterThan(hpFeedbackDuration(numbers));
  const next=scheduleHpFeedback([{...event,id:2,rollId:'next'},{...event,id:3,refId:'neighbor',rollId:'neighbor-hit'}],200,first.events);
  expect(next.events[0].numberStartAt).toBeGreaterThan(100+hpFeedbackDuration(numbers));
  expect(next.events[1].numberStartAt).toBe(200);
  expect(first.events[0].numberStartAt).toBe(100);
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
 it('aligns shared AoE damage after the main target weapon and mark components',()=>{
  const events=[{id:1,kind:'monster' as const,refId:'main',rollId:'burst',delta:-13,
    damageParts:[{amount:9,damageType:'piercing'},{amount:4,damageType:'force',spell:"Hunter's Mark"}]},
    ...['main','neighbor','third'].map((refId,i)=>({id:i+2,kind:'monster' as const,refId,rollId:'burst',delta:-7,damageType:'piercing',spell:'Hail of Thorns'}))];
  const scheduled=scheduleHpFeedback(events,100).events;
  expect(scheduled[0].componentStarts).toEqual([100,740]);
  expect(scheduled.slice(1).map(e=>e.numberStartAt)).toEqual([1380,1380,1380]);
  const groups=hpNumberStacks(scheduled);
  expect(groups.map(g=>hpStackStart(g.numbers,0)+hpTotalTimeline(g.numbers).at(-1)!.delayMs)).toEqual([1600,1600,1600]);
 });
 it('synchronizes a shared spell even with separate target save reveals and a busy victim',()=>{
  const old=scheduleHpFeedback([{id:1,kind:'monster' as const,refId:'a',delta:-5}],100).events;
  const cast=scheduleHpFeedback(['a','b','c'].map((refId,i)=>({id:i+2,kind:'monster' as const,refId,delta:-8,damageType:'fire',rollId:`save-${i}`,impact:{id:'fireball'}})),200,old);
  expect(new Set(cast.events.map(e=>e.numberStartAt)).size).toBe(1);
  expect(cast.events[0].numberStartAt).toBeGreaterThan(hpStackEnd(hpNumberStacks(old)[0]));
 });
 it('still animates a later manually applied target of a shared cast',()=>{
  const first=scheduleHpFeedback([{id:1,kind:'monster' as const,refId:'a',rollId:'save-a',delta:-8,damageType:'fire',impact:{id:'fireball'}}],100).events;
  const later=scheduleHpFeedback([{...first[0],id:2,refId:'b',rollId:'save-b'}],2500,first);
  expect(later.events[0].numberStartAt).toBe(2500);
  expect(first[0].numberStartAt).toBe(100);
 });
 it('keeps separately clicked projectiles in global order and accumulates repeat targets',()=>{
  const darts=['a','a','b','c','a'].map((refId,i)=>({id:i+1,kind:'monster' as const,refId,delta:-(i+2),damageType:'force',rollId:`dart-${i}`,impact:{id:'missile',order:i}}));
  const scheduled=scheduleHpFeedback(darts,100).events;
  expect(scheduled.map(e=>e.numberStartAt)).toEqual([100,740,1380,2020,2660]);
  const a=hpNumberStacks(scheduled).find(g=>g.event.refId==='a')!;
  expect(hpTotalTimeline(a.numbers)).toEqual([{delta:-2,delayMs:220},{delta:-5,delayMs:860},{delta:-11,delayMs:2780}]);
  const later=scheduleHpFeedback([{...darts[0],id:7,delta:-4,impact:{id:'missile',order:5}}],9000,scheduled);
  const merged=hpNumberStacks([...scheduled,...later.events]).find(g=>g.event.refId==='a')!;
  expect(merged.numbers.at(-1)?.delta).toBe(-15);
  expect(later.events[0].numberStartAt).toBe(9000);
  expect(hpStackEnd(merged)).toBe(13220);
 });
});
