import sharp from 'sharp';
/** Worker-only packing. Pixel clipping and illumination remain on the server. */
export async function terrainAtlas({base,width:w,height:h,columns,lightSvgs,maskSvgs,compact=false}:{base:{color:Buffer;gray:Buffer;grayPng?:Buffer};width:number;height:number;columns:number;lightSvgs:string[];maskSvgs:string[];compact?:boolean}){
 const started=performance.now(),count=lightSvgs.length,rows=Math.ceil(count/columns),maskWidth=w*columns,maskHeight=h*rows;
 const lights:Buffer[]=[];for(const svg of lightSvgs)lights.push(await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer());
 const lightEnd=performance.now();
 const grade=(light:Buffer)=>{const pixels=Buffer.from(base.gray);for(let i=0;i<light.length;i++){
  const alpha=light[i];if(!alpha)continue;const p=i*4;
  if(alpha===255){pixels[p]=base.color[p];pixels[p+1]=base.color[p+1];pixels[p+2]=base.color[p+2];}
  else{const a=alpha/255;for(let c=0;c<3;c++)pixels[p+c]=Math.round(base.gray[p+c]*(1-a)+base.color[p+c]*a);}
 }return pixels;};
 const encode=(b:Buffer,width:number,height:number)=>sharp(b,{raw:{width,height,channels:4}}).png({compressionLevel:3}).toBuffer();
 // Alpha compositing over a static gray image is exact for opaque artwork and
 // transparent padding. Preserve the full-image path for translucent art edges.
 let binaryAlpha=true;for(let p=3;p<base.color.length;p+=4)if(base.color[p]!==0&&base.color[p]!==255){binaryAlpha=false;break;}
 const split=compact&&binaryAlpha;
 let region={left:0,top:0,width:w,height:h},background:Buffer|undefined;
 if(split){
  if(lights.every(light=>light.equals(lights[0]))){
   background=await encode(grade(lights[0]),w,h);region={left:0,top:0,width:1,height:1};
  }else{
   background=base.grayPng??await encode(base.gray,w,h);
   let left=w,top=h,right=0,bottom=0;
   for(const light of lights)for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(light[y*w+x]&&base.color[(y*w+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
   region=right>left?{left,top,width:right-left,height:bottom-top}:{left:0,top:0,width:1,height:1};
  }
 }
 const width=region.width*columns,height=region.height*rows,terrain=Buffer.alloc(width*height*4),mask=maskSvgs.length?Buffer.alloc(maskWidth*maskHeight*4):undefined;let maskMs=0;
 const constant=split&&lights.every(light=>light.equals(lights[0]));
 for(let index=0;index<count;index++){
  const col=index%columns,row=Math.floor(index/columns);
  if(!split){const pixels=grade(lights[index]);for(let y=0;y<h;y++)pixels.copy(terrain,((row*h+y)*width+col*w)*4,y*w*4,(y+1)*w*4);}
  else if(!constant){
   const light=lights[index];
   for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
    const source=(region.top+y)*w+region.left+x,alpha=light[source];if(!alpha||!base.color[source*4+3])continue;
    const target=((row*region.height+y)*width+col*region.width+x)*4,p=source*4;
    terrain[target]=base.color[p];terrain[target+1]=base.color[p+1];terrain[target+2]=base.color[p+2];terrain[target+3]=alpha;
   }
  }
  if(mask){const at=performance.now(),cover=await sharp(Buffer.from(maskSvgs[index])).ensureAlpha().raw().toBuffer();maskMs+=performance.now()-at;for(let y=0;y<h;y++)cover.copy(mask,((row*h+y)*maskWidth+col*w)*4,y*w*4,(y+1)*w*4);}
 }
 const blendEnd=performance.now();
 const [encodedTerrain,encodedMask]=await Promise.all([encode(terrain,width,height),mask?encode(mask,maskWidth,maskHeight):undefined]);
 return {width,height,maskWidth,maskHeight,terrain:encodedTerrain,...(encodedMask?{mask:encodedMask}:{}),...(split?{base:background,region}:{}),timings:{lightsMs:lightEnd-started,blendMs:blendEnd-lightEnd,encodeMs:performance.now()-blendEnd,maskMs}};
}
