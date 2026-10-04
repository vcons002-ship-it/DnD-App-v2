/** Pixel-space rectangle fitting. All bounds are half-open, so touching walls join. */
export type MaskRectangle={x:number;y:number;right:number;bottom:number};
const area=(r:MaskRectangle)=>(r.right-r.x)*(r.bottom-r.y);
const contains=(a:MaskRectangle,b:MaskRectangle)=>a.x<=b.x&&a.y<=b.y&&a.right>=b.right&&a.bottom>=b.bottom;

function sumTable(mask:Uint8Array,w:number,h:number){
 const sums=new Int32Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=mask[y*w+x]?1:0;sums[(y+1)*(w+1)+x+1]=sums[y*(w+1)+x+1]+row;}}
 return sums;
}
function integral(mask:Uint8Array,w:number,h:number){
 const sums=sumTable(mask,w,h);
 return (r:MaskRectangle)=>sums[r.bottom*(w+1)+r.right]-sums[r.y*(w+1)+r.right]-sums[r.bottom*(w+1)+r.x]+sums[r.y*(w+1)+r.x];
}

/** Clipped windows keep walls at the image boundary instead of eroding the frame. */
function morphology(mask:Uint8Array,w:number,h:number,radius:number,erode=false){
 const sums=sumTable(mask,w,h),out=new Uint8Array(w*h),stride=w+1;
 for(let y=0;y<h;y++){
  const top=Math.max(0,y-radius),bottom=Math.min(h,y+radius+1),a=top*stride,b=bottom*stride;
  for(let x=0;x<w;x++){
   const left=Math.max(0,x-radius),right=Math.min(w,x+radius+1),count=sums[b+right]-sums[a+right]-sums[b+left]+sums[a+left];
   out[y*w+x]=erode?Number(count===(right-left)*(bottom-top)):Number(count>0);
  }
 }
 return out;
}

/** Reserve unpainted cuts BEFORE closing or fitting. Structural masks may repair
 * tiny cuts as paint breaks; precise mode reserves even one-pixel openings.
 * Both axes also protect offset corridors. Enclosed wall-outline interiors are filled
 * by the caller first; these reservations concern still-empty pixels only. */
function protectedGaps(mask:Uint8Array,w:number,h:number,maxSpan:number,gridPixels:number,repairSpan=0){
 const protectedPixels=new Uint8Array(mask.length);
 for(const transpose of [false,true]){
  const length=transpose?h:w,lines=transpose?w:h,index=(x:number,y:number)=>transpose?x*w+y:y*w+x;
  for(let y=0;y<lines;y++){
   let x=0;
   while(x<length){
    if(mask[index(x,y)]){x++;continue;}
    const start=x;while(x<length&&!mask[index(x,y)])x++;
    if(start===0||x===length||x-start>maxSpan||x-start<=repairSpan)continue;
    let reserved=true;for(let p=start;p<x;p++)if(!protectedPixels[index(p,y)]){reserved=false;break;}
    if(reserved)continue;
    // A notch or fleck inside a wall is not a through-opening. Inspect a small
    // window across the painted thickness: empty pixels must connect both sides.
    const support=Math.max(1,Math.min(2,Math.round(gridPixels*.05))),left=Math.max(0,start-1-support),right=Math.min(length-1,x+support);
    if(!mask[index(left,y)]||!mask[index(right,y)])continue;
    let lo=y,hi=y;
    while(lo>0&&(mask[index(left,lo-1)]||mask[index(right,lo-1)]))lo--;
    while(hi<lines-1&&(mask[index(left,hi+1)]||mask[index(right,hi+1)]))hi++;
    if(hi-lo+1<Math.max(2,Math.min(5,Math.round(gridPixels*.1))))continue;
    lo=Math.max(0,lo-1);hi=Math.min(lines-1,hi+1);
    const ww=right-left+1,hh=hi-lo+1,seen=new Uint8Array(ww*hh),queue:number[]=[];
    for(let p=start;p<x;p++){const q=(y-lo)*ww+p-left;seen[q]=1;queue.push(q);}
    let touchesTop=false,touchesBottom=false;
    for(let n=0;n<queue.length;n++){
     const q=queue[n],xx=q%ww,yy=Math.floor(q/ww);touchesTop ||= yy===0;touchesBottom ||= yy===hh-1;
     for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=xx+dx,ny=yy+dy,next=ny*ww+nx;
      if(nx>=0&&nx<ww&&ny>=0&&ny<hh&&!seen[next]&&!mask[index(nx+left,ny+lo)]){seen[next]=1;queue.push(next);}
     }
    }
    if(touchesTop&&touchesBottom)for(const q of queue)protectedPixels[index(q%ww+left,Math.floor(q/ww)+lo)]=1;
   }
  }
 }
 return protectedPixels;
}

