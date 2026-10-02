import {spawn,execFileSync} from 'node:child_process';
import type {Page} from '@playwright/test';

/** Capture browser compositor frames directly into NVIDIA AV1, without the
 * Playwright software VP8 recorder's fixed 25 fps path. App clock stays live. */
export async function startAv1Capture(page:Page,output:string) {
  const ffmpeg=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
  const gpu=process.env.DND_CAPTURE_GPU??'0',fps=60;
  const encoder=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0','-an','-c:v','av1_nvenc','-gpu',gpu,'-preset','p5','-tune','hq','-cq','20','-b:v','0','-pix_fmt','yuv420p','-movflags','+faststart','-y',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let stderr='',failure:Error|undefined,latest:Buffer|undefined,started=0,written=0,blocked=false;
  encoder.stderr.on('data',data=>{stderr+=data.toString();});
  encoder.on('error',error=>{failure=error;});encoder.stdin.on('error',error=>{failure=error;});
  const ended=new Promise<number|null>(resolve=>encoder.on('close',resolve));
  const cdp=await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame',frame=>{
    latest=Buffer.from(frame.data,'base64');if(!started)started=Date.now();
    void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});
  });
  const flush=()=>{
    if(!latest||!started||blocked||failure)return;
    const due=Math.floor((Date.now()-started)*fps/1000);
    while(written<due){written++;if(!encoder.stdin.write(latest)){blocked=true;break;}}
  };
  encoder.stdin.on('drain',()=>{blocked=false;flush();});
  const tick=setInterval(flush,1000/fps);
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,everyNthFrame:1});
  return {async stop(){
    await cdp.send('Page.stopScreencast');clearInterval(tick);flush();encoder.stdin.end();
    const code=await ended;await cdp.detach();
    if(failure||code!==0)throw new Error(`AV1 capture failed: ${failure?.message??stderr}`);
    return {output,codec:'av1',encoder:'av1_nvenc',gpu,fps,frames:written,stderr};
  }};
}
