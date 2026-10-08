import {it,expect} from 'vitest';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';
import {REFERENCE_D6_EDGE} from '../../shared/diceTrayLayout.js';

it('gives small rolls a visible airborne approach before their first landing',()=>{
 for(const sides of [6,8,10,20])for(const side of ['bottom','top','left','right'] as const){
  const world=createLiveWorld([{sides,value:1,index:0,set:0}],42,side);
  const body=world.bodies[0],metresPerUnit=(REFERENCE_D6_EDGE*Math.sqrt(3)/2)/world.snapshot().radius;
  const start=body.position.clone();
  expect(start.z*metresPerUnit).toBeGreaterThanOrEqual(.070);
  world.advance(.025);
  expect(body.position.z).toBeGreaterThan(start.z);
  let airborne=.025;
  while(airborne<.1){
   world.advance(1/120);airborne+=1/120;
   const shape=body.shapes[0] as import('cannon-es').ConvexPolyhedron;
   const bottom=Math.min(...shape.vertices.map(v=>body.quaternion.vmult(v).z+body.position.z));
   expect(bottom,`${sides} from ${side}: show the flight before floor contact`).toBeGreaterThan(0);
  }
 }
});

it('pours large handfuls through each rim and uses the bed instead of piling at the front',()=>{
 for(const count of [10,20,40])for(const side of ['bottom','top','left','right'] as const){
  const world=createLiveWorld(Array.from({length:count},(_,index)=>({sides:6,value:1,index,set:0})),42,side);
  let frame=world.snapshot();
  const horizontal=side==='left'||side==='right',sign=side==='left'||side==='bottom'?1:-1;
  const extent=(horizontal?7:4.5)*frame.trayScale;
  const along=(i:number)=>(horizontal?world.bodies[i].position.x:world.bodies[i].position.y)*sign;
  for(let i=0;i<count;i++){
   expect(along(i)).toBeLessThan(-extent-frame.radius);
   expect(world.bodies[i].velocity.length()).toBeGreaterThan(0);
   for(let j=0;j<i;j++)expect(world.bodies[i].position.distanceTo(world.bodies[j].position)).toBeGreaterThan(frame.radius*2);
  }
  const entered=new Set<number>();
  while(!frame.done&&frame.elapsed<8){
   frame=world.advance(.025);
   world.bodies.forEach((body,i)=>{if(body.collisionFilterMask===7)entered.add(i);});
   if(frame.elapsed>.5)expect(entered.size,`${count} from ${side}: clear rim in one handful`).toBe(count);
  }
  expect(frame.done,`${count} from ${side}: settles`).toBe(true);
  expect(frame.rerolls.reduce((sum,n)=>sum+n,0)).toBeLessThanOrEqual(1);
  const travel=world.bodies.map((_,i)=>(along(i)+extent)/(2*extent));
  expect(travel.reduce((sum,n)=>sum+n,0)/count).toBeGreaterThan(.35);
  expect(travel.filter(n=>n<.25).length).toBeLessThan(count*.4);
 }
},20000);
