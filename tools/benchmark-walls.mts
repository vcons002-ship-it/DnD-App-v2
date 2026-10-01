/** Run: node --import tsx tools/benchmark-walls.mts [--browser] [--throttle=4] */
import {benchmarkLayout,benchmarkWalls} from './wall-benchmark.js';
const browserMode=process.argv.includes('--browser'),rate=Number(process.argv.find(a=>a.startsWith('--throttle='))?.split('=')[1]??1);
if(!Number.isFinite(rate)||rate<1)throw new Error('CPU throttle must be at least 1.');
let browser:Awaited<ReturnType<typeof import('@playwright/test')['chromium']['launch']>>|undefined;
try {
 let run=(edges:number,kind:'rooms'|'cave')=>Promise.resolve(benchmarkWalls(benchmarkLayout(edges,kind),kind,15));
 if(browserMode){
  const {build}=await import('esbuild'),{chromium}=await import('@playwright/test');
  const bundle=await build({entryPoints:['tools/wall-benchmark.ts'],bundle:true,write:false,format:'iife',globalName:'wallBench'});
  browser=await chromium.launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH,headless:true}:{channel:'chrome',headless:true});
  const page=await browser.newPage();await page.setContent('<html><body>Wall geometry benchmark</body></html>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate});
  run=(edges,kind)=>page.evaluate(({edges,kind})=>{
   const bench=(globalThis as unknown as {wallBench:{benchmarkLayout:typeof benchmarkLayout;benchmarkWalls:typeof benchmarkWalls}}).wallBench;
   return bench.benchmarkWalls(bench.benchmarkLayout(edges,kind),kind,15);
  },{edges,kind});
 }
 for(const kind of ['rooms','cave'] as const)for(const edges of [512,1024,2048,4096,8192])console.log(JSON.stringify({runtime:browserMode?'Chrome':'Node',cpuThrottle:browserMode?rate:1,...await run(edges,kind)}));
}finally{await browser?.close();}
