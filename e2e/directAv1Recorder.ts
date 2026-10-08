import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
export async function startAv1Capture(page:Page,output:string){
 const args=['-hide_banner','-loglevel','info','-f','lavfi','-i','gfxcapture=window_title=Druk Direct AV1 Recording:max_framerate=60:capture_cursor=1:width=1920:height=1294:resize_mode=scale','-an','-c:v','av1_nvenc','-gpu','0','-preset','p5','-tune','hq','-rc','constqp','-qp','20','-fps_mode','vfr','-movflags','+faststart','-progress','pipe:1','-y',output];
 const proc=spawn('ffmpeg',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let log='',progress='';proc.stderr.on('data',d=>log+=d);proc.stdout.on('data',d=>progress+=d);
 const ended=new Promise<number|null>((resolve,reject)=>{proc.on('error',reject);proc.on('close',resolve)});
 // Let Graphics Capture attach and NVENC prepare before the attack button click.
 await page.waitForTimeout(1600);
 if(proc.exitCode!==null)throw Error('Direct capture failed: '+log);
 return {async stop(){
  proc.stdin.write('q');
  const timer=setTimeout(()=>proc.kill(),10000);
  const code=await ended;clearTimeout(timer);
  writeFileSync(output+'.capture.log',log+'\n'+progress);
  writeFileSync(output+'.capture.json',JSON.stringify({encoder:'NVIDIA NVENC AV1',gpu:0,capture:'Windows Graphics Capture',target:'Druk Direct AV1 Recording',maxFps:60,args,code},null,2));
  if(code!==0)throw Error('Direct AV1 capture failed: '+log);
  return {output,code,capture:'Windows Graphics Capture',encoder:'RTX 5090 NVENC AV1',progress:progress.slice(-1200)};
 }};
}
