import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import type {Page} from '@playwright/test';

/** Direct CDP images -> AV1, held to their original wall-clock timestamps. */
export async function captureAv1(page:Page,file:string){
 const child=spawn('ffmpeg',['-hide_banner','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','60','-i','pipe:0','-an','-c:v','av1_nvenc','-preset','p4','-cq','18','-pix_fmt','yuv420p','-fps_mode','cfr','-movflags','+faststart',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let log='',latest:Buffer|undefined,start=0,written=0,blocked=false,finished=false;
 child.stderr.on('data',b=>log+=b.toString());
 const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const cdp=await page.context().newCDPSession(page),frames:{receivedAt:number;timestamp:number}[]=[];
 cdp.on('Page.screencastFrame',event=>{latest=Buffer.from(event.data,'base64');frames.push({receivedAt:Date.now(),timestamp:event.metadata.timestamp});void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1600,maxHeight:1000,everyNthFrame:1});
 const timer=setInterval(()=>{if(!latest||blocked)return;if(!start)start=performance.now();const due=Math.floor((performance.now()-start)/1000*60)+1;while(written<due&&!blocked){written++;if(!child.stdin.write(latest)){blocked=true;child.stdin.once('drain',()=>blocked=false);}}},4);
 return {file,frames,async stop(){
  if(finished)return;finished=true;clearInterval(timer);await cdp.send('Page.stopScreencast');child.stdin.end();
  const code=await Promise.race([exit,new Promise<null>(resolve=>setTimeout(()=>resolve(null),15000))]);
  if(code===null&&child.exitCode===null)child.kill();await fs.writeFile(file+'.log',log);
  if(code!==0)throw Error('AV1 encoder exit: '+code+' '+log.slice(-500));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size','-of','json',file],{encoding:'utf8'}));
  if(probe.streams[0].codec_name!=='av1')throw Error('Expected native AV1 capture');return {file,probe,frames};
 }};
}
