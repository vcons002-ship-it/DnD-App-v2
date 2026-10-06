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
