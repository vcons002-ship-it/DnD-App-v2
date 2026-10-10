import type {AutoGraphicsTier} from './graphicsQuality.js';

/** Samples continuous rendering only. Idle caps, loading and hidden tabs are not slow frames. */
export function createAdaptiveGraphics(initial:AutoGraphicsTier){
  const tiers:AutoGraphicsTier[]=['low','balanced','high'];
  let tier=initial,last=0,epoch=0,samples:number[]=[],slow=0,fastSince=0,changed=-Infinity,recoveryAfter=0;
  return {
    get tier(){return tier;},
    pause(){last=0;epoch=0;samples=[];slow=0;fastSince=0;},
    sample(now:number,continuous:boolean):AutoGraphicsTier|null{
      if(!continuous){this.pause();return null;}
      const dt=last?now-last:0;last=now;
      if(dt>=250){this.pause();last=now;epoch=now;return null;}
      if(!epoch)epoch=now;
      if(dt>0&&dt<250)samples.push(dt);
      if(now-epoch<3000)return null;
      epoch=now;
      if(samples.length<40){samples=[];slow=0;fastSince=0;return null;}
      samples.sort((a,b)=>a-b);
      const p75=samples[Math.floor((samples.length-1)*.75)];samples=[];
      slow=p75>25?slow+1:0;
      if(p75<18){if(!fastSince)fastSince=now;}else fastSince=0;
      const index=tiers.indexOf(tier);
      if(slow>=2&&index>0&&now-changed>=30000){
        tier=tiers[index-1];changed=now;recoveryAfter=now+120000;slow=0;fastSince=0;return tier;
      }
      if(index<2&&fastSince&&now-fastSince>=60000&&now>=recoveryAfter&&now-changed>=30000){
        tier=tiers[index+1];changed=now;fastSince=0;slow=0;return tier;
      }
      return null;
    },
  };
}
