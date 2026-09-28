import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

// A separate static lab: no app server, save file or campaign connection.
const out=path.resolve(process.argv[2]);await mkdir(out,{recursive:true});
const root=path.resolve('client/environment-dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path.relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);
const encoder=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');
const ffmpeg=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
encoder.executablePath=()=>ffmpeg;encoder.executablePathOrDie=()=>ffmpeg;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out,size:{width:1440,height:960}}});
const page=await context.newPage(),errors=[],phases=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
let box;
try{
  await page.goto('http://127.0.0.1:4198/environment-test.html');
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='7');
  await page.getByRole('button',{name:'Close-up',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(800);
  box=await page.getByTestId('environment-stage').boundingBox();
  await page.evaluate(()=>{
    const marker=document.createElement('div');marker.style.cssText='position:fixed;left:0;top:0;width:8px;height:8px;background:#ff00ff;z-index:9999';document.body.append(marker);
    const caption=document.createElement('div');caption.id='record-caption';caption.style.cssText='position:absolute;left:0;right:0;top:0;padding:16px;text-align:center;background:#101815ed;color:#ece7d3;font:22px Georgia;z-index:9;pointer-events:none';
    document.querySelector('[data-testid="environment-stage"]').append(caption);
  });
  const caption=async text=>{
    phases.push({text,at:Date.now()});await page.locator('#record-caption').evaluate((e,t)=>e.textContent=t,text);
    await page.mouse.move(1410,945);
  };
  await caption('Lower-body contact: a narrow leading edge');
  await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);
  await page.waitForTimeout(3000);await page.screenshot({path:path.join(out,'stronger-wake.png')});await page.waitForTimeout(6000);
  await caption('The trail persists while moving and rotating the camera');
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();
  await page.mouse.move(box.x+80,box.y+box.height-90);await page.mouse.down({button:'right'});
  for(let i=1;i<=100;i++){
    await page.mouse.move(box.x+80+i*8.4,box.y+box.height-90);await page.waitForTimeout(40);
    if([30,60,90].includes(i)){
      const data=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
      assert(Number(data.mistWakes)>0,'Rotation must not erase the moving trail');
      phases.push({text:`Orbit ${i}`,data});await page.screenshot({path:path.join(out,`angle-${i}.png`)});
    }
  }
  await page.mouse.up({button:'right'});await page.mouse.move(1410,945);await page.waitForTimeout(1600);
  await caption('Mist parts at his body; curls develop behind him');
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);await page.waitForTimeout(5400);
  await caption('Overhead: the mist gradually folds back into the trail');
  await page.getByRole('button',{name:'Overhead view',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);
  await page.waitForTimeout(2500);await page.screenshot({path:path.join(out,'overhead-wake.png')});await page.waitForTimeout(6000);
  assert.deepEqual(errors,[]);
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
const source=await page.video().path();
// Locate the visible start marker in actual encoded frames, not wall time.
// Startup and the encoder need not run at the same pace as the test process.
const pixels=execFileSync(ffmpeg,['-v','error','-i',source,'-vf','fps=25,crop=2:2:2:2,format=rgb24','-f','rawvideo','pipe:1']);
let frame=0;for(;frame<pixels.length/12;frame++)if(pixels[frame*12]>210&&pixels[frame*12+1]<40&&pixels[frame*12+2]>210)break;
assert(frame<pixels.length/12,'Recording start marker missing');
const start=frame/25,video=path.join(out,'mist-orbit.mp4');
const crop=`crop=${Math.floor(box.width/2)*2}:${Math.floor(box.height/2)*2}:${Math.floor(box.x/2)*2}:${Math.floor(box.y/2)*2}`;
execFileSync(ffmpeg,['-y','-v','error','-ss',String(start),'-i',source,'-vf',crop,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-an','-movflags','+faststart',video],{windowsHide:true});
execFileSync(ffmpeg,['-y','-v','error','-ss','3','-i',video,'-frames:v','1',path.join(out,'poster.png')],{windowsHide:true});
await writeFile(path.join(out,'recording.json'),JSON.stringify({status:'passed',video,bytes:(await stat(video)).size,source,start,box,phases,errors},null,2));
console.log(video);
