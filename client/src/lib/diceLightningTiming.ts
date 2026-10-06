/** Each die owns its own unpredictable discharge clock. Animation speed stays
 * independent from the longer, irregular pauses between flashes. Seconds. */
export function createLightningTiming(random:()=>number=Math.random){
 let next=Infinity,start=-Infinity,last=-Infinity,seed=random()*10000;
 return {advance(now:number){
  if(last===-Infinity||now<last||now>next+.4){start=-Infinity;next=now+.2+random()*2.2;}
  last=now;
  if(now>=next){start=now;seed=random()*10000;next=now+1.4+random()*2.2;}
  // Re-stagger overdue strikes after backgrounding instead of flashing every
  // die at once on the first resumed frame.
  return {phase:Number.isFinite(start)?Math.min(3,(now-start)*5):3,seed};
 }};
}
