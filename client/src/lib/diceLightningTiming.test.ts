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
it('charges more frequently for stronger confirmed rolls and continuously at maximum',()=>{
 const low=createLightningTiming(()=>.5),high=createLightningTiming(()=>.5);
 low.advance(0,0);high.advance(0,.95);low.advance(1.3,0);high.advance(1.3,.95);
 // A high roll reaches a second discharge while a minimum is still cooling.
 expect(high.advance(2.51,.95).phase).toBeLessThan(1);
 expect(low.advance(2.51,0).phase).toBe(3);
 for(let t=3;t<5;t+=.03){const frame=high.advance(t,1,true);expect(frame.phase).toBeGreaterThanOrEqual(0);expect(frame.phase).toBeLessThan(1);}
});
