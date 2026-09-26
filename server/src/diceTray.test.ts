import {describe,it,expect} from 'vitest';
import {physicalDice,simulateToss,trayFaceValues} from '../../client/src/lib/dicePhysics.js';
describe('physics dice tray',()=>{
 it('settles every shape inside the tray with fixed labels matching recorded results',()=>{
  for(const seed of [1,42,719]){
   const dice=physicalDice([4,6,8,10,12,20,100].map((sides,index)=>({sides,value:sides===100?100:sides-1,index,set:0})));
   const toss=simulateToss(dice,seed);expect(toss.duration).toBeGreaterThan(1);expect(toss.duration).toBeLessThanOrEqual(12);
   dice.forEach((d,i)=>{
    const labels=trayFaceValues(d,toss.topFaces[i]);expect(labels[toss.topFaces[i]]).toBe(d.value);expect(new Set(labels).size).toBe(d.sides);
    const last=((toss.frameCount-1)*dice.length+i)*7;
    expect(Math.abs(toss.frames[last])).toBeLessThan(7.01);expect(Math.abs(toss.frames[last+1])).toBeLessThan(4.51);expect(toss.frames[last+2]).toBeGreaterThan(0);
    for(let k=0;k<7;k++)expect(toss.frames[last+k]).toBeCloseTo(toss.frames[last-dice.length*7+k],3);
   });
  }
 });
 it('handles crowded mixed damage and repeats a seeded trajectory',()=>{
  const dice=Array.from({length:14},(_,index)=>({sides:index%2?8:6,value:3,index,set:0}));
  const a=simulateToss(dice,17),b=simulateToss(dice,17);expect(a.frames).toEqual(b.frames);expect(a.topFaces).toEqual(b.topFaces);
 });
 it('scales dice down gradually with the full physical pool and settles large pools',()=>{
  let previous=Infinity;
  for(const count of [1,2,4,8,14,20,40]){
   const dice=Array.from({length:count},(_,index)=>({sides:6,value:3,index,set:0}));
   const toss=simulateToss(dice,42);expect(toss.radius).toBeLessThanOrEqual(previous);previous=toss.radius;
   expect(toss.duration).toBeLessThanOrEqual(12);
  }
 });
 it('splits percentile 100 without losing logical roll identity',()=>{
  const dice=physicalDice([{sides:100,value:100,index:2,set:1}]);expect(dice.map(x=>x.value)).toEqual([0,0]);expect(dice.every(x=>x.index===2&&x.set===1)).toBe(true);
 });
});
