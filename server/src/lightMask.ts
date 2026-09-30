import sharp from 'sharp';
import type {MapEnvironmentLight} from '../../shared/mapEnvironment.js';

export const LIGHT_MASK_PROMPT='Annotate the supplied battle map with one small solid bright magenta (#FF00FF) disk centered exactly on each visible light emitter: torch flame, lit lantern, candle cluster, burning brazier, or explicitly glowing magical object. Mark the emitter itself, not its light pool, reflection, illuminated floor, or shadow. Use disks about 1 percent of image width. Keep separate emitters separate. Preserve all original map art, composition, framing, and aspect ratio. No labels, lines, added objects, or other magenta marks. Do not invent light sources.';

/** Connected magenta markers become light positions; appearance remains the original map art. */
export async function lightsFromMask(mask:Buffer,source:Buffer,width:number,height:number):Promise<MapEnvironmentLight[]> {
 if(![width,height].every(v=>Number.isFinite(v)&&v>0&&v<=20000))throw new Error('Invalid map dimensions.');
 const metadata=await sharp(mask).metadata();
 if(!metadata.width||!metadata.height||Math.abs(Math.log((metadata.width/metadata.height)/(width/height)))>.04)throw new Error('Light mask changed the map framing.');
 const w=800,h=Math.max(1,Math.round(height/width*w));
 const pixels=async(b:Buffer)=>sharp(b,{limitInputPixels:80_000_000}).rotate().resize(w,h,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const [m,s]=await Promise.all([pixels(mask),pixels(source)]),on=new Uint8Array(w*h),seen=new Uint8Array(w*h);
 const magenta=(a:Buffer,i:number)=>a[i]>175&&a[i+2]>150&&a[i+1]<100&&Math.min(a[i],a[i+2])>a[i+1]*1.8;
 for(let p=0;p<on.length;p++)on[p]=magenta(m,p*3)&&!magenta(s,p*3)?1:0;
 const lights:MapEnvironmentLight[]=[];
 for(let p=0;p<on.length;p++)if(on[p]&&!seen[p]){
  const queue=[p];seen[p]=1;let sx=0,sy=0,minX=w,maxX=0,minY=h,maxY=0;
  for(let n=0;n<queue.length;n++){const q=queue[n],x=q%w,y=Math.floor(q/w);sx+=x+.5;sy+=y+.5;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h){const next=(y+dy)*w+x+dx;if(on[next]&&!seen[next]){seen[next]=1;queue.push(next);}}
  }
  if(queue.length<4)continue;
  if(Math.max(maxX-minX,maxY-minY)>w*.06)throw new Error('Use isolated small dots, not broad magenta regions.');
  lights.push({id:`ai-light-${lights.length+1}`,x:sx/queue.length*width/w,y:sy/queue.length*height/h,radiusFt:20,heightFt:8,color:'warm',intensity:1,flicker:true,visibleTorch:false});
 }
 if(!lights.length)throw new Error('No light markers found.');
 if(lights.length>64)throw new Error('Too many light markers; review the mask.');
 return lights;
}
