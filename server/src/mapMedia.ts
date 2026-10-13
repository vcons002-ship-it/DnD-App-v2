import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const ffmpeg=createRequire(import.meta.url)('ffmpeg-static') as string|null;
import sharp from 'sharp';

export const MAP_VIDEO_BYTES=250*1024*1024;
export const MAP_VIDEO_EXT=new Set(['.mp4','.webm']);
export function isMapVideo(filename:string,mime:string){
 return MAP_VIDEO_EXT.has(path.extname(filename).toLowerCase())&&['video/mp4','video/webm'].includes(mime);
}
/** Decode actual content, not a client-supplied poster or dimensions. The original
 * video stays untouched; posters support AI analysis, fog memory and fallback. */
export async function mapVideoPoster(videoFile:string,posterFile:string){
 if(!ffmpeg)throw Error('Video processing is unavailable on this server.');
 await new Promise<void>((resolve,reject)=>{
  const proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-threads','2','-f',path.extname(videoFile).toLowerCase()==='.webm'?'matroska':'mov','-i',videoFile,'-map','0:v:0','-frames:v','1','-vf',"scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease",'-q:v','2','-y',posterFile],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let settled=false;
  const timer=setTimeout(()=>{proc.kill();finish(Error('Video preview timed out. Try an MP4 (H.264) or WebM map.'));},45000);
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
  proc.on('error',()=>finish(Error('Could not start video processing.')));
  proc.stderr.resume();proc.on('close',code=>finish(code===0?undefined:Error('Could not read that video. Use an MP4 (H.264) or WebM map.')));
 });
 try{const metadata=await sharp(posterFile).metadata();if(!metadata.width||!metadata.height)throw Error('No video picture.');return {width:metadata.width,height:metadata.height};}
 catch(error){await fs.unlink(posterFile).catch(()=>{});throw error;}
}
