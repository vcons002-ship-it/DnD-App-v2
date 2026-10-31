import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [folder,output]=process.argv.slice(2);
if(!folder||!output)throw Error('Usage: node --import tsx scripts/performance/summarize-shared-visibility.mts <artifact folder with heavy-before/after-1/2> <output.json>');
const roles=['Legacy player','2D DM preview','3D DM preview'];
const stats=(values:number[])=>{
 const a=values.filter(Number.isFinite).sort((a,b)=>a-b),n=a.length;
 return n?{n,mean:a.reduce((s,n)=>s+n,0)/n,median:(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2,p95:a[Math.ceil(n*.95)-1],max:a[n-1]}:null;
};
const trials=await Promise.all(['before-1','after-1','after-2','before-2'].map(async trial=>{
 const data=JSON.parse(await readFile(path.join(folder,`heavy-${trial}`,'results.json'),'utf8'));
 if(data.runs.some((r:any)=>r.status!=='passed'||r.samples.length!==8))throw Error(`Incomplete trial ${trial}`);
 return {trial,...data,runs:data.runs.map((r:any)=>({...r,samples:r.samples.map((s:any)=>({...s,views:s.views.map(({motionFrames,resources,frame,...v}:any)=>{const {images,...timing}=frame;return {...v,frame:timing};})}))}))};
}));
const measurements=(v:any):Record<string,number>=>{
 const s=v.frame.server;
 return {firstMotion:v.firstPaintMs,firstSight:v.firstSightPaintMs,complete:v.completeMs,server:s.emittedAt-s.receivedAt,
  apply:s.appliedAt-s.receivedAt,pathAndSnapshot:s.queuedAt-s.appliedAt,deliveryWait:s.startedAt-s.queuedAt,
  geometry:s.geometryEndAt-s.geometryStartAt,render:s.renderEndAt-s.renderStartAt,motion:s.motionEndAt-s.motionStartAt,
  serverEmitToFirstPaint:v.firstPaintMs-(s.emittedAt-s.receivedAt),poseCount:v.poseCount};
};
const rows:any[]=[1,6].flatMap(rate=>roles.map(role=>({rate,role,...Object.fromEntries(['before','after'].map(side=>{
 const views=trials.filter(t=>t.trial.startsWith(side)).flatMap(t=>t.runs.filter((r:any)=>r.cpuSlowdown===rate).flatMap((r:any)=>r.samples.map((s:any)=>s.views.find((v:any)=>v.role===role))));
 const measured=views.map(measurements);
 return [side,Object.fromEntries(Object.keys(measured[0]).map(key=>[key,stats(measured.map(m=>m[key]))]))];
}))})));
// Release-to-paint minus receive-to-emit is a residual, not pure network time:
// it also includes input/send delay before server receipt and browser rendering.
for(const row of rows)for(const side of ['before','after']){
 row[side].outsideServer=row[side].serverEmitToFirstPaint;delete row[side].serverEmitToFirstPaint;
}
await writeFile(output,JSON.stringify({method:'Before/after/after/before. 16 drags per rate/version; three simultaneous viewers per drag. Stages overlap. All successful samples retained, including cold first moves.',rows,trials},null,2));
console.log(JSON.stringify(rows,null,2));
