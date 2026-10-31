import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [baseline,folder]=process.argv.slice(2);
if(!baseline||!folder)throw Error('Usage: node --import tsx scripts/performance/compare-shared-vision.mts <baseline visibilityWorkers.ts> <new output directory>');
await mkdir(folder,{recursive:true});
const all:any={before:[],after:[]};
for(let trial=0;trial<4;trial++)for(const side of trial%2?['after','before']:['before','after']){
 const output=path.join(folder,`${side}-${trial}.json`);
 const env={...process.env};delete env.VISION_BENCH_MODULE;if(side==='before')env.VISION_BENCH_MODULE=path.resolve(baseline);
 await promisify(execFile)(process.execPath,['--import','tsx','scripts/performance/shared-vision.mts',output],{env,windowsHide:true});
 all[side].push(JSON.parse(await readFile(output,'utf8')));
}
const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/a.length;
const median=(a:number[])=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summary={method:'Four alternating before/after trials; 24 measured revisions after one cold geometry revision per scenario; 96 warm samples per version/scenario. Server worker geometry only, 48 walls and 48 lights, 4 threads. No browser or network.',scenarios:all.before[0].scenarios.map((s:any,i:number)=>{
 const before=all.before.map((r:any)=>r.scenarios[i]),after=all.after.map((r:any)=>r.scenarios[i]);
 const identical=before.every((r:any,n:number)=>JSON.stringify(r.digests)===JSON.stringify(after[n].digests));
 if(!identical)throw Error(`Geometry output changed: ${s.order}`);
 const aggregate=(rows:any[])=>({meanMs:mean(rows.flatMap(r=>r.samples)),medianMs:median(rows.flatMap(r=>r.samples)),workerComputeMsPerRevision:mean(rows.map(r=>r.workerComputeMs/24)),jobsPer24Revisions:rows[0].jobs,coldMeanMs:mean(rows.map(r=>r.cold.ms))});
 return {scenario:s.order,identical,before:aggregate(before),after:aggregate(after)};
})};
await writeFile(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
