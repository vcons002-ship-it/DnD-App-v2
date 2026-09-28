import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const url=process.argv[2],output=process.argv[3];
if(!url||!output)throw Error('Usage: node benchmark.mjs PREVIEW_URL OUTPUT_DIRECTORY');
await mkdir(output,{recursive:true});
const benchmarkURL=new URL(url);benchmarkURL.searchParams.set('benchmark','1');
const browser=await chromium.launch({headless:true,executablePath:process.env.PW_CHROMIUM??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const receipt={at:new Date().toISOString(),url,method:'Asynchronous EXT_disjoint_timer_query_webgl2 over the complete depth, scene and mist render passes. 3 s warmup then 4 s sampling per mode. Same seven models and 45-degree close-up. No video recording or CPU throttling.',
  limitation:'GPU execution time on this computer only, not total frame time or a physical phone benchmark. CPU work, browser composition and display timing are not included. Phone profile changes viewport and pixel ratio only.',profiles:[],errors:[]};
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:null;};
try{
  for(const profile of [{name:'desktop',viewport:{width:1600,height:1000},deviceScaleFactor:1},{name:'phone-viewport-on-same-GPU',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]){
    const context=await browser.newContext(profile),page=await context.newPage();
    page.on('pageerror',e=>receipt.errors.push(e.message));
    await page.goto(benchmarkURL.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='7',null,{timeout:120000});
    await page.getByRole('button',{name:'45° view',exact:true}).click();
    await page.waitForTimeout(800);
    const gpu=await page.locator('canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};});
    const entry={...profile,gpu,modes:[]};receipt.profiles.push(entry);
    for(const quality of ['off','high','low','off']){
      await page.getByRole('combobox',{name:'Atmosphere quality'}).selectOption(quality);
      await page.waitForFunction(q=>document.querySelector('[data-testid="miniature-layer"]').dataset.mistQuality===q,quality);
      // Orbit forces equivalent continuous redraws even with mist disabled.
      await page.getByRole('button',{name:'Rotate view',exact:true}).click();
      await page.waitForTimeout(3000);
      const samples=[];
      for(let i=0;i<16;i++){
        await page.waitForTimeout(250);
        const sample=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
        if(Number(sample.gpuSamples)>0&&Number.isFinite(Number(sample.gpuMs)))samples.push(Number(sample.gpuMs));
      }
      const data=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
      entry.modes.push({quality,gpuMedianMs:median(samples),samples,data});
      if(gpu.timer)assert(samples.length>0,'GPU timer supported but produced no samples');
      await page.getByRole('button',{name:'Rotate view',exact:true}).click();
      await page.getByRole('button',{name:'Reset view',exact:true}).click();
      await page.waitForTimeout(750); // Finish reset so every mode starts from the same yaw.
      await page.getByRole('button',{name:'45° view',exact:true}).click();
      await page.waitForTimeout(800);
    }
    await context.close();
  }
  assert.equal(receipt.errors.length,0);receipt.status='passed';
}catch(e){receipt.status='failed';receipt.failure=e.message;process.exitCode=1;}
finally{await browser.close();await writeFile(path.join(output,'performance.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));}
