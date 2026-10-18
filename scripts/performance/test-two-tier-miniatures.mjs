import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const output=process.env.LOD_BENCH_RESULTS||'tmp/two-tier-miniatures';
fs.mkdirSync(output,{recursive:true});
const base=process.env.LOD_LOADING_URL||'http://localhost:4374/uploads/two-tier-lod/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--use-adapter-luid='+(process.env.NVIDIA_LUID||'0,87834')]});
const results=[];
try {
  for(const quality of ['high','balanced','low']) {
    const far='battlefield',near=quality;
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage(),requests=[],errors=[];
    page.on('request',r=>{if(r.url().endsWith('.glb'))requests.push(new URL(r.url()).pathname)});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    const urls=()=>[...new Set(requests)];
    const waitForTier=(id,tier)=>page.waitForFunction(({id,tier})=>JSON.parse(document.querySelector('[data-testid="miniature-layer"]').dataset.activeModelUrls).some(u=>u.includes('/'+id+'-'+tier+'-shared-')),{id,tier},{timeout:120000});
    await page.goto(base+'?quality='+quality);
    await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='3',undefined,{timeout:120000});
    await page.waitForTimeout(800);
    const before=urls();
    assert.equal(before.length,3);
    assert(before.every(u=>u.includes('-'+far+'-shared-')));
    // A hidden figure inside the viewport must not cause a detailed download.
    await page.evaluate(()=>{window.lodTest.conceal(true);window.lodTest.setView(4)});
    await page.waitForTimeout(1200);
    assert.deepEqual(urls(),before);
    await page.evaluate(()=>window.lodTest.conceal(false));
    await waitForTier('druk',near);
    const afterZoom=urls();
    assert.equal(afterZoom.length,4);
    assert(!afterZoom.some(u=>!u.includes('/druk-')&&u.includes('-'+near+'-shared-')));
    await page.evaluate(()=>window.lodTest.setView(4,1800));
    await waitForTier('varis',near);
    const afterPan=urls();
    assert.equal(afterPan.length,5);
    assert(!afterPan.some(u=>u.includes('/vanec-'+near+'-shared-')));
    await page.evaluate(()=>window.lodTest.move('vanec',1800,0,true));
    await waitForTier('vanec',near);
    const afterMove=urls();
    assert.equal(afterMove.length,6);
    assert(afterMove.every(u=>u.includes('-'+far+'-shared-')||u.includes('-'+near+'-shared-')));
    assert.deepEqual(errors,[]);
    // Both tiers use the existing coarse planning mesh, not a fresh bake of
    // hundreds of thousands of close-up triangles at the swap.
    assert.equal(await page.getByTestId('miniature-layer').getAttribute('data-preview-geometry-assets'),'3');
    results.push({quality,far,near,hiddenFigureDidNotUpgrade:true,before,afterZoom,afterPan,afterMove,errors});
    console.log(JSON.stringify({quality,initial:before.length,afterZoom:afterZoom.length,afterPan:afterPan.length,afterMove:afterMove.length,errors}));
    await context.close();
  }
  // A live camera gesture does not update React props. Detail must prepare
  // during that gesture rather than waiting for a debounce after it stops.
  for(const quality of ['high','balanced','low']){
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
    let started=0,requestedAt=0,requestCount=0;
    const urls=new Set();
    page.on('request',r=>{if(r.url().endsWith('.glb')){
      requestCount++;
      urls.add(new URL(r.url()).pathname);
      if(r.url().includes('/druk-'+quality+'-shared-'))requestedAt=Date.now()-started;
    }});
    await page.goto(base+'?quality='+quality);
    await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='3',undefined,{timeout:120000});
    // Isolate the model budget from Vanec's independently animated FX.
    await page.evaluate(()=>window.lodTest.setOthersVisible(false));await page.waitForTimeout(500);
    const initialDraw=await page.getByTestId('miniature-layer').evaluate(n=>({triangles:+n.dataset.colorTriangles,calls:+n.dataset.colorDrawCalls}));
    started=Date.now();
    const upgradedDuringGesture=await page.evaluate(async quality=>{
      const start=performance.now();let upgraded=false;
      await new Promise(resolve=>{function step(t){const progress=Math.min(1,(t-start)/4000);
        window.lodTest.liveView(.5+3.5*progress);
        const urls=JSON.parse(document.querySelector('[data-testid="miniature-layer"]').dataset.activeModelUrls);
        if(urls.some(u=>u.includes('/druk-'+quality+'-shared-')))upgraded=true;
        if(progress<1)requestAnimationFrame(step);else resolve();
      }requestAnimationFrame(step)});return upgraded;
    },quality);
    assert(requestedAt>0&&requestedAt<3000,'Detail request was postponed until zoom ended');
    assert(upgradedDuringGesture,'Detail was not ready before the camera finished zooming');
    assert.equal(urls.size,4);assert([...urls].every(u=>!u.includes('/varis-'+quality+'-')&&!u.includes('/vanec-'+quality+'-')));
    const swaps=()=>page.getByTestId('miniature-layer').evaluate(n=>+n.dataset.lodSwapCount);
    await page.evaluate(()=>window.lodTest.liveView(.5));await page.waitForTimeout(600);
    const retained=await page.getByTestId('miniature-layer').evaluate(n=>({triangles:+n.dataset.colorTriangles,calls:+n.dataset.colorDrawCalls,prepared:JSON.parse(n.dataset.preparedModelUrls),preparedInScene:+n.dataset.preparedModelsInScene}));
    assert(retained.triangles<=initialDraw.triangles,'Cached detail added to far-view triangles');
    assert(retained.calls<=initialDraw.calls,'Cached detail added draw calls');
    assert.equal(retained.preparedInScene,0);
    assert(retained.prepared.some(u=>u.includes('/druk-'+quality+'-shared-')));
    const beforeSwaps=await swaps(),beforeRequests=requestCount;
    for(let i=0;i<6;i++){
      await page.evaluate(()=>window.lodTest.liveView(4));await page.waitForTimeout(220);
      await page.evaluate(()=>window.lodTest.liveView(.5));await page.waitForTimeout(220);
    }
    await page.waitForTimeout(450);
    const rapidSwaps=(await swaps())-beforeSwaps;
    assert(rapidSwaps<=2,'Rapid camera reversals caused repeated swaps');
    // Sustained zoom-outs do downgrade, then reuse the same ready close model.
    for(let i=0;i<2;i++){
      await page.evaluate(()=>window.lodTest.liveView(4));await page.waitForTimeout(450);
      await page.evaluate(()=>window.lodTest.liveView(.5));await page.waitForTimeout(600);
    }
    assert.equal(requestCount,beforeRequests,'Repeated zooms downloaded/reparsed another GLB');
    const cachedDraw=await page.getByTestId('miniature-layer').evaluate(n=>({triangles:+n.dataset.colorTriangles,calls:+n.dataset.colorDrawCalls,previewAssets:+n.dataset.previewGeometryAssets}));
    assert(cachedDraw.triangles<=initialDraw.triangles);assert(cachedDraw.calls<=initialDraw.calls);assert.equal(cachedDraw.previewAssets,3);
    await page.evaluate(()=>window.lodTest.liveView(4,1800));
    await page.waitForFunction(quality=>!JSON.parse(document.querySelector('[data-testid="miniature-layer"]').dataset.preparedModelUrls).some(u=>u.includes('/druk-'+quality+'-shared-')),quality);
    results.push({quality,continuousCamera:true,detailRequestedMs:requestedAt,upgradedDuringGesture,rapidSwaps,extraModelRequests:requestCount-beforeRequests,offscreenDetailReleased:true,initialDraw,retained,cachedDraw,urls:[...urls]});
    console.log(JSON.stringify({quality,continuousCamera:true,requestedAt,upgradedDuringGesture}));
    await context.close();
  }
  fs.writeFileSync(output+'/viewport-qa.json',JSON.stringify(results,null,2));
} finally { await browser.close() }
