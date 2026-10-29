export type PaintRect={x:number;y:number;width:number;height:number};
export const overlaps=(a:PaintRect,b:PaintRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export const sameRect=(a:PaintRect|null,b:PaintRect|null)=>a===b||!!a&&!!b&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
/** Integer screen bounds include antialiasing at the old and new edges. */
export function dirtyRegions(rects:(PaintRect|null)[],width:number,height:number):PaintRect[]{
 const result:PaintRect[]=[];
 for(const rect of rects){
  if(!rect||!Number.isFinite(rect.x+rect.y+rect.width+rect.height))continue;
  const x=Math.max(0,Math.floor(rect.x)-3),y=Math.max(0,Math.floor(rect.y)-3);
  const right=Math.min(width,Math.ceil(rect.x+rect.width)+3),bottom=Math.min(height,Math.ceil(rect.y+rect.height)+3);
  if(right<=x||bottom<=y)continue;
  let next={x,y,width:right-x,height:bottom-y};
  for(let i=0;i<result.length;){
   const old=result[i];if(!overlaps(old,next)){i++;continue;}
   const right=Math.max(old.x+old.width,next.x+next.width),bottom=Math.max(old.y+old.height,next.y+next.height);
   next={x:Math.min(old.x,next.x),y:Math.min(old.y,next.y),width:0,height:0};next.width=right-next.x;next.height=bottom-next.y;
   result.splice(i,1);i=0;
  }
  result.push(next);
 }
 return result;
}
