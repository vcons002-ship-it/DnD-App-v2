import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp,{type OverlayOptions} from 'sharp';
import {config} from './config.js';
import {generateApiImage,closestImageAspect} from './ai/imageGateway.js';
import type {MapAnalysisRegion} from '../../shared/mapAnalysisRegions.js';
/** Send only selected pixels. Pad arbitrary crop ratios for the image API, then
 * restore mask pixels to original coordinates; untouched map pixels stay exact. */
export async function generateMapRegionMask(prompt:string,image:Buffer,width:number,height:number,regions:readonly MapAnalysisRegion[]){
 const normalized=await sharp(image).rotate().resize(width,height,{fit:'fill'}).png().toBuffer();
 const overlays:OverlayOptions[]=[],outputs=[];
 const crops=regions.map(region=>{
  const left=Math.floor(region.ax*width),top=Math.floor(region.ay*height),right=Math.ceil(region.bx*width),bottom=Math.ceil(region.by*height),w=right-left,h=bottom-top;
  if(w<16||h<16)throw Error('Each selected region must be at least 16 pixels wide and tall.');
  return {region,left,top,w,h};
 });
 for(const {region,left,top,w,h} of crops){
  const[a,b]=closestImageAspect(w,h).split(':').map(Number),ratio=a/b;
  const paddedW=Math.max(w,Math.ceil(h*ratio)),paddedH=Math.max(h,Math.ceil(w/ratio));
  const padLeft=Math.floor((paddedW-w)/2),padTop=Math.floor((paddedH-h)/2);
  const crop=await sharp(normalized).extract({left,top,width:w,height:h}).extend({left:padLeft,right:paddedW-w-padLeft,top:padTop,bottom:paddedH-h-padTop,background:'#101010'}).png().toBuffer();
  const result=await generateApiImage(prompt,{width:2048,height:Math.round(2048/ratio)},[{mimeType:'image/png',data:crop.toString('base64')}]);
  if('error' in result)return result;
  const raw=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path))),meta=await sharp(raw).metadata();
  if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(paddedW/paddedH)))>.04)throw Error('The region mask changed framing. No draft was applied.');
  const mask=await sharp(raw).resize(paddedW,paddedH,{fit:'fill'}).extract({left:padLeft,top:padTop,width:w,height:h}).png().toBuffer();
  overlays.push({input:mask,left,top});outputs.push({region,crop:{left,top,width:w,height:h},padding:{left:padLeft,top:padTop,width:paddedW,height:paddedH},rawMaskImagePath:result.path});
 }
 const filename=`region-mask-${randomUUID()}.png`;
 await fs.mkdir(config.uploadsDir,{recursive:true});
 await sharp(normalized).composite(overlays).png().toFile(path.join(config.uploadsDir,filename));
 await fs.writeFile(path.join(config.uploadsDir,filename+'.json'),JSON.stringify({width,height,outputs},null,2));
 return {path:`/uploads/${filename}`};
}
