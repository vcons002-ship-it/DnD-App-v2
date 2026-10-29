import sharp from 'sharp';

export function closestImageAspect(width:number,height:number):string {
 const ratios=['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];
 const distance=(r:string)=>{const [w,h]=r.split(':').map(Number);return Math.abs(Math.log((width/height)/(w/h)));};
 return ratios.sort((a,b)=>distance(a)-distance(b))[0];
}

/** Fit a map onto a supported canvas without stretching or cropping its art. */
export async function padMapReference(image:Buffer){
 const normalized=await sharp(image).rotate().png().toBuffer(),meta=await sharp(normalized).metadata();
 const width=meta.width!,height=meta.height!;
 const aspectRatio=closestImageAspect(width,height),[a,b]=aspectRatio.split(':').map(Number);
 const unit=Math.ceil(Math.max(width/a,height/b)),paddedWidth=a*unit,paddedHeight=b*unit;
 const left=Math.floor((paddedWidth-width)/2),top=Math.floor((paddedHeight-height)/2);
 const padded=await sharp(normalized).extend({left,top,right:paddedWidth-width-left,bottom:paddedHeight-height-top,background:'#101010'})
   .resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 return {image:padded,framing:{width,height,paddedWidth,paddedHeight,left,top,aspectRatio}};
}

/** Restore annotations to the original coordinates, including arbitrary ratios. */
export async function restoreMapMask(image:Buffer,framing:Awaited<ReturnType<typeof padMapReference>>['framing']){
 const meta=await sharp(image).metadata();
 if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(framing.paddedWidth/framing.paddedHeight)))>.04)
   throw Error(`The AI annotation image has an unexpected aspect ratio (${meta.width??'?'} × ${meta.height??'?'}; expected ${framing.aspectRatio}). No draft was applied. Try again or analyze selected regions.`);
 return sharp(image).resize(framing.paddedWidth,framing.paddedHeight,{fit:'fill'})
   .extract({left:framing.left,top:framing.top,width:framing.width,height:framing.height}).png().toBuffer();
}
