const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{
const output=process.argv[2]||'artifacts/mist-performance.json';const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
const url=process.env.PERF_URL||'https://dnd.nic024i.app/uploads/previews/darkvision-interactive-20260928/environment-test.html?vision=1&benchmark=1';
const profiles=process.env.PERF_WIDE?[{name:'wide-phone-layout-4x-cpu',width:840,height:900,dpr:2.5,cpu:4}]:process.env.PERF_PHONE_CPU?[{name:`phone-layout-${process.env.PERF_PHONE_CPU}x-cpu`,width:390,height:844,dpr:3,cpu:Number(process.env.PERF_PHONE_CPU)}]:[{name:'desktop',width:1440,height:1000,dpr:1,cpu:1},{name:'phone-layout-4x-cpu',width:390,height:844,dpr:3,cpu:4}];
for(const profile of profiles){
 const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.getByText('7/7 miniatures loaded',{exact:true}).waitFor({timeout:180000});
 await page.getByRole('button',{name:'Heavy darkness',exact:true}).click();await page.getByRole('button',{name:'Mist movement test',exact:true}).click();await page.getByRole('button',{name:'Party view',exact:true}).click();await page.waitForTimeout(1200);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});await cdp.send('Profiler.enable');
 const cases=profile.name==='desktop'?[{name:'moving-interaction',mist:true,interaction:true,viewer:'druk'}]:[
 {name:'moving-no-mist',mist:false,interaction:false,viewer:'druk'},
 {name:'moving-mist-no-interaction',mist:true,interaction:false,viewer:'druk'},
 {name:'moving-interaction',mist:true,interaction:true,viewer:'druk'},
 {name:'moving-dm-no-vision-mask',mist:true,interaction:true,viewer:'dm'},
 ];
 for(const test of cases){
  await page.getByLabel('View as',{exact:true}).selectOption(test.viewer);await page.getByLabel('Drifting mist',{exact:true}).setChecked(test.mist);await page.getByLabel('React to movement',{exact:true}).setChecked(test.interaction);await page.getByRole('button',{name:'Move party',exact:true}).waitFor();
  await page.getByRole('button',{name:'Move party',exact:true}).click();await page.waitForTimeout(800);await cdp.send('Profiler.start');
  const metrics=await page.evaluate(()=>new Promise(resolve=>{const frames=[],samples=[],start=performance.now();let prev=start,lastSample=0;const tick=now=>{frames.push(now-prev);prev=now;if(now-lastSample>500){lastSample=now;samples.push({...document.querySelector('[data-testid="miniature-layer"]').dataset});}if(now-start<5500)requestAnimationFrame(tick);else{frames.sort((a,b)=>a-b);resolve({rafFps:frames.length*1000/(now-start),p95FrameMs:frames[Math.floor(frames.length*.95)],framesOver50ms:frames.filter(x=>x>50).length,samples})}};requestAnimationFrame(tick)}));
  const {profile:cpu}=await cdp.send('Profiler.stop');const names=new Map(cpu.nodes.map(n=>[n.id,n.callFrame]));const costs={};cpu.samples?.forEach((id,i)=>{const f=names.get(id),key=(f.functionName||'(anonymous)')+' '+f.url+':'+f.lineNumber+':'+f.columnNumber;costs[key]=(costs[key]||0)+(cpu.timeDeltas?.[i]||0)/1000});
  const top=Object.entries(costs).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const row={profile:profile.name,case:test.name,...metrics,topCpu:top,errors:[...errors]};results.push(row);console.log(JSON.stringify({profile:row.profile,case:row.case,rafFps:row.rafFps,p95FrameMs:row.p95FrameMs,gpuMs:row.samples.at(-1)?.gpuMs,quality:row.samples.at(-1)?.mistQuality,topCpu:top.slice(0,5)}));
  await page.getByRole('button',{name:'Move party',exact:true}).waitFor();await page.waitForTimeout(300);
 }
 await context.close();
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({note:'Headless desktop Chrome with CPU profiling; RAF cadence is not physical display FPS. Phone viewport/DPR and CPU slowdown do not emulate phone GPU, thermals or browser.',url,browser:browser.version(),profiles,sampleMs:5500,results},null,2));await browser.close();
if(results.some(row=>row.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
