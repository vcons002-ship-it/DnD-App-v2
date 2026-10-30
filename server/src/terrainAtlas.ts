import sharp from 'sharp';
export type LightBounds={left:number;top:number;right:number;bottom:number};
export type DecodedLight={pixels:Buffer;bounds:LightBounds};
export type AtlasCacheSync={
 newLights?:{key:string;pixels:Uint8Array;bounds:LightBounds}[];
 newMasks?:{key:string;pixels:Uint8Array}[];
 newGradedPngs?:{key:string;buffer:Uint8Array}[];
};
const lightRawCache=new Map<string,DecodedLight>();
const maskRawCache=new Map<string,Buffer>();
const gradedPngCache=new Map<string,Buffer>();
const emptyPngCache=new Map<string,Buffer>();
const baseInfoCache=new WeakMap<Buffer,{binaryAlpha:boolean;allOpaque:boolean}>();
export function toSharedBuffer(buf:Buffer):Buffer{
 if(buf.buffer instanceof SharedArrayBuffer&&buf.byteOffset===0&&buf.byteLength===buf.buffer.byteLength)return buf;
 const sab=new SharedArrayBuffer(buf.byteLength),shared=Buffer.from(sab);
 buf.copy(shared);return shared;
}
export function fromSharedBuffer(u:Uint8Array):Buffer{
 return Buffer.isBuffer(u)?u:Buffer.from(u.buffer,u.byteOffset,u.byteLength);
}
export function applyAtlasCacheSync(sync:AtlasCacheSync){
 for(const item of sync.newLights??[]){
  if(lightRawCache.has(item.key))continue;
  if(lightRawCache.size>=128)lightRawCache.delete(lightRawCache.keys().next().value!);
  lightRawCache.set(item.key,{pixels:fromSharedBuffer(item.pixels),bounds:item.bounds});
 }
 for(const item of sync.newMasks??[]){
  if(maskRawCache.has(item.key))continue;
  if(maskRawCache.size>=128)maskRawCache.delete(maskRawCache.keys().next().value!);
  maskRawCache.set(item.key,fromSharedBuffer(item.pixels));
 }
 for(const item of sync.newGradedPngs??[]){
  if(gradedPngCache.has(item.key))continue;
  if(gradedPngCache.size>=32)gradedPngCache.delete(gradedPngCache.keys().next().value!);
  gradedPngCache.set(item.key,fromSharedBuffer(item.buffer));
 }
}
function getBaseInfo(color:Buffer){
 let info=baseInfoCache.get(color);if(info)return info;
 let binaryAlpha=true,allOpaque=true;
 for(let p=3;p<color.length;p+=4){
  const a=color[p];
  if(a!==255){allOpaque=false;if(a!==0){binaryAlpha=false;break;}}
 }
 info={binaryAlpha,allOpaque};baseInfoCache.set(color,info);return info;
}
function computeLightBounds(light:Buffer,w:number,h:number):LightBounds{
 let left=w,top=h,right=0,bottom=0;
 for(let y=0;y<h;y++){
  const row=y*w;let first=-1,last=-1;
  for(let x=0;x<w;x++)if(light[row+x]){first=x;break;}
  if(first<0)continue;
  for(let x=w-1;x>=first;x--)if(light[row+x]){last=x+1;break;}
  if(y<top)top=y;bottom=y+1;
  if(first<left)left=first;if(last>right)right=last;
 }
 return {left,top,right,bottom};
}
async function decodeLight(svg:string,w:number,h:number,newLights?:NonNullable<AtlasCacheSync['newLights']>):Promise<DecodedLight>{
 const key=`${w}x${h}:${svg}`,hit=lightRawCache.get(key);
 if(hit){lightRawCache.delete(key);lightRawCache.set(key,hit);return hit;}
 const pixels=toSharedBuffer(await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer());
 const bounds=computeLightBounds(pixels,w,h),entry={pixels,bounds};
 if(lightRawCache.size>=128)lightRawCache.delete(lightRawCache.keys().next().value!);
 lightRawCache.set(key,entry);
 newLights?.push({key,pixels,bounds});
 return entry;
}
async function decodeMask(svg:string,w:number,h:number,newMasks?:NonNullable<AtlasCacheSync['newMasks']>):Promise<Buffer>{
 const key=`${w}x${h}:${svg}`,hit=maskRawCache.get(key);
 if(hit){maskRawCache.delete(key);maskRawCache.set(key,hit);return hit;}
 const pixels=toSharedBuffer(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
 if(maskRawCache.size>=128)maskRawCache.delete(maskRawCache.keys().next().value!);
 maskRawCache.set(key,pixels);
 newMasks?.push({key,pixels});
 return pixels;
}
/** Worker-only packing. Pixel clipping and illumination remain on the server. */
export async function terrainAtlas({baseKey,base:baseInput,width:w,height:h,columns,lightSvgs,maskSvgs,compact=false,onCache}:{baseKey?:string;base:{color:Buffer;gray:Buffer;grayPng?:Buffer}|Promise<{color:Buffer;gray:Buffer;grayPng?:Buffer}>;width:number;height:number;columns:number;lightSvgs:string[];maskSvgs:string[];compact?:boolean;onCache?:(sync:AtlasCacheSync)=>void}){
 const started=performance.now(),count=lightSvgs.length,rows=Math.ceil(count/columns),maskWidth=w*columns,maskHeight=h*rows;
 const uniqueLightSvgs=[...new Set(lightSvgs)],uniqueMaskSvgs=maskSvgs.length?[...new Set(maskSvgs)]:[];
 const newLights:NonNullable<AtlasCacheSync['newLights']>=[],newMasks:NonNullable<AtlasCacheSync['newMasks']>=[],newGradedPngs:NonNullable<AtlasCacheSync['newGradedPngs']>=[];
 let maskMs=0;
 const [base,lightEntries,maskEntries]=await Promise.all([
  baseInput,
  Promise.all(uniqueLightSvgs.map(async svg=>[svg,await decodeLight(svg,w,h,newLights)] as const)),
  uniqueMaskSvgs.length?(async()=>{const at=performance.now();const entries=await Promise.all(uniqueMaskSvgs.map(async svg=>[svg,await decodeMask(svg,w,h,newMasks)] as const));maskMs=performance.now()-at;return entries;})():Promise.resolve([] as const),
 ]);
 const lightBySvg=new Map(lightEntries),maskBySvg=uniqueMaskSvgs.length?new Map(maskEntries):undefined;
 const lights=lightSvgs.map(svg=>lightBySvg.get(svg)!),uniqueLights=[...lightBySvg.values()];
 const lightEnd=performance.now();
 const color32=new Uint32Array(base.color.buffer,base.color.byteOffset,w*h);
 const grade=({pixels:light,bounds:b}:DecodedLight)=>{
  const pixels=Buffer.from(base.gray),pixels32=new Uint32Array(pixels.buffer,pixels.byteOffset,w*h);
  for(let y=b.top;y<b.bottom;y++){
   const row=y*w;
   for(let x=b.left;x<b.right;x++){
    const i=row+x,alpha=light[i];if(!alpha)continue;
    if(alpha===255){pixels32[i]=color32[i];}
    else{const p=i*4,a=alpha/255,inv=1-a;pixels[p]=Math.round(base.gray[p]*inv+base.color[p]*a);pixels[p+1]=Math.round(base.gray[p+1]*inv+base.color[p+1]*a);pixels[p+2]=Math.round(base.gray[p+2]*inv+base.color[p+2]*a);}
   }
  }
  return pixels;
 };
 const encode=(b:Buffer,width:number,height:number)=>sharp(b,{raw:{width,height,channels:4}}).png({compressionLevel:1,adaptiveFiltering:false}).toBuffer();
 const encodeGradedSingle=async(svg:string,light:DecodedLight)=>{
  if(!baseKey)return encode(grade(light),w,h);
  const key=`${baseKey}:${w}x${h}:${svg}`,hit=gradedPngCache.get(key);
  if(hit){gradedPngCache.delete(key);gradedPngCache.set(key,hit);return hit;}
  const encoded=toSharedBuffer(await encode(grade(light),w,h));
  if(gradedPngCache.size>=32)gradedPngCache.delete(gradedPngCache.keys().next().value!);
  gradedPngCache.set(key,encoded);
  newGradedPngs.push({key,buffer:encoded});
  return encoded;
 };
 // Alpha compositing over a static gray image is exact for opaque artwork and
 // transparent padding. Preserve the full-image path for translucent art edges.
 const {binaryAlpha,allOpaque}=getBaseInfo(base.color);
 const split=compact&&binaryAlpha;
 const allSameLight=uniqueLights.length<=1||uniqueLights.every(light=>light.pixels.equals(uniqueLights[0].pixels));
 let region={left:0,top:0,width:w,height:h},background:Buffer|undefined;
 if(split){
  if(allSameLight){
   background=await encodeGradedSingle(lightSvgs[0],lights[0]);region={left:0,top:0,width:1,height:1};
  }else{
   background=base.grayPng??await encode(base.gray,w,h);
   let left=w,top=h,right=0,bottom=0;
   if(allOpaque){
    for(const {bounds:b} of uniqueLights)if(b.right>b.left){left=Math.min(left,b.left);top=Math.min(top,b.top);right=Math.max(right,b.right);bottom=Math.max(bottom,b.bottom);}
   }else{
    for(const {pixels:light,bounds:b} of uniqueLights)for(let y=b.top;y<b.bottom;y++)for(let x=b.left;x<b.right;x++)if(light[y*w+x]&&base.color[(y*w+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
   }
   region=right>left?{left,top,width:right-left,height:bottom-top}:{left:0,top:0,width:1,height:1};
  }
 }
 const width=region.width*columns,height=region.height*rows,mask=maskSvgs.length?Buffer.alloc(maskWidth*maskHeight*4):undefined;
 const constant=split&&allSameLight;
 let terrain:Buffer|undefined,preEncodedTerrain:Buffer|undefined;
 if(!split&&count===1){
  preEncodedTerrain=await encodeGradedSingle(lightSvgs[0],lights[0]);
  if(mask){const cover=maskBySvg!.get(maskSvgs[0])!;for(let y=0;y<h;y++)cover.copy(mask,y*maskWidth*4,y*w*4,(y+1)*w*4);}
 }else{
  if(!constant)terrain=Buffer.alloc(width*height*4);
  const terrain32=terrain?new Uint32Array(terrain.buffer,terrain.byteOffset,width*height):undefined;
  const gradedByLight=new Map<Buffer,Buffer>();
  for(let index=0;index<count;index++){
   const col=index%columns,row=Math.floor(index/columns);
   if(!split){
    let pixels=gradedByLight.get(lights[index].pixels);if(!pixels){pixels=grade(lights[index]);gradedByLight.set(lights[index].pixels,pixels);}
    for(let y=0;y<h;y++)pixels.copy(terrain!,((row*h+y)*width+col*w)*4,y*w*4,(y+1)*w*4);
   }else if(!constant){
    const {pixels:light,bounds:b}=lights[index];
    const x0=Math.max(0,b.left-region.left),x1=Math.min(region.width,b.right-region.left);
    const y0=Math.max(0,b.top-region.top),y1=Math.min(region.height,b.bottom-region.top);
    if(allOpaque){
     for(let y=y0;y<y1;y++){
      const srcRow=(region.top+y)*w+region.left,dstRow=(row*region.height+y)*width+col*region.width;
      for(let x=x0;x<x1;x++){
       const source=srcRow+x,alpha=light[source];if(alpha)terrain32![dstRow+x]=(color32[source]&0x00ffffff)|(alpha<<24);
      }
     }
    }else{
     for(let y=y0;y<y1;y++){
      const srcRow=(region.top+y)*w+region.left,dstRow=(row*region.height+y)*width+col*region.width;
      for(let x=x0;x<x1;x++){
       const source=srcRow+x,alpha=light[source];if(!alpha)continue;
       const c=color32[source];if(c>>>24)terrain32![dstRow+x]=(c&0x00ffffff)|(alpha<<24);
      }
     }
    }
   }
   if(mask){const cover=maskBySvg!.get(maskSvgs[index])!;for(let y=0;y<h;y++)cover.copy(mask,((row*h+y)*maskWidth+col*w)*4,y*w*4,(y+1)*w*4);}
  }
 }
 if(onCache&&(newLights.length||newMasks.length||newGradedPngs.length))onCache({...(newLights.length?{newLights}:{}),...(newMasks.length?{newMasks}:{}),...(newGradedPngs.length?{newGradedPngs}:{})});
 const blendEnd=performance.now();
 const encodeTerrain=async()=>{
  if(preEncodedTerrain)return preEncodedTerrain;
  if(constant){
   const emptyKey=`${width}x${height}`,hit=emptyPngCache.get(emptyKey);
   if(hit)return hit;
   const encoded=await encode(Buffer.alloc(width*height*4),width,height);
   emptyPngCache.set(emptyKey,encoded);return encoded;
  }
  return encode(terrain!,width,height);
 };
 const [encodedTerrain,encodedMask]=await Promise.all([encodeTerrain(),mask?encode(mask,maskWidth,maskHeight):undefined]);
 return {terrain:encodedTerrain,mask:encodedMask,width,height,maskWidth:mask?maskWidth:undefined,maskHeight:mask?maskHeight:undefined,base:background,region:split?region:undefined,timings:{lightsMs:lightEnd-started,blendMs:blendEnd-lightEnd,encodeMs:performance.now()-blendEnd,maskMs}};
}
