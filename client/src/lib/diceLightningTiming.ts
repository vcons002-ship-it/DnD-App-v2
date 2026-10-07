/** Each die owns its own unpredictable discharge clock. Animation speed stays
 * independent from the longer, irregular pauses between flashes. Seconds. */
export function createLightningTiming(random:()=>number=Math.random){
 let next=Infinity,start=-Infinity,last=-Infinity,seed=random()*10000,previousStrength:number|undefined;
 return {advance(now:number,strength?:number,maximum=false){
  if(strength!==undefined&&previousStrength===undefined)next=Math.min(next,now+.06);
  previousStrength=strength;
  if(maximum){
   // Independent channels continuously travel across the volume at maximum,
   // without the inactive gap between ordinary discharges.
   last=now;next=now+.12;
   return {phase:(now*6+seed*.001)%1,seed:seed+Math.floor(now*6)*17.31};
  }
  const interval=strength===undefined?1:2.0-Math.max(0,Math.min(1,strength))*1.65;
  if(last===-Infinity||now<last||now>next+.4){start=-Infinity;next=now+.2+random()*2.2;}
  last=now;
  if(now>=next){start=now;seed=random()*10000;next=now+(1.4+random()*2.2)*interval;}
  // Re-stagger overdue strikes after backgrounding instead of flashing every
  // die at once on the first resumed frame.
  return {phase:Number.isFinite(start)?Math.min(3,(now-start)*5):3,seed};
 }};
}
