import {describe,it,expect} from 'vitest';
import {liveNaturalCritical,physicalRollTimeline} from './diceFinaleTiming';
import {drukFinaleAge,DRUK_EXPLOSION_DELAY} from './diceRollPower';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
const frame={done:true,label:'Halberd — Attack Roll',sides:[20,20],values:[20,14],sets:[0,1],mode:'dis',kept:1} as LiveDiceFrame;
describe('natural critical and molten finale timing',()=>{
 it('announces only a confirmed kept natural attack 20, before arithmetic exists',()=>{
  expect(liveNaturalCritical({...frame,mode:'adv',kept:0})).toBe(true);
  expect(liveNaturalCritical({...frame,mode:'adv',kept:0,label:'Chromatic Orb — Spell Attack Roll'})).toBe(true);
  expect(liveNaturalCritical(frame)).toBe(false);
  expect(liveNaturalCritical({...frame,done:false,kept:0})).toBe(false);
  expect(liveNaturalCritical({...frame,mode:undefined,values:[14,14]})).toBe(false);
  expect(liveNaturalCritical({...frame,kept:0,label:'WIS Saving Throw'})).toBe(false);
  expect(liveNaturalCritical({...frame,kept:0,label:'Initiative'})).toBe(false);
 });
 it('keeps the shell intact for long reading holds, then bursts one second before impact',()=>{
  expect(drukFinaleAge(30,30000,null)).toBeLessThan(DRUK_EXPLOSION_DELAY);
  const reveal={kind:'attack',outcome:'crit',d20:20,attacker:'Druk',toHit:[{label:'STR',value:5},{label:'PROF',value:3}]} as const;
  const timing=physicalRollTimeline({...reveal,toHit:[...reveal.toHit]},true,true);
  expect(timing.complete).toBe(2000);expect(timing.impact).toBe(3200);
  const explosionAt=10000+timing.impact-1000;
  expect(drukFinaleAge(10,explosionAt-1,explosionAt)).toBeLessThan(DRUK_EXPLOSION_DELAY);
  expect(drukFinaleAge(10,explosionAt,explosionAt)).toBe(DRUK_EXPLOSION_DELAY);
  expect(drukFinaleAge(11,explosionAt+1000,explosionAt)).toBe(DRUK_EXPLOSION_DELAY+1);
 });
 it('keeps unmodified damage readable after its number flights',()=>{
  const reveal={kind:'damage',outcome:'hit',attacker:'Druk'} as const;
  expect(physicalRollTimeline(reveal,true,true).impact).toBe(2500);
  expect(physicalRollTimeline(reveal,true,false).impact).toBe(2500);
 });
});
