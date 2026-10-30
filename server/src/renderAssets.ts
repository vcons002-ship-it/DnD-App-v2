import {createHash} from 'node:crypto';
import type {RasterAsset} from '../../shared/serverRendering.js';
import {visibilityWorkers} from './visibilityWorkers.js';
type Entry={buffer:Buffer;users:Set<string>};
const assets=new Map<string,Entry>(),pending=new Map<string,Promise<Buffer>>();
const grants=new Map<string,Set<string>>();
const warmers=new Map<string,(keys:string[])=>void>(),warmBatches=new Map<string,Set<string>>();
let bytes=0;
export const renderMetrics={renders:0,hits:0,bytes:0};
/** Private, bounded in-memory images. A hash is not an authorization credential. */
export function resetRenderAssets(id:string){grants.delete(id);warmers.delete(id);warmBatches.delete(id);for(const e of assets.values())e.users.delete(id);}
export function setRenderWarmer(id:string,warmer?:(keys:string[])=>void){
 if(warmer)warmers.set(id,warmer);else{warmers.delete(id);warmBatches.delete(id);}
}
export function flushRenderWarmer(id:string){
 const keys=warmBatches.get(id);warmBatches.delete(id);
 if(keys?.size)warmers.get(id)?.([...keys]);
}
function recordGrant(id:string,key:string,entry:Entry){
 let allowed=grants.get(id);if(!allowed){allowed=new Set();grants.set(id,allowed);}
 const fresh=!allowed.has(key);
 allowed.delete(key);allowed.add(key);entry.users.add(id);
 while(allowed.size>4096)allowed.delete(allowed.values().next().value!);
 if(fresh&&warmers.has(id)){
  let batch=warmBatches.get(id);
  if(!batch){
   batch=new Set();warmBatches.set(id,batch);
   queueMicrotask(()=>flushRenderWarmer(id));
  }
  batch.add(key);
 }
}
export function renderAssetFor(id:string,key:string){return grants.get(id)?.has(key)?assets.get(key)?.buffer:undefined;}
export function grantCachedAsset(id:string,asset:RasterAsset):boolean{
 const entry=assets.get(asset.key);if(!entry)return false;
 assets.delete(asset.key);assets.set(asset.key,entry);renderMetrics.hits++;
 recordGrant(id,asset.key,entry);
 return true;
}
/** Worker-generated pixel tiles use content keys and the same private grants. */
export function grantRenderTile(id:string,key:string,buffer:Uint8Array){
 let entry=assets.get(key);
 if(entry){assets.delete(key);assets.set(key,entry);renderMetrics.hits++;}
 else{entry={buffer:Buffer.from(buffer),users:new Set()};assets.set(key,entry);bytes+=entry.buffer.length;renderMetrics.renders++;}
 recordGrant(id,key,entry);
 while(bytes>96*1024*1024&&assets.size>1){const [old,e]=assets.entries().next().value!;assets.delete(old);bytes-=e.buffer.length;}
 renderMetrics.bytes=bytes;
}
export async function rasterAsset(id:string,svg:string,placement:Omit<RasterAsset,'key'>,format:'png'|'webp'='png'):Promise<RasterAsset>{
 const key=createHash('sha256').update(format).update(svg).digest('hex');
 let entry=assets.get(key);
 if(entry){assets.delete(key);assets.set(key,entry);renderMetrics.hits++;}
 else{
  let work=pending.get(key);
  if(!work){work=visibilityWorkers.run({svg,format}).then(b=>Buffer.from(b));pending.set(key,work);}
  let buffer:Buffer;
  try{buffer=await work;}finally{if(pending.get(key)===work)pending.delete(key);}
  entry=assets.get(key);
  if(!entry){entry={buffer,users:new Set()};assets.set(key,entry);bytes+=buffer.length;renderMetrics.renders++;}
 }
 recordGrant(id,key,entry);
 // Keep recent images for a decoding client, but bound both image storage and credentials.
 while(bytes>96*1024*1024&&assets.size>1){const [old,e]=assets.entries().next().value!;assets.delete(old);bytes-=e.buffer.length;}
 renderMetrics.bytes=bytes;
 return {...placement,key};
}
