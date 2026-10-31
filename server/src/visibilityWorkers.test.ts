import {it,expect} from 'vitest';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLegacyVisionGeometry,type LegacyGeometry} from '../../shared/legacyVision.js';
import {SIGHT_EXTENT} from '../../shared/mapWalls.js';
import type {VisionJob,WorkerCacheSync} from './visibilityWorkers.js';
import {VisibilityWorkers} from './visibilityWorkers.js';
import {legacyLightSvg,legacyMaskSvg} from '../../shared/legacyMaskSvg.js';

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

for(const detailedFirst of [false,true])it(`shares concurrent Legacy/2D/3D geometry when ${detailedFirst?'standard':'Legacy'} requests first`,async()=>{
 const pool=new VisibilityWorkers(2),job=jobAt(0);
 try{
  const first=pool.run({...job,detailed:detailedFirst}),second=pool.run({...job,detailed:!detailedFirst}),third=pool.run({...job,detailed:true});
  const results=await Promise.all([first,second,third]),basic=results[detailedFirst?1:0],detailed=results[detailedFirst?0:1];
  expect(pool.metrics.jobs).toBe(1);
  expect(basic.outlines).toBeUndefined();expect(detailed.outlines?.shapes[`pc:${SIGHT_EXTENT}`]).toBeDefined();
  const {outlines,...paths}=detailed;expect(paths).toEqual(basic);
  await pool.run(job);await pool.run({...job,detailed:true});expect(pool.metrics.jobs).toBe(1);
 }finally{await pool.close();}
});

it('adds late outlines without changing base paths or sharing private memory and affinity',async()=>{
 const pool=new VisibilityWorkers(2),initial=jobAt(0),job={...initial,vision:{...initial.vision,heavy:false}};
 try{
  const basic=await pool.run(job);
  const personal={...job,detailed:true,explored:[[[[1,2],[3,4],[5,2]]]] as VisionJob['explored'],tokens:[{id:'private',x:0,y:0}]};
  const [a,b]=await Promise.all([pool.run(personal),pool.run({...job,detailed:true})]);
  expect(pool.metrics.jobs).toBe(2);expect(a.sight).toEqual(basic.sight);expect(a.near).toEqual(basic.near);
  expect(a.memory).toHaveLength(1);expect(b.memory).toEqual([]);expect(a.affinity).toEqual(['private']);expect(b.affinity).toEqual([]);
  expect(a.outlines).toEqual(b.outlines);
 }finally{await pool.close();}
});

it('reuses stationary lamps across personal origins and invalidates changed lamps and walls',async()=>{
 const pool=new VisibilityWorkers(2),job=jobAt(0);
 const lights=[{id:'lamp',x:20,y:30,radius:100,height:10,strength:1}];
 const lit={...job,vision:{...job.vision,lights},detailed:true};
 try{
  const first=await pool.run(lit);expect(pool.metrics.jobs).toBe(2);
  const moved={...lit,vision:{...lit.vision,origins:[{id:'pc',x:70,y:0}]}};
  const second=await pool.run(moved);expect(pool.metrics.jobs).toBe(3);
  expect(second.lights).toBe(first.lights);expect(second.sight).not.toEqual(first.sight);
  const changed={...moved,vision:{...moved.vision,lights:[{...lights[0],x:80}]}};
  const third=await pool.run(changed);expect(pool.metrics.jobs).toBe(4);expect(third.lights).not.toEqual(first.lights);
  const walls=[{id:'wall',ax:10,ay:-100,bx:10,by:100}];
  const fourth=await pool.run({...changed,vision:{...changed.vision,walls}});expect(pool.metrics.jobs).toBe(6);
  expect(fourth.outlines?.wallsKey).toBe(JSON.stringify(walls));
 }finally{await pool.close();}
});

it('preserves unsplit geometry and mask/grade inputs for all darkness and wall modes',async()=>{
 const worker=new Worker(new URL('./visibilityWorker.mjs',import.meta.url),{execArgv:[]}),pool=new VisibilityWorkers(2);
 try{
  await once(worker,'message');
  for(const heavy of [false,true])for(const daylight of [false,true])for(const wallFog of [false,true]){
   const base=jobAt(20),job:VisionJob={...base,detailed:true,wallFog,
    vision:{...base.vision,heavy,daylight,walls:[{id:'wall',ax:80,ay:-40,bx:80,by:40}],
     lights:[{id:'lamp',x:30,y:20,radius:70,height:10,strength:.85},{id:'spell',x:100,y:50,radius:100,height:0,strength:2,transient:true}]},
    explored:[[[[-50,-50],[150,-50],[150,150],[-50,150]],[[40,40],[60,40],[60,60],[40,60]]]],tokens:[{id:'pc',x:20,y:0},{id:'other',x:100,y:0,sharedSightOnly:true}]};
   // A direct unsplit worker is the original calculation, independent of pool
   // caching/coalescing. The renderer must receive exactly the same inputs.
   const reference=(await calculate(worker,job)).result,actual=await pool.run(job);
   expect(actual).toEqual(reference);
   for(const keepRevealed of [false,true]){
    const options={width:200,height:200,x:-50,y:-50,scale:1,wallFog,heavy,daylight,keepRevealed,graded:true};
    expect(legacyMaskSvg(actual,options)).toBe(legacyMaskSvg(reference,options));
    expect(legacyLightSvg(actual,options)).toBe(legacyLightSvg(reference,options));
   }
  }
 }finally{await worker.terminate();await pool.close();}
});

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
   const invalidGeometry={mapId:'bad',vision:{origins:null,lights:[],walls:[]},wallFog:true,tokens:[]};
   const jobs=pool.metrics.jobs;
   const failedVision=await Promise.allSettled([pool.run(invalidGeometry),pool.run({...invalidGeometry,detailed:true})]);
   assert.ok(failedVision.every(r=>r.status==='rejected'));
   assert.equal(pool.metrics.jobs,jobs+1);
   await assert.rejects(pool.run(invalidGeometry));
   assert.equal(pool.metrics.jobs,jobs+2);
   const empty=await pool.run({...invalidGeometry,vision:{rangeFt:60,radius:60,heavy:true,origins:[],lights:[],walls:[]}});
   assert.deepEqual(empty.sight,[]);
   await new Promise(resolve=>setImmediate(resolve));
  }finally{await pool.close();}
  console.log('caught failures and recovered');
 `;
 const {stdout}=await promisify(execFile)(process.execPath,['--unhandled-rejections=strict','--import','tsx','--input-type=module','--eval',source],{windowsHide:true,timeout:10000});
 expect(stdout.trim()).toBe('caught failures and recovered');
});
