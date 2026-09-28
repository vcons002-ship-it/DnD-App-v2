import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const evidence=path.resolve(process.argv[2]);
const base='https://dnd.nic024i.app/uploads/previews/environment-variety-20260928/';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],looks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
try{
  await page.goto(base+'index.html');
  const layout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  assert.equal(layout.width,layout.document);
  await page.locator('video').evaluate(async video=>{video.muted=true;await video.play();});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>1.5);
  const video=await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error}));
  assert(video.width>1000&&video.duration>35);assert.equal(video.error,null);
  await page.locator('video').evaluate(v=>v.pause());
  await page.screenshot({path:path.join(evidence,'published-phone.png')});
  const range=await fetch(base+'environment-variety.mp4',{headers:{Range:'bytes=0-1023'}});
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
  await page.getByRole('link',{name:'Try the interactive scene',exact:true}).click();
  const layer=page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count','7',{timeout:90000});
  await expect(layer).toHaveAttribute('data-ground-ready','true');
  await expect(layer).toHaveAttribute('data-particle-quality','low');
  await page.getByRole('button',{name:'Three torches',exact:true}).click();
  for(const [id,particles,tint] of [['autumn-wind','leaves','natural'],['firefly-glade','fireflies','green'],['haunted-marsh','fireflies','green'],['ashfall','embers','ash'],['sandstorm','dust','sand'],['blizzard','none','cool']]){
    await page.getByLabel('Environment preset',{exact:true}).selectOption(id);
    await expect(layer).toHaveAttribute('data-particles',particles);
    await expect(layer).toHaveAttribute('data-mist-color',tint);
    await expect(layer).toHaveAttribute('data-light-count','3');
    looks.push({id,data:await layer.evaluate(e=>({...e.dataset}))});
  }
  await page.getByLabel('Environment preset',{exact:true}).selectOption('sandstorm');
  await expect(layer).toHaveAttribute('data-particle-count','490');
  await page.getByLabel('Atmosphere quality',{exact:true}).selectOption('high');
  await expect(layer).toHaveAttribute('data-particle-count','1400');
  await page.getByLabel('Atmosphere quality',{exact:true}).selectOption('off');
  await expect(layer).toHaveAttribute('data-particle-count','0');
  await page.getByLabel('Atmosphere quality',{exact:true}).selectOption('auto');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(layer).toHaveAttribute('data-particle-time','0');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect.poll(async()=>Number(await layer.getAttribute('data-particle-time'))).toBeGreaterThan(0);
  await page.getByLabel('Environment preset',{exact:true}).selectOption('haunted-marsh');
  await page.getByRole('button',{name:'Move party',exact:true}).click();
  await expect.poll(async()=>Number(await layer.getAttribute('data-mist-wakes'))).toBeGreaterThan(0);
  await page.screenshot({path:path.join(evidence,'interactive-phone.png')});
  const labLayout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  assert.equal(labLayout.width,labLayout.document);assert.deepEqual(errors,[]);
  await writeFile(path.join(evidence,'mobile-verification.json'),JSON.stringify({status:'passed',url:base,video,layout,labLayout,looks,errors,note:'Desktop Chrome with a mobile viewport; not a physical-phone GPU benchmark.'},null,2));
  console.log(JSON.stringify({status:'passed',video,looks:looks.length,errors}));
}finally{await context.close();await browser.close();}
