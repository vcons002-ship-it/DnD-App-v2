import sharp from 'sharp';
import type {DoorMarker} from '../../shared/mapDoorDraft.js';

export const DOOR_MASK_PROMPT='Annotate the supplied top-down battle map with a solid bright cyan (#00FFFF) straight line over each visible door. Draw each line along the closed door from jamb to jamb, covering its full width, about 8 pixels thick. Follow diagonal doors at their actual angle. A visible wooden or metal door leaf or gate is required: an empty opening with only side posts must stay unmarked. Do not mark empty passages, arches, chests, furniture, walls or cave edges. Preserve the original map, framing and aspect ratio. No labels, other marks or invented doors.';

/** Fit the long axis of each cyan stroke, preserving diagonal door orientation. */
export async function doorsFromMask(mask:Buffer,source:Buffer,width:number,height:number):Promise<DoorMarker[]> {
  if(![width,height].every(v=>Number.isFinite(v)&&v>0&&v<=20000))throw new Error('Invalid map dimensions.');
  const meta=await sharp(mask).metadata();
  if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(width/height)))>.04)throw new Error('Door mask changed the map framing.');
  const w=Math.min(1600,width),h=Math.max(1,Math.round(height/width*w));
  const pixels=(b:Buffer)=>sharp(b,{limitInputPixels:80_000_000}).rotate().resize(w,h,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const [m,s]=await Promise.all([pixels(mask),pixels(source)]),on=new Uint8Array(w*h),seen=new Uint8Array(w*h);
  const cyan=(a:Buffer,i:number)=>a[i]<100&&a[i+1]>170&&a[i+2]>170&&Math.min(a[i+1],a[i+2])>a[i]*1.8;
  for(let p=0;p<on.length;p++)on[p]=cyan(m,p*3)&&!cyan(s,p*3)?1:0;
  const doors:DoorMarker[]=[];
  for(let p=0;p<on.length;p++)if(on[p]&&!seen[p]){
    const queue=[p];seen[p]=1;let sumX=0,sumY=0;
    for(let n=0;n<queue.length;n++){
      const q=queue[n],x=q%w,y=Math.floor(q/w);sumX+=x+.5;sumY+=y+.5;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h){
        const next=(y+dy)*w+x+dx;if(on[next]&&!seen[next]){seen[next]=1;queue.push(next);}
      }
    }
    if(queue.length<8)continue;
    const cx=sumX/queue.length,cy=sumY/queue.length;let xx=0,xy=0,yy=0;
    for(const q of queue){const x=q%w+.5-cx,y=Math.floor(q/w)+.5-cy;xx+=x*x;xy+=x*y;yy+=y*y;}
    const angle=.5*Math.atan2(2*xy,xx-yy),tx=Math.cos(angle),ty=Math.sin(angle);
    let lo=Infinity,hi=-Infinity,acrossLo=Infinity,acrossHi=-Infinity;
    for(const q of queue){const x=q%w+.5-cx,y=Math.floor(q/w)+.5-cy,along=x*tx+y*ty,across=-x*ty+y*tx;lo=Math.min(lo,along);hi=Math.max(hi,along);acrossLo=Math.min(acrossLo,across);acrossHi=Math.max(acrossHi,across);}
    const length=hi-lo+1,thickness=acrossHi-acrossLo+1;
    // Round dots or broad painted rooms do not encode a reliable doorway.
    if(length<8||length/thickness<2.5||length>w*.25||thickness>w*.035)throw new Error('Door markers must be separate thin lines across each door, not dots or broad areas.');
    const clamp=(v:number,max:number)=>Math.max(0,Math.min(max,v));
    doors.push({id:`ai-door-${doors.length+1}`,ax:clamp((cx+tx*(lo-.5))*width/w,width),ay:clamp((cy+ty*(lo-.5))*height/h,height),bx:clamp((cx+tx*(hi+.5))*width/w,width),by:clamp((cy+ty*(hi+.5))*height/h,height),thickness:thickness*width/w});
  }
  if(doors.length>64)throw new Error('Too many door markers; review the mask.');
  return doors;
}
