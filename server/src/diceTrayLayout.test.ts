import {it,expect} from 'vitest';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';

it('grows the tray without changing dice colliders, physical mass or gravity',()=>{
 const worlds=[1,4,10,20,40].map(count=>createLiveWorld(Array.from({length:count},(_,index)=>({sides:6,value:1,index,set:0})),42));
 const reference=worlds[0].bodies[0];let previous=1;
 for(const world of worlds){
  const frame=world.snapshot(),body=world.bodies[0];
  expect(frame.radius).toBe(1.1);
  expect(frame.trayScale).toBeGreaterThanOrEqual(previous);previous=frame.trayScale;
  expect(body.mass).toBeCloseTo(reference.mass,10);
  expect(body.shapes[0].boundingSphereRadius).toBeCloseTo(reference.shapes[0].boundingSphereRadius,10);
  expect(body.world!.gravity.toArray()).toEqual(reference.world!.gravity.toArray());
  expect(body.world!.bodies.some(b=>b.mass===0&&Math.abs(b.position.x-7.2*frame.trayScale)<1e-8)).toBe(true);
 }
 expect(worlds[0].snapshot().trayScale).toBe(1);
 expect(worlds.at(-1)!.snapshot().trayScale).toBeGreaterThan(worlds[2].snapshot().trayScale);
});
