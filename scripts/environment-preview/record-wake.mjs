import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

// Focused visual evidence only. Serve the standalone lab, never a campaign DB.
const out=path.resolve(process.argv[2]);await mkdir(out,{recursive:true});
const root=path.resolve('client/environment-dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
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
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:out,size:{width:1600,height:1000}}});
const page=await context.newPage(),errors=[],phases=[];
page.on('pageerror',e=>errors.push(e.message));
let began,ended;
try{
  await page.goto('http://127.0.0.1:4198/environment-test.html');
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.getAttribute('data-miniature-count')==='7');
  await page.getByRole('button',{name:'Close-up',exact:true}).click();await page.waitForTimeout(750);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(750);
  const caption=async text=>{
    phases.push({text,at:Date.now()});
    await page.evaluate(text=>{document.querySelector('h1').textContent=text;},text);
  };
  const reaction=page.getByRole('checkbox',{name:'React to movement & scenery'});
  await reaction.uncheck();began=Date.now();
  await caption('Reaction off: mist drifts past Druk');await page.waitForTimeout(1000);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.waitForTimeout(4700);
  await reaction.check();
  await caption('Reaction on: watch the mist behind his base');await page.waitForTimeout(1000);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.waitForTimeout(2200);
  const wakes=Number(await page.getByTestId('miniature-layer').getAttribute('data-mist-wakes'));
  assert(wakes>0&&wakes<=48);await page.screenshot({path:path.join(out,'wake-closeup.png')});
  await page.waitForTimeout(2500);await caption('The disturbed mist curls back into his path');await page.waitForTimeout(3800);
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]').getAttribute('data-mist-wakes')==='0');
  await page.getByRole('button',{name:'Overhead view',exact:true}).click();await page.waitForTimeout(750);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(750);
  await caption('Overhead: parting mist and a fading wake');
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.waitForTimeout(2200);
  await page.screenshot({path:path.join(out,'wake-overhead.png')});await page.waitForTimeout(6000);
  assert.deepEqual(errors,[]);ended=Date.now();
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
const source=await page.video().path();
const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',source],{encoding:'utf8'}));
const length=(ended-began)/1000,start=Math.max(0,duration-length);
const video=path.join(out,'mist-reaction.mp4');
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-ss',String(start),'-i',source,'-t',String(length),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-an','-movflags','+faststart',video],{windowsHide:true});
await writeFile(path.join(out,'wake-recording.json'),JSON.stringify({status:'passed',video,bytes:(await stat(video)).size,source,duration:length,start,phases,errors},null,2));
console.log(video);
