import {it,expect} from 'vitest';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLegacyVisionGeometry,type LegacyGeometry} from '../../shared/legacyVision.js';
import {SIGHT_EXTENT} from '../../shared/mapWalls.js';
import type {VisionJob,WorkerCacheSync} from './visibilityWorkers.js';

let serial=0;
function calculate(worker:Worker,job:VisionJob){
 const id=++serial,syncs:WorkerCacheSync[]=[];
 return new Promise<{result:LegacyGeometry;syncs:WorkerCacheSync[]}>((resolve,reject)=>{
  const cleanup=()=>{worker.off('message',onMessage);worker.off('error',onError);};
  const onError=(error:Error)=>{cleanup();reject(error);};
  const onMessage=(message:{id?:number;result:LegacyGeometry;error?:string;syncCache?:WorkerCacheSync})=>{
   if(message.syncCache)syncs.push(message.syncCache);
   if(message.id!==id)return;
   cleanup();
   if(message.error)reject(new Error(message.error));else resolve({result:message.result,syncs});
  };
  worker.on('message',onMessage);worker.on('error',onError);
  worker.postMessage({id,job});
 });
}
const jobAt=(x:number):VisionJob=>({mapId:'shared-polygons',vision:{rangeFt:60,radius:60,heavy:true,daylight:false,origins:[{id:'pc',x,y:0}],lights:[],walls:[]},wallFog:true,tokens:[]});

it('publishes only the new polygons for every successive job on the same map',async()=>{
 const worker=new Worker(new URL('./visibilityWorker.mjs',import.meta.url),{execArgv:[]});
 try{
  await once(worker,'message');
  for(const x of [0,50,100]){
   const job=jobAt(x),{result,syncs}=await calculate(worker,job);
   const polygons=syncs.flatMap(s=>s.newPolygons??[]);
   expect(polygons).toHaveLength(1);
   expect(polygons[0]).toMatchObject({mapId:job.mapId,wallsKey:'[]'});
   expect(polygons[0].entries.map(e=>e.key)).toEqual([`${x},0:${SIGHT_EXTENT}:true`,`${x},0:60:true`]);
   expect(result).toMatchObject(createLegacyVisionGeometry()(job.vision,job.wallFog));
  }
  // A cache hit must not republish old entries or retain the prior job's batch.
  expect((await calculate(worker,jobAt(50))).syncs.flatMap(s=>s.newPolygons??[])).toEqual([]);
 }finally{await worker.terminate();}
});

it('publishes newly calculated polygons when the map was first created by a cache sync',async()=>{
 const worker=new Worker(new URL('./visibilityWorker.mjs',import.meta.url),{execArgv:[]});
 try{
  await once(worker,'message');
  const seed=createLegacyVisionGeometry(),initial=jobAt(0);
  worker.postMessage({syncCache:{newPolygons:[{mapId:initial.mapId,wallsKey:'[]',entries:[{key:`0,0:${SIGHT_EXTENT}:true`,points:seed.points({x:0,y:0},SIGHT_EXTENT,[]),path:seed(initial.vision,true).sight[0]}]}]}});
  const {syncs}=await calculate(worker,jobAt(50));
  expect(syncs.flatMap(s=>s.newPolygons??[]).flatMap(p=>p.entries).map(e=>e.key)).toEqual([`50,0:${SIGHT_EXTENT}:true`,'50,0:60:true']);
 }finally{await worker.terminate();}
});

it('catches failed coalesced jobs without a background rejection and permits retries',async()=>{
 // A child process excludes Vitest and the app's global rejection handlers.
 const source=`
  import assert from 'node:assert/strict';
  import {VisibilityWorkers} from ${JSON.stringify(new URL('./visibilityWorkers.ts',import.meta.url).href)};
  const pool=new VisibilityWorkers(1);
  const invalid={maskTiles:{svg:'not valid svg',width:8,height:8,tileSize:8}};
  try{
   const results=await Promise.allSettled([pool.run(invalid),pool.run(invalid)]);
   assert.ok(results.every(r=>r.status==='rejected'));
   assert.equal(pool.metrics.jobs,1);
   await assert.rejects(pool.run(invalid));
   assert.equal(pool.metrics.jobs,2);
   const valid={maskTiles:{...invalid.maskTiles,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'}};
   assert.equal((await pool.run(valid)).tiles.length,1);
   await new Promise(resolve=>setImmediate(resolve));
  }finally{await pool.close();}
  console.log('caught failures and recovered');
 `;
 const {stdout}=await promisify(execFile)(process.execPath,['--unhandled-rejections=strict','--import','tsx','--input-type=module','--eval',source],{windowsHide:true,timeout:10000});
 expect(stdout.trim()).toBe('caught failures and recovered');
});
