import {it,expect} from 'vitest';
import {createLightningTiming} from './diceLightningTiming';
it('keeps a fast stroke while spacing strikes with longer variable pauses',()=>{
 const sequence=[.1,0,.2,0,.3,1];let i=0;
 const clock=createLightningTiming(()=>sequence[i++]??.5);
 expect(clock.advance(0).phase).toBe(3);
 expect(clock.advance(.199).phase).toBe(3);
 expect(clock.advance(.2).phase).toBe(0);
 expect(clock.advance(.3).phase).toBeCloseTo(.5);
 expect(clock.advance(1.59).phase).toBe(3);
 expect(clock.advance(1.6).phase).toBe(0);
 expect(clock.advance(5.19).phase).toBe(3);
 expect(clock.advance(5.2).phase).toBe(0);
});
it('starts independently for separate dice and avoids catch-up bursts on resume',()=>{
 const a=createLightningTiming(()=>0),b=createLightningTiming(()=>1);
 a.advance(0);b.advance(0);
 expect(a.advance(.2).phase).toBe(0);expect(b.advance(.2).phase).toBe(3);
 expect(b.advance(2.41).phase).toBe(0);
 expect(a.advance(100).phase).toBe(3);expect(a.advance(100.19).phase).toBe(3);
 expect(a.advance(100.2).phase).toBe(0);expect(a.advance(100.3).phase).toBeCloseTo(.5);
});
it('makes a d6 five visibly more active than a one within the result hold',()=>{
 const flashes=(value:number,seconds:number)=>{
  const clock=createLightningTiming(()=>.5);let previous=3,count=0;
  for(let tick=0;tick<seconds*120;tick++){
   const phase=clock.advance(tick/120,(value-1)/5,value===6).phase;
   if(phase<previous)count++;previous=phase;
  }
  return count;
 };
 expect(flashes(1,2)).toBe(1);
 expect(flashes(5,2)).toBeGreaterThanOrEqual(3);
 expect(flashes(3,6)).toBeGreaterThan(flashes(1,6));
 expect(flashes(5,6)).toBeGreaterThanOrEqual(flashes(1,6)*4);
 expect(flashes(6,2)).toBeGreaterThan(flashes(5,2)*2);
});
it('starts the confirmed result promptly rather than inheriting a long idle pause',()=>{
 const clock=createLightningTiming(()=>1);
 clock.advance(0);
 expect(clock.advance(.5,.8).phase).toBe(3);
 expect(clock.advance(.8,.8).phase).toBe(0);
});
it('maximum rolls have frequent separate flashes with fully dark gaps and new channels',()=>{
 let n=0;const clock=createLightningTiming(()=>((n++*17)%101)/100);
 let flashes=0,darkFrames=0,lastSeed=-1;
 for(let tick=0;tick<240;tick++){
  const frame=clock.advance(tick/120,1,true);
  if(frame.seed!==lastSeed){flashes++;lastSeed=frame.seed;}
  if(frame.phase>=.9)darkFrames++;
 }
 expect(flashes).toBeGreaterThan(9);expect(flashes).toBeLessThan(20);
 expect(darkFrames).toBeGreaterThan(40);
 // Background/resume never catches up by holding a channel continuously on.
 expect(clock.advance(100,1,true).phase).toBe(3);
});
