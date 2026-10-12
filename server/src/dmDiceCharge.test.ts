import {describe,it,expect} from 'vitest';
import {dmDiceCharge} from '../../client/src/lib/dmDiceCharge.js';
import {diceRollPower} from '../../client/src/lib/diceRollPower.js';

const charge=(sides:number,value:number,seconds=5,seed=0)=>{
 const power=diceRollPower(sides,value);
 return dmDiceCharge(power.strength,power.known,power.maximum,1,seconds,seed);
};
describe('DM resin red charge',()=>{
 it('stays purple for unknown rolls and low natural faces',()=>{
  expect(dmDiceCharge(1,false,true,10,10,0).charge).toBe(0);
  for(const value of [1,2,3,4,5])expect(charge(20,value).charge).toBe(0);
 });
 it('increases pulse frequency with the natural face, including damage dice',()=>{
  const frequencies=[6,10,15,19].map(value=>charge(20,value).frequency);
  expect(frequencies[0]).toBeGreaterThan(0);
  for(let i=1;i<frequencies.length;i++)expect(frequencies[i]).toBeGreaterThan(frequencies[i-1]);
  expect(charge(6,5).frequency).toBeGreaterThan(charge(20,5).frequency);
  expect(frequencies[3]).toBeLessThan(.8);
 });
 it('has brighter peaks at high rolls with quiet purple intervals between pulses',()=>{
  const samples=(value:number)=>Array.from({length:3000},(_,i)=>charge(20,value,i/100).charge);
  const medium=samples(10),high=samples(19);
  expect(Math.max(...high)).toBeGreaterThan(Math.max(...medium)+.3);
  expect(Math.min(...high)).toBe(0);
  expect(Math.max(...high)).toBeLessThan(1);
  // Gentle full-cycle fades, including the wrap between successive pulses.
  expect(Math.max(...high.slice(1).map((v,i)=>Math.abs(v-high[i])))).toBeLessThan(.04);
  const other=Array.from({length:3000},(_,i)=>charge(20,19,i/100,2.399963).charge);
  expect(high.some((v,i)=>Math.abs(v-other[i])>.5)).toBe(true);
 });
 it('takes over on a maximum and retains a stable tint with reduced motion',()=>{
  for(const sides of [4,6,8,10,12,20,100])for(const time of [0,2,8])expect(charge(sides,sides,time).charge).toBe(1);
  expect(dmDiceCharge(1,true,true,0,0,0).charge).toBe(0);
  expect(dmDiceCharge(1,true,true,.175,0,0).charge).toBeCloseTo(.5);
  const steady=(seconds:number)=>dmDiceCharge(.9,true,false,Infinity,seconds,0,true);
  expect(steady(0)).toEqual(steady(20));expect(steady(0).frequency).toBe(0);
 });
});
