import sharp from 'sharp';
import type {DoorMarker} from '../../shared/mapDoorDraft.js';

/** Convex pixel outline avoids a PCA bounding box expanding skewed door faces. */
function footprint(pixels:number[],width:number){
 const rows=new Map<number,[number,number]>();for(const p of pixels){const y=Math.floor(p/width),x=p%width,r=rows.get(y);rows.set(y,r?[Math.min(r[0],x),Math.max(r[1],x)]:[x,x]);}
 const points=[...rows].flatMap(([y,[lo,hi]])=>[{x:lo,y},{x:hi+1,y},{x:lo,y:y+1},{x:hi+1,y:y+1}]).sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const half=(points:{x:number;y:number}[])=>{const result:typeof points=[];for(const p of points){while(result.length>1&&cross(result.at(-2)!,result.at(-1)!,p)<=0)result.pop();result.push(p);}return result;};
 const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const hull=[...lower,...upper];
 while(hull.length>32){let index=0,area=Infinity;for(let i=0;i<hull.length;i++){const a=Math.abs(cross(hull[(i+hull.length-1)%hull.length],hull[i],hull[(i+1)%hull.length]));if(a<area){area=a;index=i;}}hull.splice(index,1);}
 return hull;
}

export const DOOR_MASK_PROMPT='Paint every visible door and gate in this overhead/isometric battle map completely solid opaque cyan (#00FFFF). Cover the entire door, including its frame, with a flat mask that hides all texture and details. Mark only doors and gates actually shown. Keep the map unchanged otherwise.';

/** Retain each filled door's footprint; fitting derives its crossing direction
 * from the adjoining wall caps, since a visible door face may be taller than wide. */
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
    if(length<8)continue;
    if(length>w*.25||thickness>w*.25)throw new Error('Door masks must cover separate doors, not broad rooms or map areas.');
    const clamp=(v:number,max:number)=>Math.max(0,Math.min(max,v));
    const point=(along:number,across:number)=>({x:clamp((cx+tx*along-ty*across)*width/w,width),y:clamp((cy+ty*along+tx*across)*height/h,height)});
    doors.push({id:`ai-door-${doors.length+1}`,ax:point(lo-.5,0).x,ay:point(lo-.5,0).y,bx:point(hi+.5,0).x,by:point(hi+.5,0).y,thickness:Math.min(thickness*width/w,width*.035),footprint:footprint(queue,w).map(p=>({x:p.x*width/w,y:p.y*height/h}))});
  }
  if(doors.length>64)throw new Error('Too many door markers; review the mask.');
  return doors;
}
