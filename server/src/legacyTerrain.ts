import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {separatedVisionSvg} from '../../shared/separatedVision.js';
import {config} from './config.js';
import type {StateSnapshot} from '../../shared/types.js';
import type {RasterAsset} from '../../shared/serverRendering.js';
import type {LegacyMotionAtlas} from '../../shared/legacyMotion.js';
import {legacyMaskSvg,legacyLightSvg} from '../../shared/legacyMaskSvg.js';
import {needsVisibilityLayer,usesMapVision} from '../../shared/playerVision.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {grantRenderTile} from './renderAssets.js';
import type {MovementFrameTiming} from '../../shared/movementTiming.js';
import {terrainAtlasCache} from './terrainAtlasCache.js';
export type TerrainFramesJob={terrainFrames:{key:string;images:{file:string;x:number;y:number;w:number;h:number}[];bounds:Omit<RasterAsset,'key'>;maskSvgs:string[];lightSvgs:string[];columns:number;compact?:boolean;standardSvgs?:string[]}};
export type TerrainFramesResult={standardMask?:Uint8Array;colorBase?:Uint8Array;lightMask?:Uint8Array;mask?:Uint8Array;terrain:Uint8Array;width:number;height:number;maskWidth?:number;maskHeight?:number;base?:Uint8Array;region?:{left:number;top:number;width:number;height:number}};
const sizes=new Map<string,Promise<{width:number;height:number}>>();
async function sources(s:StateSnapshot){
 const safe=(url:string)=>/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(url)?path.join(config.uploadsDir,url.slice(9)):undefined;
 const images:TerrainFramesJob['terrainFrames']['images']=[];
 const base=s.map?.imagePath,file=base&&safe(base);
 if(file){let size=sizes.get(file);if(!size){size=sharp(file).metadata().then(m=>({width:m.width??1,height:m.height??1}));if(sizes.size>=64)sizes.delete(sizes.keys().next().value!);sizes.set(file,size);}const d=await size;images.push({file,x:0,y:0,w:d.width,h:d.height});}
 for(const t of s.mapImages??[]){const file=safe(t.imagePath);if(file)images.push({file,x:t.x,y:t.y,w:t.w,h:t.h});}
 return images;
}
export async function hasTerrainSources(s:StateSnapshot):Promise<boolean>{
 if(!s.map||!s.playerVision||!s.legacyGeometry||!needsVisibilityLayer(s.map,s.playerVision))return false;
 try{return (await sources(s)).length>0;}catch{return false;}
}
/** Grading and all visibility pixels are prepared on the server. The client
 * only positions decoded images; it does no grayscale or wall calculations. */
export async function legacyTerrainFrames(id:string,frames:StateSnapshot[],includeMask=false,timing?:MovementFrameTiming,compact=false,separated=false):Promise<{terrain:RasterAsset;atlas?:LegacyMotionAtlas}|undefined>{
 const first=frames[0];if(!first?.map||!first.playerVision||!first.legacyGeometry||!needsVisibilityLayer(first.map,first.playerVision))return;
 const images=await sources(first);if(!images.length)return;

 const x=Math.floor(Math.min(0,...images.map(i=>i.x))),y=Math.floor(Math.min(0,...images.map(i=>i.y)));
 const right=Math.ceil(Math.max(...images.map(i=>i.x+i.w))),bottom=Math.ceil(Math.max(...images.map(i=>i.y+i.h)));
 const scale=Math.min(1,1024/Math.max(right-x,bottom-y)),width=Math.max(1,Math.ceil((right-x)*scale)),height=Math.max(1,Math.ceil((bottom-y)*scale));
 const columns=Math.min(4,frames.length),rows=Math.ceil(frames.length/columns);if(width*height*columns*rows>17_000_000)return;
 const bounds={x,y,width,height,scale},wallFog=usesMapVision(first.map);
 const options=(f:StateSnapshot)=>({...bounds,wallFog,heavy:!!f.playerVision?.heavy,daylight:!!f.playerVision?.daylight,keepRevealed:f.map?.explorationMode==='revealed',graded:true});
 const lightSvgs=frames.map(f=>legacyLightSvg(f.legacyGeometry!,options(f))),maskSvgs=includeMask||separated?frames.map(f=>legacyMaskSvg(f.legacyGeometry!,options(f))):[];
 const key=createHash('sha256').update(JSON.stringify([images,bounds])).digest('hex');
 const terrainFrames={key,images,bounds,columns,maskSvgs,lightSvgs,compact:includeMask&&compact,...(separated?{standardSvgs:frames.map(f=>separatedVisionSvg(f.legacyGeometry!,f.playerVision!,bounds,wallFog,f.map?.explorationMode==='revealed'))}:{})};
 const pixelKey=createHash('sha256').update(JSON.stringify(terrainFrames)).digest('hex');
 const result=await terrainAtlasCache.get(pixelKey,()=>visibilityWorkers.run({terrainFrames},timing?span=>timing.workers.push(span):undefined),()=>{if(timing)timing.terrainCacheHits=(timing.terrainCacheHits??0)+1;});
 const grant=(buffer:Uint8Array,w=result.width,h=result.height):RasterAsset=>{const key=createHash('sha256').update(buffer).digest('hex');grantRenderTile(id,key,buffer);return {key,x:0,y:0,width:w,height:h,scale:1};};
 const terrain=grant(result.terrain);
 const region=result.region;
 return {terrain:frames.length===1?{...terrain,...bounds}:terrain,...(result.mask?{atlas:{mask:grant(result.mask,result.maskWidth,result.maskHeight),...(result.standardMask&&result.colorBase&&result.lightMask?{standardMask:grant(result.standardMask,width*columns,height*rows),colorBase:{...grant(result.colorBase,width,height),...bounds},lightMask:grant(result.lightMask,width*columns,height*rows),base:{...terrain,...bounds}}:{terrain}),columns,frameWidth:width,frameHeight:height,bounds,count:frames.length,
  ...(result.base&&region?{base:{...grant(result.base,width,height),...bounds},terrainBounds:{x:x+region.left/scale,y:y+region.top/scale,width:region.width,height:region.height,scale}}:{})}}:{})};
}
