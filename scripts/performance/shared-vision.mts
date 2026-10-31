/** CPU-only visibility benchmark. No server, database, or live campaign access. */
import type {VisionJob} from '../../server/src/visibilityWorkers.js';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {VisibilityWorkers}=await import(process.env.VISION_BENCH_MODULE?pathToFileURL(path.resolve(process.env.VISION_BENCH_MODULE)).href:'../../server/src/visibilityWorkers.js');

const output=process.argv[2];if(!output)throw Error('Pass an output JSON path');
const walls=Array.from({length:48},(_,i)=>({id:`wall-${i}`,ax:100+(i%8)*210,ay:100+Math.floor(i/8)*210,bx:240+(i%8)*210,by:110+Math.floor(i/8)*210}));
const lights=Array.from({length:48},(_,i)=>({id:`light-${i}`,x:150+(i%8)*210,y:150+Math.floor(i/8)*210,radius:240,height:40,strength:.85}));
const report:any={method:'One cold geometry revision followed by 24 measured revisions per scenario, 4-worker CPU pool, 48 walls and 48 lights; no network or client rendering. Cold geometry cost is reported separately.',scenarios:[]};
for(const order of ['legacy-first','standard-first','legacy-only','standard-only','late-standard','different-viewers']){
 const pool=new VisibilityWorkers(4),samples:number[]=[],digests:string[]=[];
 try{
  await Promise.all(Array.from({length:4},()=>pool.run({svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'})));
  let initial={...pool.metrics},cold:{}={};
  for(let i=-1;i<24;i++){
   const job:VisionJob={mapId:'benchmark',vision:{rangeFt:60,radius:350,heavy:true,daylight:false,origins:[{id:'pc',x:50+i*17,y:50}],walls,lights},wallFog:true,tokens:[{id:'pc',x:50+i*17,y:50}]};
   const started=performance.now();let result;
   if(order==='legacy-only')result=[await pool.run(job)];
   else if(order==='standard-only')result=[await pool.run({...job,detailed:true})];
   else if(order==='late-standard')result=[await pool.run(job),await pool.run({...job,detailed:true})];
   else if(order==='different-viewers')result=await Promise.all([0,1,2].map(v=>pool.run({...job,detailed:v>0,vision:{...job.vision,origins:[{id:`pc-${v}`,x:50+i*17,y:50+v*15}]}})));
   else{const basic=()=>pool.run(job),detailed=()=>pool.run({...job,detailed:true});result=await Promise.all(order==='legacy-first'?[basic(),detailed(),detailed()]:[detailed(),basic(),detailed()]);}
   const elapsed=performance.now()-started;
   if(i<0){cold={ms:elapsed,jobs:pool.metrics.jobs-initial.jobs,workerComputeMs:pool.metrics.computeMs-initial.computeMs};initial={...pool.metrics};continue;}
   samples.push(elapsed);
   digests.push(createHash('sha256').update(JSON.stringify(result)).digest('hex'));
  }
  const sorted=samples.slice().sort((a,b)=>a-b);
  report.scenarios.push({order,cold,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,medianMs:sorted[12],p95Ms:sorted[22],jobs:pool.metrics.jobs-initial.jobs,workerComputeMs:pool.metrics.computeMs-initial.computeMs,samples,digests});
 }finally{await pool.close();}
}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.scenarios.map(({digests,samples,...s}:any)=>s),null,2));
