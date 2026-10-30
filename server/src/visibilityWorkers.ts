import {Worker} from 'node:worker_threads';
import os from 'node:os';
import type {PlayerVision} from '../../shared/playerVision.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import type {LegacyGeometry,CachedPolygon} from '../../shared/legacyVision.js';
import type {MovementPreviewJob,MovementPreview} from '../../shared/movementPreview.js';
import type {MovementWorkerTiming} from '../../shared/movementTiming.js';
import type {WalkSightJob,walkingTerrain} from '../../shared/explorationSight.js';
import type {TerrainFramesJob,TerrainFramesResult} from './legacyTerrain.js';
import type {AtlasCacheSync,LightBounds} from './terrainAtlas.js';
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(8,Math.min(32,os.availableParallelism?.()??os.cpus().length)));
type Observe=(span:MovementWorkerTiming)=>void;
export type VisionJob={mapId:string;vision:PlayerVision;wallFog:boolean;detailed?:boolean;explored?:ExploredTerrain;tokens:{id:string;x:number;y:number;sharedSightOnly?:boolean}[]};
export type RasterJob={svg:string;format?:'png'|'webp'};
export type MaskTilesJob={maskTiles:{svg:string;width:number;height:number;tileSize:number}};
export type MaskTilesResult={tiles:{x:number;y:number;width:number;height:number;key:string;buffer:Uint8Array}[]};
export type PolygonSync={mapId:string;wallsKey:string;entries:({key:string}&CachedPolygon)[]};
export type WorkerCacheSync=AtlasCacheSync&{
 newBases?:{key:string;color:Uint8Array;gray:Uint8Array;grayPng:Uint8Array}[];
 newTiles?:{key:string;buffer:Uint8Array}[];
 newMaskResults?:{key:string;result:MaskTilesResult}[];
 newPolygons?:PolygonSync[];
};
type Job=VisionJob|MovementPreviewJob|RasterJob|MaskTilesJob|WalkSightJob|TerrainFramesJob;
type Task={id:number;job:Job;resolve:(p:any)=>void;reject:(e:Error)=>void;timer?:ReturnType<typeof setTimeout>;observe?:Observe;queuedAt?:number;startedAt?:number};
type Slot={worker:Worker;active?:Task;ready:boolean};
/** Bounded CPU pool. No DB handles, sockets or unfiltered snapshots enter workers. */
export class VisibilityWorkers{
 private slots:Slot[]=[];private queue:Task[]=[];private serial=0;
 private bases=new Map<string,{key:string;color:Uint8Array;gray:Uint8Array;grayPng:Uint8Array}>();
 private lights=new Map<string,{key:string;pixels:Uint8Array;bounds:LightBounds}>();
 private masks=new Map<string,{key:string;pixels:Uint8Array}>();
 private gradedPngs=new Map<string,{key:string;buffer:Uint8Array}>();
 private tiles=new Map<string,{key:string;buffer:Uint8Array}>();private tileBytes=0;
 private maskResults=new Map<string,MaskTilesResult>();
 private polygons=new Map<string,{wallsKey:string;entries:Map<string,{key:string}&CachedPolygon>}>();
 private visionResults=new Map<string,{basic?:LegacyGeometry;detailed?:LegacyGeometry}>();
 private inflight=new Map<string,Promise<any>>();
 readonly metrics={jobs:0,failed:0,computeMs:0,maxComputeMs:0,maxQueue:0};
 constructor(private count=Math.max(2,Math.min(8,(os.availableParallelism?.()??os.cpus().length)-1))){}
 private recordSync(sync:WorkerCacheSync){
  for(const b of sync.newBases??[]){if(this.bases.has(b.key))this.bases.delete(b.key);else if(this.bases.size>=8)this.bases.delete(this.bases.keys().next().value!);this.bases.set(b.key,b);}
  for(const l of sync.newLights??[]){if(this.lights.has(l.key))this.lights.delete(l.key);else if(this.lights.size>=128)this.lights.delete(this.lights.keys().next().value!);this.lights.set(l.key,l);}
  for(const m of sync.newMasks??[]){if(this.masks.has(m.key))this.masks.delete(m.key);else if(this.masks.size>=128)this.masks.delete(this.masks.keys().next().value!);this.masks.set(m.key,m);}
  for(const g of sync.newGradedPngs??[]){if(this.gradedPngs.has(g.key))this.gradedPngs.delete(g.key);else if(this.gradedPngs.size>=32)this.gradedPngs.delete(this.gradedPngs.keys().next().value!);this.gradedPngs.set(g.key,g);}
  for(const t of sync.newTiles??[]){
   const old=this.tiles.get(t.key);if(old){this.tiles.delete(t.key);this.tiles.set(t.key,old);continue;}
   this.tiles.set(t.key,t);this.tileBytes+=t.buffer.byteLength;
   while(this.tileBytes>32*1024*1024&&this.tiles.size>1){const [k,v]=this.tiles.entries().next().value!;this.tiles.delete(k);this.tileBytes-=v.buffer.byteLength;}
  }
  for(const r of sync.newMaskResults??[]){if(this.maskResults.has(r.key))this.maskResults.delete(r.key);else if(this.maskResults.size>=32)this.maskResults.delete(this.maskResults.keys().next().value!);this.maskResults.set(r.key,r.result);}
  for(const p of sync.newPolygons??[]){
   let mapEntry=this.polygons.get(p.mapId);
   if(!mapEntry||mapEntry.wallsKey!==p.wallsKey){
    if(!mapEntry&&this.polygons.size>=16)this.polygons.delete(this.polygons.keys().next().value!);
    mapEntry={wallsKey:p.wallsKey,entries:new Map()};
    this.polygons.set(p.mapId,mapEntry);
   }
   for(const e of p.entries){
    if(mapEntry.entries.has(e.key))continue;
    if(mapEntry.entries.size>=512)mapEntry.entries.delete(mapEntry.entries.keys().next().value!);
    mapEntry.entries.set(e.key,e);
   }
  }
 }
 private snapshotSync():WorkerCacheSync|undefined{
  if(!this.bases.size&&!this.lights.size&&!this.masks.size&&!this.gradedPngs.size&&!this.tiles.size&&!this.maskResults.size&&!this.polygons.size)return undefined;
  return {
   ...(this.bases.size?{newBases:[...this.bases.values()]}:{}),
   ...(this.lights.size?{newLights:[...this.lights.values()]}:{}),
   ...(this.masks.size?{newMasks:[...this.masks.values()]}:{}),
   ...(this.gradedPngs.size?{newGradedPngs:[...this.gradedPngs.values()]}:{}),
   ...(this.tiles.size?{newTiles:[...this.tiles.values()]}:{}),
   ...(this.maskResults.size?{newMaskResults:[...this.maskResults.entries()].map(([key,result])=>({key,result}))}:{}),
   ...(this.polygons.size?{newPolygons:[...this.polygons.entries()].map(([mapId,v])=>({mapId,wallsKey:v.wallsKey,entries:[...v.entries.values()]}))}:{}),
  };
 }
 private spawn():Slot{
  const worker=new Worker(new URL('./visibilityWorker.mjs',import.meta.url),{execArgv:[]});worker.unref();
  const slot:Slot={worker,ready:false};this.slots.push(slot);
  const initial=this.snapshotSync();if(initial)worker.postMessage({syncCache:initial});
  const fail=(error:Error)=>{if(!this.slots.includes(slot))return;this.slots=this.slots.filter(s=>s!==slot);if(slot.active){clearTimeout(slot.active.timer);slot.active.reject(error);this.metrics.failed++;slot.active=undefined;}void worker.terminate();this.pump();};
  worker.on('error',fail);worker.on('exit',code=>fail(new Error(`Visibility worker exited (${code})`)));
  worker.on('message',message=>{
   if(message.ready){slot.ready=true;this.pump();return;}
   if(message.syncCache){this.recordSync(message.syncCache);for(const s of this.slots)if(s!==slot)s.worker.postMessage({syncCache:message.syncCache});return;}
   const task=slot.active;if(!task||message.id!==task.id)return;clearTimeout(task.timer);slot.active=undefined;worker.unref();this.metrics.jobs++;this.metrics.computeMs+=message.ms;this.metrics.maxComputeMs=Math.max(this.metrics.maxComputeMs,message.ms);
   task.observe?.({kind:'terrainFrames' in task.job?'terrain':'walkSight' in task.job?'walkSight':'maskTiles' in task.job?'maskTiles':'svg' in task.job?'raster':'token' in task.job?'preview':'geometry',queueMs:task.startedAt!-task.queuedAt!,roundTripMs:performance.now()-task.startedAt!,computeMs:message.ms,...(message.detail?{detail:message.detail}:{}),...(message.terrain?{terrain:message.terrain}:{})});
   if(message.error){this.metrics.failed++;task.reject(new Error(message.error));}else task.resolve(message.result);this.pump();
  });
  return slot;
 }
 private pump(){
  while(this.slots.length<this.count)this.spawn();
  while(this.queue.length){
   const anyReady=this.slots.some(s=>s.ready);
   const slot=this.slots.find(s=>s.ready&&!s.active)??(!anyReady?this.slots.find(s=>!s.active):undefined);
   if(!slot)return;
   const interactiveIdx=this.queue.findIndex(t=>'token' in t.job||('vision' in t.job&&!('walkSight' in t.job)));
   const task=interactiveIdx>=0?this.queue.splice(interactiveIdx,1)[0]!:this.queue.shift()!;
   slot.active=task;slot.worker.ref();if(task.observe)task.startedAt=performance.now();
   task.timer=setTimeout(()=>{this.metrics.failed++;slot.active=undefined;task.reject(new Error('Visibility calculation timed out'));this.slots=this.slots.filter(s=>s!==slot);void slot.worker.terminate();this.pump();},10000);
   slot.worker.postMessage({id:task.id,job:task.job,...(task.observe?{diagnostic:true}:{})});
  }
 }
 run(job:VisionJob,observe?:Observe):Promise<LegacyGeometry>;
 run(job:TerrainFramesJob,observe?:Observe):Promise<TerrainFramesResult>;
 run(job:WalkSightJob,observe?:Observe):Promise<ReturnType<typeof walkingTerrain>>;
 run(job:MovementPreviewJob,observe?:Observe):Promise<MovementPreview>;
 run(job:RasterJob,observe?:Observe):Promise<Uint8Array>;
 run(job:MaskTilesJob,observe?:Observe):Promise<MaskTilesResult>;
 run(job:Job,observe?:Observe):Promise<any>{
  if('maskTiles' in job){
   const {width,height,tileSize,svg}=job.maskTiles,maskKey=`${width}:${height}:${tileSize}:${svg}`;
   const hit=this.maskResults.get(maskKey);
   if(hit){
    this.maskResults.delete(maskKey);this.maskResults.set(maskKey,hit);
    observe?.({kind:'maskTiles',queueMs:0,roundTripMs:0,computeMs:0,detail:{rasterMs:0,copyHashMs:0,encodeMs:0,tiles:hit.tiles.length,encodedTiles:0,cached:true}});
    return Promise.resolve(hit);
   }
  }
  const isVision='vision' in job&&!('walkSight' in job)&&!('token' in job);
  const visionBaseKey=isVision?JSON.stringify([(job as VisionJob).mapId,(job as VisionJob).vision,(job as VisionJob).wallFog,(job as VisionJob).explored,(job as VisionJob).tokens]):undefined;
  if(visionBaseKey){
   const cached=this.visionResults.get(visionBaseKey);
   if(cached){
    const hit=(job as VisionJob).detailed?cached.detailed:(cached.basic??(cached.detailed?(()=>{const {outlines:_,...b}=cached.detailed;cached.basic=b;return b;})():undefined));
    if(hit){
     this.visionResults.delete(visionBaseKey);this.visionResults.set(visionBaseKey,cached);
     observe?.({kind:'geometry',queueMs:0,roundTripMs:0,computeMs:0});
     return Promise.resolve(hit);
    }
   }
  }
  const coalesceKey='maskTiles' in job?`mask:${job.maskTiles.width}:${job.maskTiles.height}:${job.maskTiles.tileSize}:${job.maskTiles.svg}`:visionBaseKey?`vision:${(job as VisionJob).detailed?'1':'0'}:${visionBaseKey}`:undefined;
  if(coalesceKey){
   const pending=this.inflight.get(coalesceKey)??(!((job as VisionJob).detailed)&&visionBaseKey?this.inflight.get(`vision:1:${visionBaseKey}`)?.then((res:LegacyGeometry)=>{const {outlines:_,...b}=res;return b;}):undefined);
   if(pending){
    const waitStart=observe?performance.now():0;
    return pending.then(res=>{
     if(observe){
      const elapsed=performance.now()-waitStart;
      if('maskTiles' in job)observe({kind:'maskTiles',queueMs:0,roundTripMs:elapsed,computeMs:0,detail:{rasterMs:0,copyHashMs:0,encodeMs:0,tiles:res.tiles.length,encodedTiles:0,cached:true}});
      else observe({kind:'geometry',queueMs:0,roundTripMs:elapsed,computeMs:0});
     }
     return res;
    });
   }
  }
  if(this.queue.length>=512)return Promise.reject(new Error('Visibility queue is full'));
  const work=new Promise<any>((resolve,reject)=>{this.queue.push({id:++this.serial,job,resolve,reject,...(observe?{observe,queuedAt:performance.now()}:{})});this.metrics.maxQueue=Math.max(this.metrics.maxQueue,this.queue.length);this.pump();});
  if(visionBaseKey){
   void work.then((res:LegacyGeometry)=>{
    let entry=this.visionResults.get(visionBaseKey);
    if(!entry){if(this.visionResults.size>=64)this.visionResults.delete(this.visionResults.keys().next().value!);entry={};this.visionResults.set(visionBaseKey,entry);}
    if((job as VisionJob).detailed){entry.detailed=res;const {outlines:_,...b}=res;entry.basic=b;}
    else entry.basic=res;
   }).catch(()=>{});
  }
  if(coalesceKey){
   this.inflight.set(coalesceKey,work);
   void work.finally(()=>{if(this.inflight.get(coalesceKey)===work)this.inflight.delete(coalesceKey);});
  }
  return work;
 }
 async close(){
  const slots=this.slots.splice(0);
  this.bases.clear();this.lights.clear();this.masks.clear();this.gradedPngs.clear();this.tiles.clear();this.tileBytes=0;this.maskResults.clear();this.polygons.clear();this.visionResults.clear();this.inflight.clear();
  for(const task of this.queue.splice(0))task.reject(new Error('Visibility pool closed'));
  for(const s of slots)if(s.active){clearTimeout(s.active.timer);s.active.reject(new Error('Visibility pool closed'));}
  await Promise.all(slots.map(s=>s.worker.terminate()));
 }
}
export const visibilityWorkers=new VisibilityWorkers();
