import sharp from 'sharp';
import type {MapWall} from '../../shared/mapWalls.js';
/** Visible window art; independent of wall-gap detection. */
export const WINDOW_MASK_PROMPT='Paint every visible window and viewing slit in this battle map solid blue (#0000FF). Mark only windows actually shown. Keep the map unchanged otherwise.';
export async function windowsFromMask(mask:Buffer,source:Buffer,width:number,height:number,grid:number){
 const meta=await sharp(mask).metadata();
 if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(width/height)))>.04)throw Error('Window mask changed the map framing.');
 const pixels=(b:Buffer)=>sharp(b,{limitInputPixels:80_000_000}).rotate().resize(width,height,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const [m,s]=await Promise.all([pixels(mask),pixels(source)]);
 const blue=(b:Buffer,i:number)=>b[i]<100&&b[i+1]<130&&b[i+2]>175&&b[i+2]>Math.max(b[i],b[i+1])*1.8;
 // Windows can be smaller than the half-square minimum used for structural
 // walls. Extract at map resolution so small panes are not discarded there.
 const on=new Uint8Array(width*height),seen=new Uint8Array(on.length);
 for(let p=0;p<on.length;p++)on[p]=blue(m,p*3)&&!blue(s,p*3)?1:0;
 const regions:{ax:number;ay:number;bx:number;by:number;pixels:number}[]=[];
 for(let start=0;start<on.length;start++)if(on[start]&&!seen[start]){
  const queue=[start];seen[start]=1;let ax=start%width,bx=ax,ay=Math.floor(start/width),by=ay;
  for(let n=0;n<queue.length;n++){
   const p=queue[n],x=p%width,y=Math.floor(p/width);ax=Math.min(ax,x);bx=Math.max(bx,x);ay=Math.min(ay,y);by=Math.max(by,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height){const q=(y+dy)*width+x+dx;if(on[q]&&!seen[q]){seen[q]=1;queue.push(q);}}
  }
  if(queue.length>=8)regions.push({ax,ay,bx:bx+1,by:by+1,pixels:queue.length});
 }
 // Narrow mullions can split one painted window into separate panes. Combine
 // only immediately adjacent regions; never bridge a wall-sized empty span.
 const gap=Math.max(2,Math.min(4,grid*.06));
 for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
  const a=regions[i],b=regions[j],dx=Math.max(0,a.ax-b.bx,b.ax-a.bx),dy=Math.max(0,a.ay-b.by,b.ay-a.by);
  if(Math.hypot(dx,dy)>gap)continue;
  regions[i]={ax:Math.min(a.ax,b.ax),ay:Math.min(a.ay,b.ay),bx:Math.max(a.bx,b.bx),by:Math.max(a.by,b.by),pixels:a.pixels+b.pixels};regions.splice(j,1);j=i;
 }
 return regions.map((r,i):MapWall=>({id:`ai-window-${i+1}`,kind:'rectangle',ax:r.ax,ay:r.ay,bx:r.bx,by:r.by}));
}
