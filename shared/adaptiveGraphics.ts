import type {AutoGraphicsTier} from './graphicsQuality.js';

/** Samples continuous rendering only. Idle caps, loading and hidden tabs are not slow frames.
 *
 *  - "Fast" is judged against the display's own refresh interval (the shortest
 *    typical frame seen), so 50 Hz screens can recover, not only 60 Hz ones.
 *  - Every drop is checked: if the lower tier renders no faster, the display or
 *    browser caps the frame rate (30 Hz battery saver, low-power mode), so the
 *    previous tier comes back and that pace stops counting as slow.
 *  - Recovery needs a minute of fast rendering in total; pauses (a static map,
 *    a hidden tab) neither count toward it nor reset it.
 *  - A tier that turns slow soon after it was reached is skipped for a growing
 *    back-off, so the tracker can't bounce between tiers (each switch reloads
 *    the character models). */
export function createAdaptiveGraphics(initial:AutoGraphicsTier){
  const tiers:AutoGraphicsTier[]=['low','balanced','high'];
  const MINUTE=60000,QUICK_FAILURE=5*MINUTE,MAX_BACKOFF=60*MINUTE;
  let tier=initial,last=0,epoch=0,samples:number[]=[],slow=0,fastMs=0,changed=-Infinity,recoveryAfter=0,enteredAt=-Infinity;
  /** Shortest typical frame seen: the display's refresh interval. */
  let frameFloor=Infinity;
  /** A frame time that a lower tier could not beat: the display (or other load),
   *  not quality, sets it. Re-checked after a while in case that load was temporary. */
  let capFloor=0,capUntil=0;
  /** A drop being checked for whether it actually helped. */
  let probe:{from:AutoGraphicsTier;before:number;windows:number}|null=null;
  const blockedUntil:Partial<Record<AutoGraphicsTier,number>>={},backoff:Partial<Record<AutoGraphicsTier,number>>={};
  return {
    get tier(){return tier;},
    /** Not evidence either way: keeps the fast time already earned. */
    pause(){last=0;epoch=0;samples=[];slow=0;},
    sample(now:number,continuous:boolean):AutoGraphicsTier|null{
      if(!continuous){this.pause();return null;}
      const dt=last?now-last:0;last=now;
      if(dt>=2000){this.pause();last=now;epoch=now;return null;}
      if(!epoch)epoch=now;
      if(dt>0&&dt<2000)samples.push(dt);
      if(now-epoch<3000)return null;
      const windowMs=now-epoch;epoch=now;
      if(samples.length<8){samples=[];slow=0;return null;}
      samples.sort((a,b)=>a-b);
      const p10=samples[Math.floor((samples.length-1)*.1)],p75=samples[Math.floor((samples.length-1)*.75)];samples=[];
      frameFloor=Math.min(frameFloor,p10);
      const index=tiers.indexOf(tier);
      if(probe){
        if(++probe.windows<2)return null;
        const {from,before}=probe;probe=null;
        if(p75>=before*.9){
          // Lower quality rendered no faster: restore it and accept this pace.
          capFloor=Math.max(now<capUntil?capFloor:0,p75);capUntil=now+30*MINUTE;
          tier=from;changed=now;enteredAt=now;slow=0;fastMs=0;return tier;
        }
      }
      const slowAt=Math.max(25,now<capUntil?capFloor*1.15:0),fastAt=Math.max(18,(Number.isFinite(frameFloor)?frameFloor:1000/60)*1.15);
      slow=p75>slowAt?slow+1:0;
      fastMs=p75<fastAt?fastMs+windowMs:0;
      if(slow>=2&&index>0&&now-changed>=30000){
        const from=tier;
        if(now-enteredAt<QUICK_FAILURE){
          backoff[from]=Math.min((backoff[from]??QUICK_FAILURE)*2,MAX_BACKOFF);
          blockedUntil[from]=now+backoff[from]!;
        }
        tier=tiers[index-1];changed=now;enteredAt=now;recoveryAfter=now+2*MINUTE;slow=0;fastMs=0;
        probe={from,before:p75,windows:0};return tier;
      }
      const next=tiers[index+1];
      if(next&&fastMs>=MINUTE&&now>=recoveryAfter&&now-changed>=30000&&now>=(blockedUntil[next]??0)){
        tier=next;changed=now;enteredAt=now;fastMs=0;slow=0;return tier;
      }
      return null;
    },
  };
}