function paint(mask:Uint8Array,w:number,r:MaskRectangle){for(let y=r.y;y<r.bottom;y++)mask.fill(1,y*w+r.x,y*w+r.right);}

/** A wider chipped end of the same seam can reserve its entire connected empty
 * region. Release only locally short, paint-supported runs that closing filled. */
function releaseSmallCuts(protectedPixels:Uint8Array,input:Uint8Array,closed:Uint8Array,w:number,h:number,span:number){
 for(const transpose of [false,true]){
  const length=transpose?h:w,lines=transpose?w:h,index=(x:number,y:number)=>transpose?x*w+y:y*w+x;
  for(let y=0;y<lines;y++)for(let x=0;x<length;){
   if(input[index(x,y)]){x++;continue;}
   const start=x;while(x<length&&!input[index(x,y)])x++;
   if(!start||x===length||x-start>span)continue;
   for(let q=start;q<x;q++){const p=index(q,y);if(closed[p])protectedPixels[p]=0;}
  }
 }
}

/** Square closing cannot reconnect a thin diagonal stroke: erosion removes the
 * bridge again. Join only short breaks supported by continuing paint on both
 * ends, using the original raster so repairs never grow into longer chains. */
function repairShortPaintBreaks(input:Uint8Array,w:number,h:number,span:number){
 const repaired=input.slice();
 const at=(x:number,y:number)=>x>=0&&x<w&&y>=0&&y<h&&!!input[y*w+x];
 const directions=[[1,0],[0,1],[1,1],[1,-1],[2,1],[2,-1],[1,2],[1,-2]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(input[y*w+x])for(const [dx,dy] of directions){
  if(!at(x-dx,y-dy)||at(x+dx,y+dy))continue;
  const steps=Math.floor(span/Math.hypot(dx,dy));
  for(let n=2;n<=steps;n++){
   const endX=x+n*dx,endY=y+n*dy;
   if(endX<0||endX>=w||endY<0||endY>=h)break;
   if(!at(endX,endY))continue;
   if(at(endX+dx,endY+dy)){
    // A supercover line joins the pixel cells, including steep diagonals.
    const count=Math.max(Math.abs(endX-x),Math.abs(endY-y));
    for(let i=1;i<count;i++){
     const px=x+(endX-x)*i/count,py=y+(endY-y)*i/count;
     repaired[Math.floor(py)*w+Math.floor(px)]=1;
     repaired[Math.ceil(py)*w+Math.ceil(px)]=1;
    }
   }
   break;
  }
 }
 return repaired;
}

/** Fits broad supported wall bands instead of allocating a wall to every edge sliver.
 * The limits are fractions of one grid square, capped in the 800px working raster.
 * Nothing in fitting, merging or connector creation may occupy a reserved gap. */
export function prepareWallMask(input:Uint8Array,w:number,h:number,gridPixels:number,repairSmallGaps=false){
 const tolerance=Math.max(1,Math.min(2,Math.round(gridPixels*.06)));
 const repairSpan=repairSmallGaps?Math.max(1,Math.min(16,Math.floor(gridPixels*.25))):0;
 const repairRadius=Math.max(1,Math.min(5,Math.round(gridPixels*.15)),Math.ceil(repairSpan/2));
 // Structural top-cap masks may contain mortar seams and partial paint breaks.
 // Close cuts up to one quarter of a grid square; wider passages stay reserved.
 // Natural boundaries and colored opening footprints can retain every cut.
 const supported=repairSmallGaps?repairShortPaintBreaks(input,w,h,repairSpan):input;
 const protectedPixels=protectedGaps(supported,w,h,2*(repairRadius+tolerance)+1,gridPixels,repairSpan);
 const solid=morphology(morphology(supported,w,h,repairRadius),w,h,repairRadius,true);
 if(repairSmallGaps)releaseSmallCuts(protectedPixels,supported,solid,w,h,repairSpan);
 for(let p=0;p<solid.length;p++)if(protectedPixels[p])solid[p]=0;
 return {solid,protectedPixels,tolerance};
}
export async function fitWallMask(input:Uint8Array,w:number,h:number,gridPixels:number,limit=120,repairSmallGaps=false){
 const {solid,protectedPixels,tolerance}=prepareWallMask(input,w,h,gridPixels,repairSmallGaps);
 const allowed=morphology(solid,w,h,tolerance);
 for(let p=0;p<allowed.length;p++)if(protectedPixels[p])allowed[p]=0;
 const count=integral(solid,w,h),forbidden=integral(Uint8Array.from(allowed,n=>Number(!n)),w,h);
 const candidates:MaskRectangle[]=[],keys=new Set<string>(),heights=new Int32Array(w),stack=new Int32Array(w+1);
 for(let y=0;y<h;y++){
  for(let x=0;x<w;x++)heights[x]=allowed[y*w+x]?heights[x]+1:0;
  let top=0;
  for(let x=0;x<=w;x++){
   const current=x<w?heights[x]:0;
   while(top&&heights[stack[top-1]]>current){
    const high=heights[stack[--top]],left=top?stack[top-1]+1:0;
    if(high<2||x-left<2)continue;
    // The same band appears in the histogram on every row. Keep only its
    // maximal extent instead of scoring thousands of contained prefixes.
    if(y+1<h&&!forbidden({x:left,y:y+1,right:x,bottom:y+2}))continue;
    const r={x:left,y:y-high+1,right:x,bottom:y+1};
    // Trim dilation padding; at least half of each remaining edge needs mask support.
    for(let n=0;n<4*tolerance;n++){
     if(r.right-r.x<=2||r.bottom-r.y<=2)break;
     const strips=[{...r,right:r.x+1},{...r,x:r.right-1},{...r,bottom:r.y+1},{...r,y:r.bottom-1}];
     const densities=strips.map(s=>count(s)/area(s)),lowest=Math.min(...densities);
     if(lowest>=.5)break;
     switch(densities.indexOf(lowest)){case 0:r.x++;break;case 1:r.right--;break;case 2:r.y++;break;case 3:r.bottom--;break;}
    }
    const key=`${r.x},${r.y},${r.right},${r.bottom}`;
    if(area(r)>=12&&count(r)/area(r)>=.88&&!keys.has(key)){keys.add(key);candidates.push(r);}
   }
   stack[top++]=x;
  }
 }
 // Boundary slivers may be ignored, but the solid core must remain continuous,
 // including along diagonal walls where separated rectangles would leak sight.
 const core=morphology(solid,w,h,1,true);
 const picked:MaskRectangle[]=[],covered=new Uint8Array(w*h);let remaining=solid.slice();
 for(let n=0;n<limit;n++){
  // Mask fitting is an offline draft operation, but gameplay sockets must still
  // get time to run while the host converts a detailed map.
  await new Promise<void>(resolve=>setImmediate(resolve));
  const fresh=integral(remaining,w,h),uncoveredCore=integral(Uint8Array.from(core,(n,p)=>n&&!covered[p]?1:0),w,h);let best:MaskRectangle|undefined,score=11;
  for(const r of candidates){const value=fresh(r)+16*uncoveredCore(r)-1.5*(area(r)-count(r));if(value>score){score=value;best=r;}}
  if(!best)break;
  picked.push(best);paint(covered,w,best);
  const nearby=morphology(covered,w,h,tolerance);
  remaining=Uint8Array.from(solid,(n,p)=>n&&(!nearby[p]||(core[p]&&!covered[p]))?1:0);
 }
 // A merge must be supported everywhere, including the protected cuts.
 while(true){
  let best:{i:number;j:number;r:MaskRectangle}|undefined,cost=Infinity;
  for(let i=0;i<picked.length;i++)for(let j=i+1;j<picked.length;j++){
   const a=picked[i],b=picked[j],r={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)},extra=area(r)-count(r);
   if(!forbidden(r)&&extra/area(r)<=.12&&extra<cost){best={i,j,r};cost=extra;}
  }
  if(!best)break;
  picked[best.i]=best.r;picked.splice(best.j,1);
 }
 // Trimming must not introduce hairline sight leaks at joins. Only bridge using
 // fully painted support, never by extending a wall into the gap reservation.
 const initial=[...picked];
 for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++)for(const transpose of [false,true]){
  const swap=(r:MaskRectangle)=>transpose?{x:r.y,y:r.x,right:r.bottom,bottom:r.right}:r;
  let a=swap(initial[i]),b=swap(initial[j]);if(a.x>b.x)[a,b]=[b,a];
  const gap=b.x-a.right,lo=Math.max(a.y,b.y),hi=Math.min(a.bottom,b.bottom);
  if(gap<=0||gap>2*tolerance||hi-lo<2)continue;
  let start=-1,best:MaskRectangle|undefined;
  for(let y=lo;y<=hi;y++){
   const r=swap({x:a.right-1,y,right:b.x+1,bottom:y+1}),supported=y<hi&&count(r)===area(r);
   if(supported&&start<0)start=y;
   if(!supported&&start>=0){const candidate=swap({x:a.right-1,y:start,right:b.x+1,bottom:y});if(y-start>=2&&(!best||area(candidate)>area(best)))best=candidate;start=-1;}
  }
  if(best&&!picked.some(r=>contains(r,best!))){if(picked.length>=limit)throw new Error('Mask is too complex to preserve wall joins within the wall limit.');picked.push(best);}
 }
 covered.fill(0);for(const r of picked)paint(covered,w,r);
 // Tiny cores can be too small to win the broad-band scoring threshold. Retain
 // them with an exact supported patch rather than silently leaving a sight leak.
 for(let p=0;p<core.length;p++)if(core[p]&&!covered[p]){
  await new Promise<void>(resolve=>setImmediate(resolve));
  let r:MaskRectangle={x:p%w,y:Math.floor(p/w),right:p%w+1,bottom:Math.floor(p/w)+1};
  while(true){
   const extensions=[{...r,x:r.x-1},{...r,right:r.right+1},{...r,y:r.y-1},{...r,bottom:r.bottom+1}];
   const next=extensions.filter(q=>q.x>=0&&q.y>=0&&q.right<=w&&q.bottom<=h&&count(q)===area(q)).sort((a,b)=>area(b)-area(a))[0];
   if(!next)break;r=next;
  }
  for(let i=picked.length-1;i>=0;i--)if(contains(r,picked[i]))picked.splice(i,1);
  if(picked.length>=limit)throw new Error('Mask is too complex to preserve continuous walls within the wall limit.');
  picked.push(r);paint(covered,w,r);
 }
 let original=0,represented=0;for(let p=0;p<input.length;p++)if(input[p]){original++;if(covered[p])represented++;}
 return {rectangles:picked,coverage:original?represented/original:0,solid,protectedPixels};
}
