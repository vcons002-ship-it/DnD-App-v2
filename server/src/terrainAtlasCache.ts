import type {TerrainFramesResult} from './legacyTerrain.js';
/** Only rendered pixels are shared, never viewer-shaped creature/state data.
 * Content reuse still requires a private image grant for each receiving socket. */
export class TerrainAtlasCache{
 private ready=new Map<string,{value:TerrainFramesResult;bytes:number}>();
 private pending=new Map<string,Promise<TerrainFramesResult>>();
 readonly metrics={builds:0,hits:0,coalesced:0,bytes:0};
 constructor(private maxBytes=32*1024*1024,private maxEntries=32){}
 get(key:string,build:()=>Promise<TerrainFramesResult>,reused?:()=>void):Promise<TerrainFramesResult>{
  const hit=this.ready.get(key);if(hit){this.ready.delete(key);this.ready.set(key,hit);this.metrics.hits++;reused?.();return Promise.resolve(hit.value);}
  const waiting=this.pending.get(key);if(waiting){this.metrics.coalesced++;reused?.();return waiting;}
  this.metrics.builds++;
  const work=Promise.resolve().then(build).then(value=>{
   const bytes=value.terrain.byteLength+(value.mask?.byteLength??0)+(value.base?.byteLength??0);
   if(bytes<=this.maxBytes&&this.maxEntries>0){this.ready.set(key,{value,bytes});this.metrics.bytes+=bytes;}
   while(this.metrics.bytes>this.maxBytes||this.ready.size>this.maxEntries){const [old,entry]=this.ready.entries().next().value!;this.ready.delete(old);this.metrics.bytes-=entry.bytes;}
   return value;
  }).finally(()=>{if(this.pending.get(key)===work)this.pending.delete(key);});
  this.pending.set(key,work);return work;
 }
}
export const terrainAtlasCache=new TerrainAtlasCache();
