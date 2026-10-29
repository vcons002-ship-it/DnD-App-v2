import fs from 'node:fs/promises';
const [beforePath,afterPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw Error('Usage: node scripts/performance/summarize-standard-rendering.mjs BEFORE_JSON AFTER_JSON OUTPUT_JSON');
const before=JSON.parse(await fs.readFile(beforePath,'utf8')),after=JSON.parse(await fs.readFile(afterPath,'utf8'));
const phases=['static','selected','movement','flicker'];
for(const report of [before,after]){
 const keys=report.runs.map(r=>`${r.mode}:${r.rate}`).sort();
 if(JSON.stringify(keys)!==JSON.stringify(['2d:1','2d:6','3d:1','3d:6']))throw Error('Expected four unique standard mode / CPU cases');
 for(const run of report.runs){
  if(run.errors.length||JSON.stringify(run.samples.map(s=>s.phase))!==JSON.stringify(phases))throw Error('Incomplete or failed sample');
  if(!run.gpu.includes('RTX 5090'))throw Error('A sample did not use the hardware GPU');
  for(const sample of run.samples)if(Number(sample.after.miniatureCount)!==(run.mode==='3d'?48:0)||sample.after.cameraTilt!=='45')throw Error('Wrong model count or tilt');
 }
}
const rates=s=>{const frames=Number(s.after.frameCount)-Number(s.before.frameCount);return {frames,renderFramesPerSecond:frames*1000/s.elapsedMs,taskMs:s.taskMs,scriptMs:s.scriptMs,taskMsPerRender:frames?s.taskMs/frames:null};};
const percent=(a,b)=>100*(b/a-1);
const result={at:new Date().toISOString(),beforePath,afterPath,limitations:'One before/after sample per case, same local unrestricted server and RTX 5090. 6x is Chrome CPU emulation, not an old physical CPU. Main-thread task time and distinct miniature render frames are measured; these are not input latency, physical display FPS, network latency or GPU utilization. Elapsed windows approximate 4 seconds; CDP/counter reads add small boundary overhead. Mist stays enabled, including the phase named static (stationary tokens).',runs:after.runs.map(run=>{
 const old=before.runs.find(r=>r.mode===run.mode&&r.rate===run.rate);
 return {mode:run.mode,cpuRate:run.rate,loadMs:{before:old.loadMs,after:run.loadMs},samples:run.samples.map((sample,i)=>{
  const a=rates(old.samples[i]),b=rates(sample);
  const delta=name=>Number(sample.after[name])-Number(sample.before[name]);
  return {phase:sample.phase,before:a,after:b,taskChangePercent:percent(a.taskMs,b.taskMs),renderRateChangePercent:percent(a.renderFramesPerSecond,b.renderFramesPerSecond),perRenderTaskChangePercent:percent(a.taskMsPerRender,b.taskMsPerRender),retained:{lightFieldUpdates:delta('lightFieldUpdates'),nameTextureUpdates:delta('nameTextureUpdates'),namePositionUpdates:delta('namePositionUpdates'),bodyAppearanceUpdates:run.mode==='3d'?delta('bodyAppearanceUpdates'):null,before:JSON.parse(sample.before.retainedStats),after:JSON.parse(sample.after.retainedStats)}};
 })};
})};
await fs.writeFile(outputPath,JSON.stringify(result,null,2));
for(const run of result.runs)console.log(JSON.stringify({mode:run.mode,cpuRate:run.cpuRate,loadMs:run.loadMs,samples:run.samples.map(s=>({phase:s.phase,beforeFps:s.before.renderFramesPerSecond,afterFps:s.after.renderFramesPerSecond,taskChangePercent:s.taskChangePercent,perRenderTaskChangePercent:s.perRenderTaskChangePercent,field:s.retained.lightFieldUpdates,names:s.retained.nameTextureUpdates,body:s.retained.bodyAppearanceUpdates}))}));
