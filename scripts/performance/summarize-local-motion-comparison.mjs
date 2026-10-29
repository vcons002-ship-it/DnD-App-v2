import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const primary='artifacts/motion-latency-modes-20261028/results.json';
const legacy='artifacts/motion-latency-modes-legacy-sight-20261028/results.json';
const original=JSON.parse(fs.readFileSync(primary,'utf8')),retake=JSON.parse(fs.readFileSync(legacy,'utf8'));
const runs=[...retake.runs,...original.runs.filter(r=>r.mode!=='legacy')];
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2;};
const rows=[];
for(const run of runs){
 if(run.status!=='passed'||run.samples.length!==8)throw Error('Incomplete run');
 for(const role of ['Player','DM']){
  const views=run.samples.map(s=>s.views.find(v=>v.role===role));
  rows.push({mode:run.mode,slowdown:run.cpuSlowdown,role,samples:views.length,firstMotionMedianMs:median(views.map(v=>v.firstPaintMs)),firstMotionMaxMs:Math.max(...views.map(v=>v.firstPaintMs)),firstSightMedianMs:median(views.map(v=>v.firstSightPaintMs)),completionMedianMs:median(views.map(v=>v.completeMs)),serverDeliveryMedianMs:median(views.map(v=>v.frame.server.emittedAt-v.frame.server.receivedAt)),renderImageMedianBytes:median(views.map(v=>v.resources.reduce((n,r)=>n+r.transferSize,0))),intermediatePoseCounts:views.map(v=>v.poseCount),sightUpdates:views.map(v=>v.sightUpdates)});
 }
}
const summary={host:original.host,method:original.method,sources:[primary,legacy],note:'Local rendering means server-managed rendering off on both clients. All modes still use the authoritative server for moves, filtering and exploration. Medians use the mean of the middle two values. Legacy was repeated to make its first-sight metric ignore atlas pose zero (same sight as the old position). Rendering mode and assistance are independent settings.',rows};
const table=(metric='firstMotionMedianMs',format='md')=>[1,6,20].flatMap(rate=>['Player','DM'].map(role=>{
 const values=['legacy','local-2d','local-3d'].map(mode=>rows.find(r=>r.mode===mode&&r.slowdown===rate&&r.role===role)[metric].toFixed(0));
 return format==='md'?`| ${rate}x | ${role} | ${values.join(' | ')} |`:`<tr><td>${rate}×</td><td>${role}</td>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
})).join('\n');
const md=`# Legacy assisted versus local movement — 2026-10-28

Standard local rendering starts sooner than assisted Legacy on this real-image scene. Under extreme CPU throttling, both paths stutter and local 2D had a large cold hitch. This is a timing comparison, not evidence that local rendering is cheaper on all old hardware.

## Release to first movement-paint estimate (ms)

| Browser CPU slowdown | View | Legacy assisted | Local 2D / Low | Local 3D / Low |
|---|---|---:|---:|---:|
${table()}

## Release to first movement-related visibility-paint estimate (ms)

| Browser CPU slowdown | View | Legacy assisted | Local 2D / Low | Local 3D / Low |
|---|---|---:|---:|---:|
${table('firstSightMedianMs')}

Visibility timing tracks the first changed sight origin path on local clients and the first nonzero mask pose in Legacy. It is not completion of the whole movement or a proof that every displayed pixel was correct. Local clients may redraw sight for sub-pixel movement before the token exceeds the one-map-pixel movement threshold. The two numbers need not match exactly. The Legacy retake excludes pose zero, which changes image packing without moving sight.

## Method

${original.method}

Same current application build for every condition. Same 1216 × 832 real courtyard image, four wall pieces, two guards, a claimed PC, carried lantern, heavy darkness and remembered terrain. Eight actual player drags per mode/rate, both independent clients receive the listed slowdown, and DM watches Player visibility. Fresh disposable session and browser contexts per condition. Throttling starts after setup; no video encoder or unrelated CPU-heavy test ran concurrently. The benchmark validates assistance preference on both clients, local wall-geometry source, graphics tilt and renderer readiness. Local 3D uses projected pointer coordinates for the 45-degree board.

Hardware: ${original.host.cpu.trim()}, ${original.host.logicalCpus} logical CPUs. Chrome ${original.host.browser}. Local rendering uses real WebGL on the RTX 5090, with no GPU throttling. Legacy blocks WebGL. These numbers do not emulate an old integrated GPU, weak memory subsystem or WAN. This scene is not the earlier many-creature stress test.

Both the release event and browser probes use the host epoch clock. The movement probe excludes the held destination preview by reading the token's actual art offset. It waits for two RAF opportunities after first movement (>1 map pixel); local rendering additionally requires a subsequent WebGL draw submission. These are presentation estimates, not physical display scanout or GPU completion measurements. Rendering stalls are retained. Eight samples are too few for a dependable population p95; the JSON includes the observed maxima.

## Interpretation and limits

- Local rendering avoids the server's full 13-pose image preparation/download/decode barrier. It still waits for the authoritative movement state, including remembered-path exploration and per-viewer filtering. It then calculates intermediate view geometry, projects masks and renders locally during the animation.
- Legacy still prepares and decodes a complete synchronized animation before publishing it. Its sequence is 400 ms; local movement uses a distance-dependent 220–460 ms duration. First-motion comparisons exclude that duration, while completion timings in JSON include it.
- At 20x, the original local 2D DM run contained a roughly 8.9-second first-paint estimate. The server emitted that move in about 0.11 seconds; the DM browser received it about 3.35 seconds after release and then had a multi-second animation-frame gap. This browser-side stall is in the raw results and the maximum; it has not been discarded. No profiler was active, so its precise cause is unproven.
- Intermediate pose counts in JSON are sampled RAF positions, not physical monitor FPS. Both paths can skip most animation poses at 20x. A lower median start delay alone does not establish smoothness.
- Non-Legacy mode can also use server assistance. The local columns specifically turn it off; this comparison does not measure standard 2D/3D with assistance enabled.

All compared groups passed the opt-in browser test, completed eight moves on both clients and had no client page errors. No application implementation changed for this comparison. The live DnDServer was not restarted and live campaign data/uploads were not used.
`;
const file='docs/performance/legacy-versus-local-motion-2026-10-28';
fs.writeFileSync(file+'.json',JSON.stringify(summary,null,2)+'\n');fs.writeFileSync(file+'.md',md);
const htmlTable=metric=>`<div class="scroll"><table><thead><tr><th>CPU slowdown</th><th>View</th><th>Legacy assisted</th><th>Local 2D</th><th>Local 3D</th></tr></thead><tbody>${table(metric,'html')}</tbody></table></div>`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legacy versus local movement timing</title><style>*{box-sizing:border-box}body{margin:0;background:#11151b;color:#edf1f5;font:16px system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:18px}h1{font-size:25px}h2{font-size:21px}p{line-height:1.5;color:#cad2dd}a{color:#a7d4ff}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:8px 5px;border-bottom:1px solid #586476}.scroll{overflow:auto}</style></head><body><main><h1>Legacy assisted versus local movement</h1><p>Median milliseconds from releasing an actual drag, eight moves per condition. The DM watches Player visibility. Local means standard Low with server-managed rendering off.</p><h2>First movement-paint estimate</h2>${htmlTable('firstMotionMedianMs')}<h2>First moving-visibility-paint estimate</h2>${htmlTable('firstSightMedianMs')}<p>Local rendering starts sooner in this courtyard scene. Legacy waits for the complete server-prepared animation images. Local clients receive the accepted move and calculate intermediate visibility/rendering themselves. All modes still use the server for authoritative moves and remembered exploration.</p><p>At 20×, both versions skip many animation poses. The local 2D DM also had a roughly 8.9-second cold stall, retained in the maximum results. The server emitted that move in about 0.11 seconds; most of that stall happened in the browser. Lower median latency does not establish smoothness.</p><p>Same real courtyard image, four walls, two guards, lantern, heavy darkness and remembered terrain. Both clients receive the CPU slowdown; the server is unrestricted. The local GPU is an unrestricted RTX 5090. This is not the earlier many-creature stress test or an old integrated-GPU simulation. Setup/loading is excluded. No video capture ran during timing.</p><p>First paint is estimated using token position/sight changes, two animation-frame opportunities, and a subsequent local WebGL draw. It does not measure physical display scanout. Legacy has 13 poses over 400 ms; local movement duration varies from 220–460 ms by distance. Non-Legacy can also use assistance; the local columns turn it off.</p><p>No live server restart or campaign edits. All compared moves passed without page errors.</p><p><a href="report.md">Detailed method and limits</a> · <a href="timings.json">Timing summary and observed maxima</a> · <a href="../legacy-latency-20261028-bba37b38911e/index.html">Legacy recordings</a></p></main></body></html>`;
const digest=createHash('sha256').update(html).digest('hex').slice(0,12),relative=`previews/local-motion-comparison-20261028-${digest}`;
for(const parent of ['client/public','client/dist']){
 const dir=path.resolve(parent,relative);fs.mkdirSync(dir,{recursive:true});
 for(const [name,content] of [['index.html',html],['timings.json',JSON.stringify(summary,null,2)],['report.md',md]]){
  const target=path.join(dir,name);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')!==content)throw Error('Preserve '+target);fs.writeFileSync(target,content);
 }
}
const url=`https://dnd.nic024i.app/${relative}/index.html`;
fs.writeFileSync('artifacts/motion-latency-modes-20261028/comparison.json',JSON.stringify({url,summary},null,2));console.log(JSON.stringify({url,rows},null,2));
