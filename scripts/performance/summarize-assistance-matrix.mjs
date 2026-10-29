import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]);
const publish=process.argv.includes('--publish');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.status,'passed');
const mean=a=>a.reduce((sum,n)=>sum+n,0)/a.length;
const median=a=>{const v=a.slice().sort((a,b)=>a-b);return(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2;};
const runs=manifest.cases.map(c=>{
 assert.equal(c.status,'passed');const report=JSON.parse(fs.readFileSync(path.join(root,c.name,'results.json'),'utf8')),r=report.runs[0];
 assert.equal(r.status,'passed');assert.equal(r.samples.length,6);assert.equal(r.serverManaged,c.assist);assert.equal(r.legacyMotion,c.smooth);assert.equal(r.rate,c.rate);assert.equal(r.bothViewsSettled,true);
 for(const value of Object.values(r.instrumentation))assert.equal(value,false);
 assert.equal(r.server.details.workers.failed,0,'No worker failures');
 assert.equal(r.server.details.delivery.failed,0,'No state delivery failures');
 if(c.smooth&&c.rate===1)for(const sample of r.samples)assert(sample.views.find(v=>v.moving).maskPoses.some(p=>p.index>0&&p.index<12),'Moving player must show an intermediate sight pose');
 for(const client of r.clients){assert.deepEqual(client.errors,[]);assert.equal(client.webglAttempts,0);assert.deepEqual(client.graphicsRequests,[]);assert.equal(client.geometrySource,c.assist?'server':'client');}
 return {name:c.name,trial:c.trial,rate:c.rate,assistance:c.assist,smooth:c.smooth,host:report.host,fixture:report.fixture,loadMs:r.loads.map(l=>l.loadToUsableMs),sightMs:r.samples.map(s=>s.sightMs),firstMotionMs:r.samples.map(s=>s.views.find(v=>v.moving).firstMotionMs),completionMs:r.samples.map(s=>Math.max(...s.views.map(v=>v.completeMs))),observedMs:r.observedMs,browserBusyMs:r.clients.reduce((sum,p)=>sum+p.mainThreadBusyMs,0),browserScriptMs:r.clients.reduce((sum,p)=>sum+p.scriptMs,0),serverCpuMs:r.server.cpuMs,serverRssMiB:r.server.rssMiB,httpBytes:r.rasterHttp.reduce((sum,p)=>sum+p.bytes,0),httpRequests:r.rasterHttp.reduce((sum,p)=>sum+p.requests,0),serverDetails:r.server.details,maskPoses:r.samples.map(s=>s.views.map(v=>v.maskPoses)),samples:r.samples};
});
const groups=[];
for(const smooth of [false,true])for(const rate of [1,20])for(const assistance of [false,true]){
 const selected=runs.filter(r=>r.smooth===smooth&&r.rate===rate&&r.assistance===assistance);if(!selected.length)continue;
 assert.equal(selected.length,smooth||manifest.singlePass?1:2);
 const sight=selected.flatMap(r=>r.sightMs),first=selected.flatMap(r=>r.firstMotionMs),complete=selected.flatMap(r=>r.completionMs);
 groups.push({smooth,rate,assistance,runs:selected.length,moves:sight.length,meanSightMs:mean(sight),medianSightMs:median(sight),maxSightMs:Math.max(...sight),meanFirstMotionMs:mean(first),medianFirstMotionMs:median(first),meanBothViewsCompleteMs:mean(complete),medianBothViewsCompleteMs:median(complete),meanLoadMs:mean(selected.flatMap(r=>r.loadMs)),meanBrowserBusyMs:mean(selected.map(r=>r.browserBusyMs)),meanBrowserScriptMs:mean(selected.map(r=>r.browserScriptMs)),meanWindowMs:mean(selected.map(r=>r.observedMs)),meanServerCpuMs:mean(selected.map(r=>r.serverCpuMs)),meanHttpBytes:mean(selected.map(r=>r.httpBytes)),meanHttpRequests:mean(selected.map(r=>r.httpRequests))});
}
const changes=[1,20].map(rate=>{const a=groups.find(g=>!g.smooth&&g.rate===rate&&g.assistance),b=groups.find(g=>!g.smooth&&g.rate===rate&&!g.assistance);const reduction=key=>(1-a[key]/b[key])*100;return{rate,sightMeanReductionPercent:reduction('meanSightMs'),sightMedianReductionPercent:reduction('medianSightMs'),browserBusyReductionPercent:reduction('meanBrowserBusyMs'),browserScriptReductionPercent:reduction('meanBrowserScriptMs'),loadReductionPercent:reduction('meanLoadMs')};});
const summary={at:new Date().toISOString(),method:manifest.method,build:{clientIndexSha256:manifest.clientIndexSha256,gitHead:manifest.gitHead},host:runs[0].host,fixture:runs[0].fixture,groups,changes,runs};
const table=groups.filter(g=>!g.smooth).map(g=>`| ${g.rate}x | ${g.assistance?'On':'Off'} | ${g.meanSightMs.toFixed(0)} | ${g.medianSightMs.toFixed(0)} | ${g.maxSightMs.toFixed(0)} | ${(g.meanLoadMs/1000).toFixed(2)} |`).join('\n');
const work=groups.map(g=>`| ${g.rate}x | ${g.assistance?'On':'Off'} | ${g.smooth?'Smooth':'Snap'} | ${(g.meanBrowserBusyMs/1000).toFixed(3)} | ${(g.meanBrowserScriptMs/1000).toFixed(3)} | ${(g.meanWindowMs/1000).toFixed(3)} | ${(g.meanServerCpuMs/1000).toFixed(3)} | ${(g.meanHttpBytes/1e6).toFixed(2)} |`).join('\n');
const smoothTable=groups.filter(g=>g.assistance).map(g=>`| ${g.rate}x | ${g.smooth?'Smooth':'Snap'} | ${g.meanFirstMotionMs.toFixed(0)} | ${g.meanSightMs.toFixed(0)} | ${g.meanBothViewsCompleteMs.toFixed(0)} |`).join('\n');
const description=changes.map(c=>`At ${c.rate}x, enabling assistance changes mean visibility delay by ${(-c.sightMeanReductionPercent).toFixed(1)}%, accumulated browser busy time by ${(-c.browserBusyReductionPercent).toFixed(1)}%, script time by ${(-c.browserScriptReductionPercent).toFixed(1)}%, and mean load-to-usable by ${(-c.loadReductionPercent).toFixed(1)}%. Negative changes mean less time.`).join('\n\n');
const md=`# Current-build direct server-assistance comparison — 2026-10-28

The comparison keeps Legacy mode fixed and toggles assistance on the current production build. Snap movement is the matched A/B because unassisted Legacy does not support the server-prepared smooth sequence. Assisted smooth movement is a separately labeled supplemental test.

## Matched snap movement

${manifest.singlePass?'One run per condition, six actual alternating drags per condition.':'Two runs per condition, twelve actual alternating drags pooled per condition, six moves per run.'} Means and conventional medians are in milliseconds; maxima are observed samples, not population p95 estimates. Initial load averages both client loads from every included run.

| Browser CPU slowdown | Assistance | Mean release to sight ms | Median ms | Maximum ms | Mean load to usable s |
|---|---|---:|---:|---:|---:|
${table}

${description}

## Work during six completed moves

Each row averages complete six-move windows over the runs available for that row. Browser values sum both players. These windows have different durations; these are accumulated workload totals, not fixed-duration CPU utilization. Server values are Node process CPU seconds including its workers, not per-move elapsed latency. Setup/load CPU is excluded. Both clients' token/view commits settle before ending the window.

| CPU slowdown | Assistance | Movement | Browser busy s | Browser script s | Window s | Server CPU-s | Private image MB |
|---|---|---|---:|---:|---:|---:|---:|
${work}

## Smooth-movement supplement

The earlier exploratory smooth rows were optimistic: the moving player silently snapped when personal torch artwork changed. The corrected guard and intermediate-pose assertion now expose the actual preparation cost. These final smooth results supersede those earlier rows.\n\nOnly assistance-on rows are comparable here. First motion and first changed sight are distinct from completion. Completion is the later of the two clients' endpoint-token and last observed mask paint probes. Smooth is a 400 ms / 13-pose plan; scheduling can skip intermediate poses under severe throttling. At 1x the test requires actual intermediate sight poses on the moving player's own view; a silently snapped move cannot pass as smooth.

| CPU slowdown | Movement | Mean release to first motion ms | Mean release to first changed sight ms | Mean both views complete ms |
|---|---|---:|---:|---:|
${smoothTable}

Per-view pose observations are retained in the JSON; no claim of sustained 30 fps follows merely from the smooth preference being enabled. Pose zero repeats the old view and is excluded as a moving-sight update. An observing player's personal sight can remain unchanged, so its view-commit probe is accepted when no mask changes; the moving player's sight must change in every sample.

## Method and limits

${manifest.method}

Host: ${runs[0].host.cpu.trim()}, ${runs[0].host.logicalCpus} logical CPUs, ${runs[0].host.memoryGiB} GiB RAM, Chrome ${runs[0].host.browser}. Both clients receive the listed throttle before campaign load. The server is unrestricted on the same host. No simulated WAN, memory limit or physical integrated-GPU emulation. The server's Sharp raster work uses CPU workers; no 5090 rendering is involved in these Legacy cases.

Fixture: 143 tokens (140 goblins and three PCs), 48 lights, 28 wall pieces / 112 edges, 240 × 160 ft room, 3840 × 2560 background. Six real alternating mouse drags per run, three per player. No simultaneous-drag load. Seeded panels have default/basic abilities rather than a real campaign's complete spell inventory. All final rows use the same camera/default-animation client build and the same server source, including the narrow torch-display guard correction.

Trial 1 order: on/1x, off/20x, on/20x, off/1x. ${manifest.singlePass?'This final-build matrix has one pass, so order effects remain possible.':'Trial 2 reverses it.'} Supplemental smooth runs follow at 20x and 1x. All cases use fresh disposable servers/campaigns and browser contexts; all use the same client build. Graphics/model requests, geometry source and assistance checkbox are asserted. The animation toggle has been removed: normal clients always request animation; snap is forced by a benchmark-only join-capability override. A narrow server guard allows the viewer-shaped visibleTorch display flag to change along a walk, while wall, light-geometry and fog changes still invalidate animation. Camera transforms now reposition existing masks synchronously.

The probe is event-driven: token layer draw events and SVG/raster revision mutations, followed by two RAF opportunities. It measures browser display opportunities, not physical screen scanout. The initial-load stopwatch includes navigation, startup choice, join/claim and usable draggable tokens. No continuous frame-scanning probe, video, profiler or Playwright trace runs during measurement. The two-view drain is stricter than the earlier benchmark, which could stop while the observer still had work pending; do not treat CPU totals as an exact before/after comparison to that older report.

Historical result files remain intact. Startup/probe failures in earlier discarded attempt folders are excluded. The live DnDServer service, .env and campaign data/uploads were not changed or restarted. Build success and disposable-runtime validation do not activate server changes in the running live process.
`;
const file='docs/performance/assistance-direct-current-2026-10-28';fs.writeFileSync(file+'.md',md);fs.writeFileSync(file+'.json',JSON.stringify(summary,null,2)+'\n');
const htmlTable=(header,rows)=>`<div class="scroll"><table><thead><tr>${header.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Current Legacy assistance A/B test</title><style>*{box-sizing:border-box}body{margin:0;background:#11151b;color:#edf1f5;font:16px system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:18px}h1{font-size:25px}h2{font-size:21px}p{line-height:1.5;color:#cad2dd}a{color:#a7d4ff}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:9px 5px;border-bottom:1px solid #586476}.scroll{overflow:auto}</style></head><body><main><h1>Current-build Legacy assistance on/off</h1><p>Same heavy room and Legacy mode throughout: 143 tokens, 48 lights and 28 wall pieces. Both player CPUs are throttled; the server is unrestricted. ${manifest.singlePass?'Six actual moves per condition.':'Two trials per snap condition, twelve moves pooled per condition.'}</p><h2>Matched snap movement</h2>${htmlTable(['CPU slowdown','Assist','Mean sight ms','Median sight ms','Load s'],groups.filter(g=>!g.smooth).map(g=>[g.rate+'×',g.assistance?'On':'Off',g.meanSightMs.toFixed(0),g.medianSightMs.toFixed(0),(g.meanLoadMs/1000).toFixed(2)]))}<p>${description.replaceAll('\n\n','</p><p>')}</p><h2>Accumulated browser work</h2><p>Seconds summed over both players for six completed moves, averaged over the snap trials. Windows differ in length; this is not CPU utilization.</p>${htmlTable(['CPU','Assist','Busy s','Script s','Window s'],groups.filter(g=>!g.smooth).map(g=>[g.rate+'×',g.assistance?'On':'Off',(g.meanBrowserBusyMs/1000).toFixed(2),(g.meanBrowserScriptMs/1000).toFixed(2),(g.meanWindowMs/1000).toFixed(2)]))}<h2>Assisted smooth movement</h2><p>Smooth movement is now automatic with assistance. Earlier exploratory smooth rows silently snapped the moving player when torch artwork changed; these corrected runs verify intermediate frames and expose the real preparation delay. Snap is a benchmark-only control. These supplemental runs measure preparation and playback cost; they are not a matched animation on/off pair. The moving player's 1× test must observe intermediate sight poses.</p>${htmlTable(['CPU','Movement','First motion ms','First sight ms','Both complete ms'],groups.filter(g=>g.assistance).map(g=>[g.rate+'×',g.smooth?'Smooth':'Snap',g.meanFirstMotionMs.toFixed(0),g.meanSightMs.toFixed(0),g.meanBothViewsCompleteMs.toFixed(0)]))}<p>GPU and accelerated Canvas2D disabled; WebGL blocked. No video, profiler or tracing during timing. No artificial network delay or RAM cap. Results do not certify a physical old CPU, integrated GPU or Safari. Display timing uses two animation-frame opportunities, not physical screen scanout. Initial load includes startup choice and join/claim.</p><p>The camera concealment fix and removal of the animation toggle are live in the frontend; refresh an open page. The live backend was not restarted, so these isolated-server timings do not describe the currently running older backend.</p><p>Fresh disposable servers and campaigns. No live server restart or campaign edits. <a href="report.md">Full method, server costs and limitations</a> · <a href="summary.json">Summary data</a></p></main></body></html>`;
const relative=`previews/assistance-direct-20261028-${createHash('sha256').update(html).digest('hex').slice(0,12)}`;
// Public summary excludes raw server diagnostics and viewer/session information.
const publicSummary={...summary,runs:runs.map(({serverDetails,samples,maskPoses,...r})=>r)};
if(publish)for(const parent of ['client/public','client/dist']){const dir=path.resolve(parent,relative);fs.mkdirSync(dir,{recursive:true});for(const [name,content] of [['index.html',html],['report.md',md],['summary.json',JSON.stringify(publicSummary,null,2)]]){const target=path.join(dir,name);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')!==content)throw Error('Preserve '+target);fs.writeFileSync(target,content);}}
const url=`https://dnd.nic024i.app/${relative}/index.html`;fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify({...summary,url},null,2));console.log(JSON.stringify({url,groups,changes},null,2));
