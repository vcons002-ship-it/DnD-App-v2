import sharp from 'sharp';
import type {MapWall} from '../../shared/mapWalls.js';

/** Experimental yellow-outline import. No AI inference or hand-authored coordinates.
 * Fill only narrow enclosed regions, then decompose into existing solid wall rectangles.
 * Large enclosed rooms remain empty. Small colour/encoding gaps are closed first. */
export async function wallsFromYellowMask(image:Buffer,width:number,height:number,gridSizePx:number) {
  if(![width,height,gridSizePx].every(n=>Number.isFinite(n)&&n>0)||width>20000||height>20000)throw new Error('Invalid map dimensions.');
  const scale=Math.min(1,800/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale),size=w*h;
  const {data,info}=await sharp(image,{limitInputPixels:40_000_000}).rotate().resize(w,h,{fit:'fill',kernel:'nearest'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const yellow=new Uint8Array(size);
  for(let p=0;p<size;p++){const i=p*info.channels;yellow[p]=data[i]>165&&data[i+1]>155&&data[i+2]<115&&data[i]>data[i+2]*1.8&&data[i+1]>data[i+2]*1.8?255:0;}
  // Close tiny encoding breaks with a 5x5 kernel in the scaled working image.
  const dilated=new Uint8Array(size),closed=new Uint8Array(size);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(yellow[y*w+x])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)dilated[(y+dy)*w+x+dx]=255;
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    let all=true;for(let dy=-2;dy<=2&&all;dy++)for(let dx=-2;dx<=2;dx++)if(!dilated[(y+dy)*w+x+dx]){all=false;break;}
    if(all)closed[y*w+x]=255;
  }
  const solid=Uint8Array.from(closed,n=>n?1:0),seen=new Uint8Array(size),queue=new Int32Array(size),distance=new Int32Array(size);
  const neighbors=(p:number)=>[...(p%w?[p-1]:[]),...(p%w<w-1?[p+1]:[]),...(p>=w?[p-w]:[]),...(p<size-w?[p+w]:[])];
  let filledPixels=0;
  for(let start=0;start<size;start++) {
    if(solid[start]||seen[start])continue;
    let head=0,tail=1,touchesEdge=false;queue[0]=start;seen[start]=1;const component:number[]=[];
    while(head<tail){const p=queue[head++];component.push(p);if(p%w===0||p%w===w-1||p<w||p>=size-w)touchesEdge=true;
      for(const q of neighbors(p))if(!solid[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
    if(touchesEdge)continue;
    head=0;tail=0;
    for(const p of component){distance[p]=-1;if(neighbors(p).some(q=>solid[q])){distance[p]=1;queue[tail++]=p;}}
    let depth=0;
    while(head<tail){const p=queue[head++];depth=Math.max(depth,distance[p]);for(const q of neighbors(p))if(!solid[q]&&distance[q]===-1){distance[q]=distance[p]+1;queue[tail++]=q;}}
    if(depth<=Math.max(3,gridSizePx*scale*.45)){for(const p of component)solid[p]=1;filledPixels+=component.length;}
  }
  const initial=solid.reduce((a,b)=>a+b,0),remaining=solid.slice(),walls:MapWall[]=[];
  const heights=new Int32Array(w),stack=new Int32Array(w+1);
  let represented=0;
  // Largest-rectangle decomposition uses the existing four-edge solid-wall primitive.
  while(walls.length<120){
    heights.fill(0);let best={area:0,x:0,y:0,width:0,height:0};
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++)heights[x]=remaining[y*w+x]?heights[x]+1:0;
      let top=0;
      for(let x=0;x<=w;x++){
        const current=x<w?heights[x]:0;
        while(top&&heights[stack[top-1]]>current){const high=heights[stack[--top]],left=top?stack[top-1]+1:0,length=x-left,area=high*length;
          if(high>=2&&length>=2&&area>best.area)best={area,x:left,y:y-high+1,width:length,height:high};}
        stack[top++]=x;
      }
    }
    if(best.area<12)break;
    for(let y=best.y;y<best.y+best.height;y++)for(let x=best.x;x<best.x+best.width;x++)remaining[y*w+x]=0;
    represented+=best.area;
    walls.push({id:`mask-${walls.length}`,kind:'rectangle',ax:best.x*width/w,ay:best.y*height/h,bx:(best.x+best.width)*width/w,by:(best.y+best.height)*height/h});
  }
  if(!walls.length)throw new Error('No usable yellow wall regions found.');
  const coverage=represented/initial;
  if(coverage<.94)throw new Error('Mask is too complex for the wall limit; simplify it before importing.');
  return {walls,coverage,filledPixels,workWidth:w,workHeight:h,solidMask:Buffer.from(solid.map(n=>n*255))};
}
