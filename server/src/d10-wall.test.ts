import {it,expect} from 'vitest';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';

it('d10 wall-contact regressions settle on physical faces without hanging or rethrowing',()=>{
 for(const seed of [5,7,24,28,29]){
  const world=createLiveWorld([{sides:10,value:1,index:0,set:0}],seed,seed%2?'bottom':'left');
  let frame=world.snapshot();while(!frame.done&&frame.elapsed<1.5)frame=world.advance(.025);
  expect(frame.done,`wall-contact seed ${seed}`).toBe(true);
  expect(frame.rerolls).toEqual([0]);
  expect(frame.values[0]).toBeGreaterThanOrEqual(1);expect(frame.values[0]).toBeLessThanOrEqual(10);
  expect(world.drainImpacts().some(impact=>impact.with==='wall')).toBe(true);
 }
});
