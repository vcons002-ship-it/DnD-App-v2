import {Worker} from 'node:worker_threads';
import type {PlayerVision} from '../../shared/playerVision.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import type {LegacyGeometry} from '../../shared/legacyVision.js';
import type {MovementPreviewJob,MovementPreview} from '../../shared/movementPreview.js';
import type {MovementWorkerTiming} from '../../shared/movementTiming.js';
import type {WalkSightJob,walkingTerrain} from '../../shared/explorationSight.js';
import type {TerrainFramesJob,TerrainFramesResult} from './legacyTerrain.js';
type Observe=(span:MovementWorkerTiming)=>void;
export type VisionJob={mapId:string;vision:PlayerVision;wallFog:boolean;detailed?:boolean;explored?:ExploredTerrain;tokens:{id:string;x:number;y:number;sharedSightOnly?:boolean}[]};
export type RasterJob={svg:string;format?:'png'|'webp'};
export type MaskTilesJob={maskTiles:{svg:string;width:number;height:number;tileSize:number}};
export type MaskTilesResult={tiles:{x:number;y:number;width:number;height:number;key:string;buffer:Uint8Array}[]};
type Job=VisionJob|MovementPreviewJob|RasterJob|MaskTilesJob|WalkSightJob|TerrainFramesJob;
type Task={id:number;job:Job;resolve:(p:any)=>void;reject:(e:Error)=>void;timer?:ReturnType<typeof setTimeout>;observe?:Observe;queuedAt?:number;startedAt?:number};
type Slot={worker:Worker;active?:Task};
/** Bounded CPU pool. No DB handles, sockets or unfiltered snapshots enter workers. */
export class VisibilityWorkers{
 private slots:Slot[]=[];private queue:Task[]=[];private serial=0;
 readonly metrics={jobs:0,failed:0,computeMs:0,maxComputeMs:0,maxQueue:0};
 constructor(private count=2){}
 private spawn():Slot{
  const worker=new Worker(new URL('./visibilityWorker.mjs',import.meta.url),{execArgv:[]});worker.unref();
  const slot:Slot={worker};this.slots.push(slot);
  const fail=(error:Error)=>{if(!this.slots.includes(slot))return;this.slots=this.slots.filter(s=>s!==slot);if(slot.active){clearTimeout(slot.active.timer);slot.active.reject(error);this.metrics.failed++;slot.active=undefined;}void worker.terminate();this.pump();};
  worker.on('error',fail);worker.on('exit',code=>fail(new Error(`Visibility worker exited (${code})`)));
  worker.on('message',message=>{const task=slot.active;if(!task||message.id!==task.id)return;clearTimeout(task.timer);slot.active=undefined;worker.unref();this.metrics.jobs++;this.metrics.computeMs+=message.ms;this.metrics.maxComputeMs=Math.max(this.metrics.maxComputeMs,message.ms);task.observe?.({kind:'terrainFrames' in task.job?'terrain':'walkSight' in task.job?'walkSight':'maskTiles' in task.job?'maskTiles':'svg' in task.job?'raster':'token' in task.job?'preview':'geometry',queueMs:task.startedAt!-task.queuedAt!,roundTripMs:performance.now()-task.startedAt!,computeMs:message.ms,...(message.detail?{detail:message.detail}:{}),...(message.terrain?{terrain:message.terrain}:{})});if(message.error){this.metrics.failed++;task.reject(new Error(message.error));}else task.resolve(message.result);this.pump();});
  return slot;
 }
 private pump(){
  while(this.queue.length){const slot=this.slots.find(s=>!s.active)??(this.slots.length<this.count?this.spawn():undefined);if(!slot)return;const task=this.queue.shift()!;slot.active=task;slot.worker.ref();if(task.observe)task.startedAt=performance.now();task.timer=setTimeout(()=>{this.metrics.failed++;slot.active=undefined;task.reject(new Error('Visibility calculation timed out'));this.slots=this.slots.filter(s=>s!==slot);void slot.worker.terminate();this.pump();},10000);slot.worker.postMessage({id:task.id,job:task.job,...(task.observe?{diagnostic:true}:{})});}
 }
 run(job:VisionJob,observe?:Observe):Promise<LegacyGeometry>;
 run(job:TerrainFramesJob,observe?:Observe):Promise<TerrainFramesResult>;
 run(job:WalkSightJob,observe?:Observe):Promise<ReturnType<typeof walkingTerrain>>;
 run(job:MovementPreviewJob,observe?:Observe):Promise<MovementPreview>;
 run(job:RasterJob,observe?:Observe):Promise<Uint8Array>;
 run(job:MaskTilesJob,observe?:Observe):Promise<MaskTilesResult>;
 run(job:Job,observe?:Observe):Promise<any>{
  if(this.queue.length>=64)return Promise.reject(new Error('Visibility queue is full'));
  return new Promise((resolve,reject)=>{this.queue.push({id:++this.serial,job,resolve,reject,...(observe?{observe,queuedAt:performance.now()}:{})});this.metrics.maxQueue=Math.max(this.metrics.maxQueue,this.queue.length);this.pump();});
 }
 async close(){const slots=this.slots.splice(0);for(const task of this.queue.splice(0))task.reject(new Error('Visibility pool closed'));for(const s of slots)if(s.active){clearTimeout(s.active.timer);s.active.reject(new Error('Visibility pool closed'));}await Promise.all(slots.map(s=>s.worker.terminate()));}
}
export const visibilityWorkers=new VisibilityWorkers();
