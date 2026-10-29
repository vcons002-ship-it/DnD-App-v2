import {parentPort} from 'node:worker_threads';
import {createLegacyVisionGeometry,legacyPath} from '../../shared/legacyVision.js';
import type {OutlineSet} from '../../shared/legacyVision.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from '../../shared/mapWalls.js';
import type {VisionJob,RasterJob,MaskTilesJob,MaskTilesResult} from './visibilityWorkers.js';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {visionShowsAffinity} from '../../shared/playerVision.js';
import {movementPreview,type MovementPreviewJob} from '../../shared/movementPreview.js';
import {walkingTerrain,type WalkSightJob} from '../../shared/explorationSight.js';
import type {TerrainFramesJob} from './legacyTerrain.js';
import {terrainAtlas} from './terrainAtlas.js';
const maps=new Map<string,ReturnType<typeof createLegacyVisionGeometry>>();
const outlines=new Map<string,OutlineSet>();
const tileCache=new Map<string,Buffer>();let tileBytes=0;
const terrainCache=new Map<string,{color:Buffer;gray:Buffer;grayPng:Buffer}>();
parentPort!.on('message',async({id,job,diagnostic}:{id:number;job:VisionJob|MovementPreviewJob|RasterJob|MaskTilesJob|WalkSightJob|TerrainFramesJob;diagnostic?:boolean})=>{
 const start=performance.now();
 try{
  if('terrainFrames' in job){
   const {key,images,bounds,columns,maskSvgs,lightSvgs,compact}=job.terrainFrames,{width:w,height:h,scale}=bounds;
   let base=terrainCache.get(key);
   if(!base){
    const layers=[];for(const i of images){const {data,info}=await sharp(i.file,{limitInputPixels:40_000_000}).resize(Math.max(1,Math.round(i.w*scale)),Math.max(1,Math.round(i.h*scale)),{fit:'fill'}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});layers.push({input:data,raw:{width:info.width,height:info.height,channels:4 as const},left:Math.round((i.x-bounds.x)*scale),top:Math.round((i.y-bounds.y)*scale)});}
    // Keep intermediates raw: encoding each source and the composed map to PNG
    // only to decode them immediately added a cold-bounds latency spike.
    const color=await sharp({create:{width:w,height:h,channels:4,background:'#00000000'}}).composite(layers).toColourspace('srgb').ensureAlpha().raw().toBuffer();
    const grayPng=await sharp(color,{raw:{width:w,height:h,channels:4}}).grayscale().modulate({brightness:.78}).png({compressionLevel:3}).toBuffer();
    // A new pipeline is required: grayscale() can force raw one/two-channel
    // output despite a colorspace request in the same Sharp pipeline.
    base={color,gray:await sharp(grayPng).toColourspace('srgb').ensureAlpha().raw().toBuffer(),grayPng};
    if(base.color.length!==w*h*4||base.gray.length!==w*h*4)throw new Error('Terrain grading requires RGBA buffers');
    if(terrainCache.size>=8)terrainCache.delete(terrainCache.keys().next().value!);terrainCache.set(key,base);
   }
   const result=await terrainAtlas({base,width:w,height:h,columns,maskSvgs,lightSvgs,compact});parentPort!.postMessage({id,result,ms:performance.now()-start,...(diagnostic?{terrain:result.timings}:{})});return;
  }
  if('walkSight' in job){parentPort!.postMessage({id,result:walkingTerrain(job),ms:performance.now()-start});return;}
  if('maskTiles' in job){
   const {svg,width,height,tileSize}=job.maskTiles;
   const raw=await sharp(Buffer.from(svg),{limitInputPixels:8_000_000}).ensureAlpha().raw().toBuffer();
   const detail=diagnostic?{rasterMs:performance.now()-start,copyHashMs:0,encodeMs:0,tiles:0,encodedTiles:0}:undefined;
   const result:MaskTilesResult={tiles:[]};
   for(let y=0;y<height;y+=tileSize)for(let x=0;x<width;x+=tileSize){
    const tileStart=detail?performance.now():0;
    const w=Math.min(tileSize,width-x),h=Math.min(tileSize,height-y),pixels=Buffer.allocUnsafe(w*h*4);
    for(let row=0;row<h;row++)raw.copy(pixels,row*w*4,((y+row)*width+x)*4,((y+row)*width+x+w)*4);
    // Pixel identity reuses a tile even when changing polygons outside the tile
    // changed its SVG input. Cache hits avoid PNG encoding and client downloads.
    const key=createHash('sha256').update(`${w}:${h}:rgba:`).update(pixels).digest('hex');
    if(detail){detail.copyHashMs+=performance.now()-tileStart;detail.tiles++;}
    let buffer=tileCache.get(key);
    if(buffer){tileCache.delete(key);tileCache.set(key,buffer);}
    else{const encodeStart=detail?performance.now():0;buffer=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();if(detail){detail.encodeMs+=performance.now()-encodeStart;detail.encodedTiles++;}tileCache.set(key,buffer);tileBytes+=buffer.length;}
    while(tileBytes>32*1024*1024&&tileCache.size>1){const [old,b]=tileCache.entries().next().value!;tileCache.delete(old);tileBytes-=b.length;}
    result.tiles.push({x,y,width:w,height:h,key,buffer});
   }
   parentPort!.postMessage({id,result,ms:performance.now()-start,...(detail?{detail}:{})});return;
  }
  if('svg' in job){const image=sharp(Buffer.from(job.svg),{limitInputPixels:8_000_000});const result=await (job.format==='webp'?image.webp({lossless:true,effort:0}):image.png()).toBuffer();parentPort!.postMessage({id,result,ms:performance.now()-start});return;}
  if('token' in job){parentPort!.postMessage({id,result:movementPreview(job),ms:performance.now()-start});return;}
  let geometry=maps.get(job.mapId);if(!geometry){if(maps.size>=16)maps.delete(maps.keys().next().value!);geometry=createLegacyVisionGeometry();maps.set(job.mapId,geometry);}
  const paths=geometry(job.vision,job.wallFog);
  const memory=(job.explored??[]).map(p=>p.map(r=>legacyPath(r.map(([x,y])=>({x,y})))).join(''));
  const affinity=job.tokens.filter(t=>!t.sharedSightOnly&&visionShowsAffinity(job.vision,t.x,t.y)).map(t=>t.id);
  let prepared:OutlineSet|undefined;
  if(job.detailed){
   const wallsKey=JSON.stringify(job.vision.walls??[]);
   let cached=outlines.get(job.mapId);
   if(!cached||cached.wallsKey!==wallsKey){cached={wallsKey,shapes:{}};if(outlines.size>=16)outlines.delete(outlines.keys().next().value!);outlines.set(job.mapId,cached);}
   prepared={wallsKey,shapes:{}};
   const add=(p:{id:string;x:number;y:number},radius:number)=>{
    const key=p.id+':'+radius,old=cached!.shapes[key];
    const shape=old?.x===p.x&&old.y===p.y?old:{x:p.x,y:p.y,points:wallVisibilityPolygon(p,job.vision.walls??[],radius)};
    prepared!.shapes[key]=shape;cached!.shapes[key]=shape;
   };
   for(const p of job.vision.origins){add(p,SIGHT_EXTENT);add(p,job.vision.radius);}
   for(const p of job.vision.lights)if(!p.transient)add(p,SIGHT_EXTENT);
   cached.shapes={...prepared.shapes};
  }
  parentPort!.postMessage({id,result:{...paths,memory,affinity,...(prepared?{outlines:prepared}:{})},ms:performance.now()-start});
 }catch(error){parentPort!.postMessage({id,error:String(error),ms:performance.now()-start});}
});
