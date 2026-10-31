import {parentPort} from 'node:worker_threads';
import {createLegacyVisionGeometry,legacyPath} from '../../shared/legacyVision.js';
import type {OutlineSet,CachedPolygon} from '../../shared/legacyVision.js';
import {SIGHT_EXTENT} from '../../shared/mapWalls.js';
import type {GeometryJob,RasterJob,MaskTilesJob,MaskTilesResult,WorkerCacheSync} from './visibilityWorkers.js';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {visionShowsAffinity} from '../../shared/playerVision.js';
import {movementPreview,type MovementPreviewJob} from '../../shared/movementPreview.js';
import {walkingTerrain,type WalkSightJob} from '../../shared/explorationSight.js';
import type {TerrainFramesJob} from './legacyTerrain.js';
import {terrainAtlas,applyAtlasCacheSync,toSharedBuffer,fromSharedBuffer} from './terrainAtlas.js';
type PolygonObserver=(wallsKey:string,key:string,entry:CachedPolygon)=>void;
type GeometryEntry={geometry:ReturnType<typeof createLegacyVisionGeometry>;observer:{current?:PolygonObserver}};
const maps=new Map<string,GeometryEntry>();
const outlines=new Map<string,OutlineSet>();
const tileCache=new Map<string,Buffer>();let tileBytes=0;
const maskResultCache=new Map<string,MaskTilesResult>();
const terrainCache=new Map<string,{color:Buffer;gray:Buffer;grayPng:Buffer}>();
function storeTile(key:string,buffer:Buffer){
 const existing=tileCache.get(key);
 if(existing){tileCache.delete(key);tileCache.set(key,existing);return;}
 tileCache.set(key,buffer);tileBytes+=buffer.length;
 while(tileBytes>32*1024*1024&&tileCache.size>1){const [old,b]=tileCache.entries().next().value!;tileCache.delete(old);tileBytes-=b.length;}
}
function getMapGeometry(mapId:string){
 let g=maps.get(mapId);
 if(!g){
  if(maps.size>=16)maps.delete(maps.keys().next().value!);
  // The cached geometry relays to the current job, including when its first
  // use was a cache sync. Never retain a completed job's polygon collection.
  const observer:GeometryEntry['observer']={};
  g={geometry:createLegacyVisionGeometry((...args)=>observer.current?.(...args)),observer};
  maps.set(mapId,g);
 }
 return g;
}
function applySync(sync:WorkerCacheSync){
 applyAtlasCacheSync(sync);
 for(const b of sync.newBases??[]){
  if(terrainCache.has(b.key))continue;
  if(terrainCache.size>=8)terrainCache.delete(terrainCache.keys().next().value!);
  terrainCache.set(b.key,{color:fromSharedBuffer(b.color),gray:fromSharedBuffer(b.gray),grayPng:fromSharedBuffer(b.grayPng)});
 }
 for(const t of sync.newTiles??[])storeTile(t.key,fromSharedBuffer(t.buffer));
 for(const m of sync.newMaskResults??[]){
  if(maskResultCache.has(m.key))continue;
  if(maskResultCache.size>=32)maskResultCache.delete(maskResultCache.keys().next().value!);
  maskResultCache.set(m.key,{tiles:m.result.tiles.map(t=>({...t,buffer:fromSharedBuffer(t.buffer)}))});
 }
 for(const p of sync.newPolygons??[]){
  const g=getMapGeometry(p.mapId);
  g.geometry.seed(p.wallsKey,p.entries);
 }
}
parentPort!.on('message',async(msg:{id?:number;job?:GeometryJob|MovementPreviewJob|RasterJob|MaskTilesJob|WalkSightJob|TerrainFramesJob;diagnostic?:boolean;syncCache?:WorkerCacheSync})=>{
 if(msg.syncCache){applySync(msg.syncCache);return;}
 const {id,job,diagnostic}=msg;if(id===undefined||!job)return;
 const start=performance.now();
 let polygonObserver:GeometryEntry['observer']|undefined;
 try{
  if('terrainFrames' in job){
   const {key,images,bounds,columns,maskSvgs,lightSvgs,compact,standardSvgs}=job.terrainFrames,{width:w,height:h,scale}=bounds;
   const cachedBase=terrainCache.get(key);
   const basePromise=cachedBase?Promise.resolve(cachedBase):(async()=>{
    const layers=await Promise.all(images.map(async i=>{const {data,info}=await sharp(i.file,{limitInputPixels:40_000_000}).resize(Math.max(1,Math.round(i.w*scale)),Math.max(1,Math.round(i.h*scale)),{fit:'fill'}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return {input:data,raw:{width:info.width,height:info.height,channels:4 as const},left:Math.round((i.x-bounds.x)*scale),top:Math.round((i.y-bounds.y)*scale)};}));
    // Keep intermediates raw: encoding each source and the composed map to PNG
    // only to decode them immediately added a cold-bounds latency spike.
    const rawColor=images.length===1&&layers[0].left===0&&layers[0].top===0&&layers[0].raw.width===w&&layers[0].raw.height===h?layers[0].input:await sharp({create:{width:w,height:h,channels:4,background:'#00000000'}}).composite(layers).toColourspace('srgb').ensureAlpha().raw().toBuffer();
    const rawGrayPng=await sharp(rawColor,{raw:{width:w,height:h,channels:4}}).grayscale().modulate({brightness:.78}).png({compressionLevel:1,adaptiveFiltering:false}).toBuffer();
    // A new pipeline is required: grayscale() can force raw one/two-channel
    // output despite a colorspace request in the same Sharp pipeline.
    const rawGray=await sharp(rawGrayPng).toColourspace('srgb').ensureAlpha().raw().toBuffer();
    if(rawColor.length!==w*h*4||rawGray.length!==w*h*4)throw new Error('Terrain grading requires RGBA buffers');
    const base={color:toSharedBuffer(rawColor),gray:toSharedBuffer(rawGray),grayPng:toSharedBuffer(rawGrayPng)};
    if(terrainCache.size>=8)terrainCache.delete(terrainCache.keys().next().value!);terrainCache.set(key,base);
    parentPort!.postMessage({syncCache:{newBases:[{key,color:base.color,gray:base.gray,grayPng:base.grayPng}]}});
    return base;
   })();
   const result=await terrainAtlas({baseKey:key,base:basePromise,width:w,height:h,columns,maskSvgs,lightSvgs,compact,standardSvgs,onCache:sync=>parentPort!.postMessage({syncCache:sync})});
   parentPort!.postMessage({id,result,ms:performance.now()-start,...(diagnostic?{terrain:result.timings}:{})});return;
  }
  if('walkSight' in job){parentPort!.postMessage({id,result:walkingTerrain(job),ms:performance.now()-start});return;}
  if('maskTiles' in job){
   const {svg,width,height,tileSize}=job.maskTiles,maskKey=`${width}:${height}:${tileSize}:${svg}`;
   const hit=maskResultCache.get(maskKey);if(hit){maskResultCache.delete(maskKey);maskResultCache.set(maskKey,hit);parentPort!.postMessage({id,result:hit,ms:performance.now()-start,...(diagnostic?{detail:{rasterMs:0,copyHashMs:0,encodeMs:0,tiles:hit.tiles.length,encodedTiles:0,cached:true}}:{})});return;}
   const raw=await sharp(Buffer.from(svg),{limitInputPixels:8_000_000}).ensureAlpha().raw().toBuffer();
   const detail=diagnostic?{rasterMs:performance.now()-start,copyHashMs:0,encodeMs:0,tiles:0,encodedTiles:0}:undefined;
   const rawTiles:{x:number;y:number;width:number;height:number;key:string;pixels:Buffer}[]=[];
   const uncachedByKey=new Map<string,{width:number;height:number;pixels:Buffer}>();
   for(let y=0;y<height;y+=tileSize)for(let x=0;x<width;x+=tileSize){
    const tileStart=detail?performance.now():0;
    const w=Math.min(tileSize,width-x),h=Math.min(tileSize,height-y),pixels=Buffer.allocUnsafe(w*h*4);
    for(let row=0;row<h;row++)raw.copy(pixels,row*w*4,((y+row)*width+x)*4,((y+row)*width+x+w)*4);
    // Pixel identity reuses a tile even when changing polygons outside the tile
    // changed its SVG input. Cache hits avoid PNG encoding and client downloads.
    const key=createHash('sha256').update(`${w}:${h}:rgba:`).update(pixels).digest('hex');
    if(detail){detail.copyHashMs+=performance.now()-tileStart;detail.tiles++;}
    rawTiles.push({x:y===0?x:x,y,width:w,height:h,key,pixels});
    const existing=tileCache.get(key);
    if(existing){tileCache.delete(key);tileCache.set(key,existing);}
    else if(!uncachedByKey.has(key))uncachedByKey.set(key,{width:w,height:h,pixels});
   }
   const newTiles:{key:string;buffer:Uint8Array}[]=[];
   if(uncachedByKey.size){
    const encodeStart=detail?performance.now():0;
    const encoded=await Promise.all([...uncachedByKey.entries()].map(async([key,{width:w,height:h,pixels}])=>[key,toSharedBuffer(await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png({compressionLevel:1,adaptiveFiltering:false}).toBuffer())] as const));
    if(detail){detail.encodeMs+=performance.now()-encodeStart;detail.encodedTiles+=encoded.length;}
    for(const [key,buffer] of encoded){storeTile(key,buffer);newTiles.push({key,buffer});}
   }
   const result:MaskTilesResult={tiles:rawTiles.map(({x,y,width:w,height:h,key})=>({x,y,width:w,height:h,key,buffer:tileCache.get(key)!}))};
   if(maskResultCache.size>=32)maskResultCache.delete(maskResultCache.keys().next().value!);maskResultCache.set(maskKey,result);
   parentPort!.postMessage({syncCache:{...(newTiles.length?{newTiles}:{}),newMaskResults:[{key:maskKey,result}]}});
   parentPort!.postMessage({id,result,ms:performance.now()-start,...(detail?{detail}:{})});return;
  }
  if('svg' in job){const image=sharp(Buffer.from(job.svg),{limitInputPixels:8_000_000});const result=await (job.format==='webp'?image.webp({lossless:true,effort:0}):image.png({compressionLevel:1,adaptiveFiltering:false})).toBuffer();parentPort!.postMessage({id,result,ms:performance.now()-start});return;}
  if('token' in job){parentPort!.postMessage({id,result:movementPreview(job),ms:performance.now()-start});return;}
  let currentWallsKey='';const newPolyEntries:({key:string}&CachedPolygon)[]=[];
  const cachedGeometry=getMapGeometry(job.mapId),geometry=cachedGeometry.geometry;
  polygonObserver=cachedGeometry.observer;
  polygonObserver.current=(wk,key,entry)=>{currentWallsKey=wk;newPolyEntries.push({key,...entry});};
  const paths=job.outlinesOnly?{sight:[],near:[],lights:[]}:geometry(job.vision,job.wallFog);
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
    const shape=old?.x===p.x&&old.y===p.y?old:{x:p.x,y:p.y,points:geometry.points(p,radius,job.vision.walls)};
    prepared!.shapes[key]=shape;cached!.shapes[key]=shape;
   };
   for(const p of job.vision.origins){add(p,SIGHT_EXTENT);add(p,job.vision.radius);}
   for(const p of job.vision.lights)if(!p.transient)add(p,SIGHT_EXTENT);
   cached.shapes={...prepared.shapes};
  }
  if(newPolyEntries.length)parentPort!.postMessage({syncCache:{newPolygons:[{mapId:job.mapId,wallsKey:currentWallsKey||JSON.stringify(job.vision.walls??[]),entries:newPolyEntries}]}});
  parentPort!.postMessage({id,result:{...paths,memory,affinity,...(prepared?{outlines:prepared}:{})},ms:performance.now()-start});
 }catch(error){parentPort!.postMessage({id,error:String(error),ms:performance.now()-start});}
 finally{if(polygonObserver)polygonObserver.current=undefined;}
});
parentPort!.postMessage({ready:true});
