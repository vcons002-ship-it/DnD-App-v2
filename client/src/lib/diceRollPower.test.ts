import {describe,it,expect} from 'vitest';
import {diceRollPower,createRollPowerState} from './diceRollPower';

describe('character dice power',()=>{
 it('uses each natural face maximum for d20 and every damage die',()=>{
  for(const sides of [4,6,8,10,12,20,100]){
   expect(diceRollPower(sides,1)).toEqual({known:true,strength:0,maximum:false});
   expect(diceRollPower(sides,sides)).toEqual({known:true,strength:1,maximum:true});
   expect(diceRollPower(sides,sides-1).maximum).toBe(false);
  }
  expect(diceRollPower(6,6).strength).toBeGreaterThan(diceRollPower(20,6).strength);
  expect(diceRollPower(8,7).strength).toBeGreaterThan(.8);
 });
 it('never charges unknown, invalid or still-moving results',()=>{
  for(const value of [null,undefined,0,-1,21,NaN,Infinity,1.5])expect(diceRollPower(20,value).known).toBe(false);
 });
 it('smooths power and erupts once across repeated live/result frames',()=>{
  const state=createRollPowerState(6);state.advance(0);state.setResult(6);
  const start=state.advance(10);expect(start.maximum).toBe(true);expect(start.age).toBe(0);
  for(let t=20;t<=1000;t+=20){state.setResult(6);state.advance(t);}
  const held=state.advance(1010);expect(held.revision).toBe(1);expect(held.age).toBe(1);expect(held.strength).toBeCloseTo(1,3);
  state.setResult(null);expect(state.advance(1020).maximum).toBe(false);
  state.setResult(6);expect(state.advance(1030).revision).toBe(2);
 });
 it('shares the full percentile value between its two physical halves',()=>{
  const state=createRollPowerState(10);state.setResult(1,100);
  expect(state.advance(0).maximum).toBe(true);
  state.setResult(10,90);expect(state.advance(1).maximum).toBe(false);
  state.setResult(null,100);expect(state.advance(2).known).toBe(false);
 });
});
