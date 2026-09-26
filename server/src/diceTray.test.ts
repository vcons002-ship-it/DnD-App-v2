import {diceEntrySide} from '../../client/src/lib/diceEntrySide.js';
import {describe,it,expect} from 'vitest';
import {Vec3,Quaternion} from 'cannon-es';
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
    expect(toss.settleTimes[i]).toBeGreaterThan(0);
    expect(toss.settleTimes[i]).toBeLessThanOrEqual(toss.duration);
    const settledFrame=Math.min(toss.frameCount-1,Math.ceil(toss.settleTimes[i]/toss.step)+2);
    const settledOffset=(settledFrame*dice.length+i)*7;
    const finalOffset=((toss.frameCount-1)*dice.length+i)*7;
    for(let k=0;k<7;k++)expect(toss.frames[settledOffset+k]).toBeCloseTo(toss.frames[finalOffset+k],3);
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
   dice.forEach((die,i)=>{
    const offset=((toss.frameCount-1)*dice.length+i)*7;
    const q=new Quaternion(...Array.from(toss.frames.slice(offset+3,offset+7)) as [number,number,number,number]);
    const bottom=Math.min(...faceForwardMesh(dieMesh(die.sides)).vertices.map(v=>q.vmult(new Vec3(...v).scale(toss.radius)).z+toss.frames[offset+2]));
    expect(bottom).toBeLessThanOrEqual(toss.radius*.04);
   });
  }
 },20000);
 it('allows natural wall rebounds without requiring every throw to hit a wall',()=>{
  let wallHits=0;
  for(const sides of [6,8,10,20])for(const seed of [1,42,719]){
   const toss=simulateToss([{sides,value:3,index:0,set:0}],seed);
   wallHits+=toss.wallHits;
  }
  expect(wallHits).toBeGreaterThan(0);
 });
 it('settles varied energetic throws without falling back to the summary',()=>{
  for(const sides of [4,6,8,10,12,20])for(let seed=10;seed<110;seed++){
   expect(simulateToss([{sides,value:1,index:0,set:0}],seed).duration).toBeLessThanOrEqual(12);
  }
 },15000);
 it('rolls a handful in from outside the tray in sequence',()=>{
  const dice=[6,8,20].map((sides,index)=>({sides,index,value:1,set:0}));
  const t=simulateToss(dice,42);
  for(let i=0;i<dice.length;i++)expect(t.frames[i*7]).toBeLessThan(-7.4-t.radius);
  const early=Math.floor(.025/t.step)*dice.length*7;
  expect(t.frames[early]).toBeGreaterThan(t.frames[0]);
  expect(t.frames[early+7]).toBe(t.frames[7]);
  for(let i=0;i<dice.length;i++)expect(t.frames[((t.frameCount-1)*dice.length+i)*7]).toBeGreaterThan(-7);
 });
 it('settles six-die character tray throws',()=>{
  const dice=[20,8,6,6,8,6].map((sides,index)=>({sides,index,value:3,set:0}));
  for(const seed of [1,17,42,719,2026])expect(simulateToss(dice,seed).duration).toBeLessThanOrEqual(12);
 });
 it('assigns the local roller the bottom and other rollers stable other edges',()=>{
  expect(diceEntrySide(true,'Druk')).toBe('bottom');
  for(const id of ['Druk','Varis','Vanec','DM']){
   expect(['left','top','right']).toContain(diceEntrySide(false,id));
   expect(diceEntrySide(false,id)).toBe(diceEntrySide(false,id));
  }
 });
 it('enters from each seat and settles inside the tray',()=>{
  for(const side of ['bottom','top','left','right'] as const)for(const seed of [1,17,42,719,2026]){
   const dice=[20,8,6,6,8,6].map((sides,index)=>({sides,index,value:3,set:0}));
   const t=simulateToss(dice,seed,side);
   if(side==='bottom')expect(t.frames[1]).toBeLessThan(-4.7-t.radius);
   if(side==='top')expect(t.frames[1]).toBeGreaterThan(4.7+t.radius);
   if(side==='left')expect(t.frames[0]).toBeLessThan(-7.2-t.radius);
   if(side==='right')expect(t.frames[0]).toBeGreaterThan(7.2+t.radius);
   for(let i=0;i<dice.length;i++){
    const last=((t.frameCount-1)*dice.length+i)*7;
    expect(Math.abs(t.frames[last])).toBeLessThan(7.01);
    expect(Math.abs(t.frames[last+1])).toBeLessThan(4.51);
   }
  }
 });
 it('splits percentile 100 without losing logical roll identity',()=>{
  const dice=physicalDice([{sides:100,value:100,index:2,set:1}]);expect(dice.map(x=>x.value)).toEqual([0,0]);expect(dice.every(x=>x.index===2&&x.set===1)).toBe(true);
 });
});
