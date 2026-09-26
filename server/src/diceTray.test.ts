import {describe,it,expect} from 'vitest';
import {Vec3} from 'cannon-es';
import {dieMesh,faceForwardMesh} from '../../shared/diceGeometry.js';
import {physicalDice,simulateToss,trayFaceValues,diceMassKg,STANDARD_GRAVITY,REFERENCE_D6_EDGE} from '../../client/src/lib/dicePhysics.js';
describe('physics dice tray',()=>{
 it('uses a 16 mm acrylic d6 mass and Earth gravity in free flight',()=>{
  const mesh=faceForwardMesh(dieMesh(6)),radius=REFERENCE_D6_EDGE*Math.sqrt(3)/2;
  const vertices=mesh.vertices.map(v=>new Vec3(v[0]*radius,v[1]*radius,v[2]*radius));
  expect(diceMassKg(vertices,mesh.faces)).toBeCloseTo(.00487424,8);
  const t=simulateToss([{sides:6,value:1,index:0,set:0}],42);
  const metresPerUnit=radius/t.radius;
  const acceleration=(t.frames[16]-2*t.frames[9]+t.frames[2])*metresPerUnit/(t.step*t.step);
  expect(acceleration).toBeCloseTo(-STANDARD_GRAVITY,1);
 });
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
 it('throws common dice into a wall and still settles',()=>{
  for(const sides of [6,8,10,20])for(const seed of [1,42,719]){
   const toss=simulateToss([{sides,value:3,index:0,set:0}],seed);
   expect(toss.wallHits).toBeGreaterThan(0);
  }
 });
 it('settles varied energetic throws without falling back to the summary',()=>{
  for(const sides of [4,6,8,10,12,20])for(let seed=10;seed<110;seed++){
   expect(simulateToss([{sides,value:1,index:0,set:0}],seed).duration).toBeLessThanOrEqual(12);
  }
 },15000);
 it('settles six-die character tray throws',()=>{
  const dice=[20,8,6,6,8,6].map((sides,index)=>({sides,index,value:3,set:0}));
  for(const seed of [1,17,42,719,2026])expect(simulateToss(dice,seed).duration).toBeLessThanOrEqual(12);
 });
 it('splits percentile 100 without losing logical roll identity',()=>{
  const dice=physicalDice([{sides:100,value:100,index:2,set:1}]);expect(dice.map(x=>x.value)).toEqual([0,0]);expect(dice.every(x=>x.index===2&&x.set===1)).toBe(true);
 });
});
