import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium,devices} from '@playwright/test';
const root=path.resolve(process.argv[2]??'artifacts/latency-improved-av1-20261028');
const publication=JSON.parse(fs.readFileSync(path.join(root,'publication.json'),'utf8'));
const base=new URL('.',publication.url),checked=[];
for(const f of publication.files){
 const url=new URL(f.file,base);
 if(f.file.includes('-av1')){const response=await fetch(url,{method:'HEAD'});assert(response.ok);assert.equal(Number(response.headers.get('content-length')),f.bytes);checked.push({file:f.file,head:response.status});continue;}
 const response=await fetch(url);assert(response.ok);const buffer=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(buffer).digest('hex'),f.sha256);
 checked.push({file:f.file,status:response.status,sha256:f.sha256});
 if(f.file.endsWith('.mp4')){const range=await fetch(url,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);await range.arrayBuffer();}
}
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,nb_frames:format=duration','-of','json',path.join(root,file)],{encoding:'utf8'}));
for(const c of publication.clips){const original=probe(c.source),copy=probe(c.file);assert.equal(original.streams[0].codec_name,'av1');assert.equal(copy.streams[0].codec_name,'h264');assert.equal(original.streams[0].nb_frames,copy.streams[0].nb_frames);assert(Math.abs(Number(original.format.duration)-Number(copy.format.duration))<1/60);}
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
const context=await browser.newContext({...devices['Pixel 7']}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(publication.url);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const c of publication.clips){
  await page.locator(`button[data-video=${c.view}]`).click();
  await page.waitForFunction(id=>{const v=document.getElementById(id);return v.readyState>=2&&!v.paused&&v.currentTime>5&&v.getVideoPlaybackQuality().totalVideoFrames>0},c.view);
  const state=await page.locator(`video#${c.view}`).evaluate(v=>({currentTime:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?.message??null,width:v.videoWidth,height:v.videoHeight}));
  assert.equal(state.error,null);checked.push({view:c.view,playback:state});await page.locator(`video#${c.view}`).evaluate(v=>v.pause());
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'public-mobile.png'),fullPage:true});
 fs.writeFileSync(path.join(root,'public-mobile-verified.json'),JSON.stringify({url:publication.url,checked,errors},null,2));console.log(JSON.stringify({url:publication.url,checked},null,2));
}finally{await browser.close();}
