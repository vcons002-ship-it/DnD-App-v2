import sharp from 'sharp';
import {fitWallMask,prepareWallMask} from './wallMaskRectangles.js';
import {contourWallMask} from './wallMaskContours.js';
import type {MapWall} from '../../shared/mapWalls.js';

/** Yellow-mask import. No AI inference or hand-authored coordinates in conversion.
 * Fill only narrow enclosed regions, then trace solid contours with room holes.
 * Complex noisy masks retain the conservative rectangle-fitting fallback.
 * Large enclosed rooms remain empty. Small structural paint breaks are joined;
 * wider cuts remain protected. Opening-mask extraction can opt into precise mode. */
export async function wallsFromYellowMask(image:Buffer,width:number,height:number,gridSizePx:number,originalImage?:Buffer,minimizeEdges=false,repairSmallGaps=true,confirmedPaint?:Buffer) {
  if(![width,height,gridSizePx].every(n=>Number.isFinite(n)&&n>0)||width>20000||height>20000)throw new Error('Invalid map dimensions.');
  // Natural-pass additions have known paint provenance. Keep these thin lines
  // at a higher working resolution so curved joins survive raster conversion.
  const scale=Math.min(1,(confirmedPaint?1600:800)/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale),size=w*h;
  const {data,info}=await sharp(image,{limitInputPixels:40_000_000}).rotate().resize(w,h,{fit:'fill',kernel:'nearest'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const yellow=new Uint8Array(size);
  const faint=new Uint8Array(size);
  const paint=new Uint8Array(size);
  const confirmed=confirmedPaint?await sharp(confirmedPaint,{limitInputPixels:40_000_000}).rotate().removeAlpha().greyscale().resize(w,h,{fit:'fill',kernel:'linear'}).raw().toBuffer():new Uint8Array(size);
  for(let p=0;p<size;p++){
    const i=p*info.channels,hue=data[i+2]<115&&data[i]>data[i+2]*1.8&&data[i+1]>data[i+2]*1.8;
    yellow[p]=hue&&data[i]>165&&data[i+1]>155?255:0;
    faint[p]=hue&&data[i]>25&&data[i+1]>20&&Math.min(data[i],data[i+1])-data[i+2]>18?1:0;
    // An opaque #FFFF00 annotation has a saturated core, even after JPEG loss.
    // Warm flowers/grass can pass the broader edge test but cannot independently
    // establish a wall. Keep the broader colors around confirmed paint below.
    paint[p]=data[i]>=210&&data[i+1]>=210&&Math.min(data[i],data[i+1])-data[i+2]>=150?1:0;
    // This is the additions-only yellow-on-black raster from the green pass,
    // not the returned map art. Its paint must win over underlying firelight.
    if(confirmed[p]>=64){yellow[p]=255;paint[p]=1;}
  }
  // Dark yellow paint in stone grooves belongs to the annotation. Grow only from
  // bright annotation seeds; do not classify unrelated warm floor art as walls.
  const seeds=yellow.slice(),paintRadius=Math.max(1,Math.min(3,Math.round(gridSizePx*scale*.08)));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(faint[y*w+x]&&!seeds[y*w+x]){
    let near=false;for(let dy=-paintRadius;dy<=paintRadius&&!near;dy++)for(let dx=-paintRadius;dx<=paintRadius;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&seeds[(y+dy)*w+x+dx]){near=true;break;}
    if(near)yellow[y*w+x]=255;
  }
  // Ignore yellow that was already in the source art (torch flames, gold, etc.).
  // Slight dilation tolerates small JPEG/resampling shifts at those same pixels.
  if(originalImage){
    const original=await sharp(originalImage,{limitInputPixels:80_000_000}).rotate().resize(w,h,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
    const radius=Math.max(2,Math.round(gridSizePx*scale*.08));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*3;
      // Unchanged warm art in an intentional gap is not faint paint. Do not grow
      // annotation into it merely because a bright yellow edge is nearby.
      const p=y*w+x,j=p*info.channels;
      // Image-API paint can be muted rather than exact #FFFF00. Require a
      // bright, saturated yellow core AND a substantial source-image change
      // before accepting it as paint evidence; unchanged warm artwork remains
      // subject to the exclusion below.
      if(yellow[p]&&data[j]>=190&&data[j+1]>=190&&Math.min(data[j],data[j+1])-data[j+2]>=150
        &&Math.max(Math.abs(original[i]-data[j]),Math.abs(original[i+1]-data[j+1]),Math.abs(original[i+2]-data[j+2]))>=50)paint[p]=1;
      if(confirmed[p]<64&&!seeds[p]&&Math.max(Math.abs(original[i]-data[j]),Math.abs(original[i+1]-data[j+1]),Math.abs(original[i+2]-data[j+2]))<=20)yellow[p]=0;
      if(original[i]>165&&original[i+1]>145&&original[i+2]<130&&original[i]>original[i+2]*1.6&&original[i+1]>original[i+2]*1.6)
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h){const q=(y+dy)*w+x+dx;if(confirmed[q]<64)yellow[q]=0;}
    }
  }
  // A region needs surviving opaque paint evidence as well as a useful span.
  // Retain its dim edges/seams unchanged; do not erode narrow wall bands or
  // remove small painted pillars just because similarly sized flowers failed.
  const visited=new Uint8Array(size),minSpan=Math.max(4,gridSizePx*scale*.5);
  for(let p=0;p<size;p++)if(yellow[p]&&!visited[p]){
    const pixels=[p];visited[p]=1;let minX=p%w,maxX=minX,minY=Math.floor(p/w),maxY=minY,hasPaint=false;
    for(let n=0;n<pixels.length;n++){
      const q=pixels[n],x=q%w,y=Math.floor(q/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);hasPaint ||= !!paint[q];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h){const next=(y+dy)*w+x+dx;if(yellow[next]&&!visited[next]){visited[next]=1;pixels.push(next);}}
    }
    if(!hasPaint||Math.max(maxX-minX+1,maxY-minY+1)<minSpan)for(const q of pixels)yellow[q]=0;
  }
  const solid=Uint8Array.from(yellow,n=>n?1:0),seen=new Uint8Array(size),queue=new Int32Array(size),distance=new Int32Array(size);
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
  const prepared=prepareWallMask(solid,w,h,gridSizePx*scale,repairSmallGaps);
  const contours=await contourWallMask(prepared.solid,prepared.protectedPixels,w,h,minimizeEdges);
  const fitted=contours?{...contours,solid:prepared.solid}:await fitWallMask(solid,w,h,gridSizePx*scale,120,repairSmallGaps);
  const scalePoint=(p:{x:number;y:number})=>({x:p.x*width/w,y:p.y*height/h});
  const walls:MapWall[]=contours?contours.walls.map(wall=>({...wall,ax:wall.ax*width/w,ay:wall.ay*height/h,bx:wall.bx*width/w,by:wall.by*height/h,points:wall.points!.map(scalePoint),...(wall.holes?{holes:wall.holes.map(r=>r.map(scalePoint))}:{})})):
    ('rectangles' in fitted?fitted.rectangles:[]).map((r,index)=>({id:`mask-${index}`,kind:'rectangle',ax:r.x*width/w,ay:r.y*height/h,bx:r.right*width/w,by:r.bottom*height/h}));
  if(!walls.length)throw new Error('No usable yellow wall regions found.');
  const coverage=fitted.coverage;
  if(coverage<.94)throw new Error('The wall shapes do not cover the painted mask accurately enough. Review the mask before importing.');
  const joinedPixels=prepared.solid.reduce((count,n,p)=>count+Number(!!n&&!solid[p]),0);
  return {walls,coverage,filledPixels,joinedPixels,gapRepairLimitPx:repairSmallGaps?Math.max(1,Math.min(16,Math.floor(gridSizePx*scale*.25)))/scale:0,workWidth:w,workHeight:h,solidMask:Buffer.from(fitted.solid.map(n=>n*255))};
}
