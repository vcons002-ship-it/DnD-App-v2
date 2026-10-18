import type {Page} from './test';
import {spawnSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

/** True on a software WebGL renderer (SwiftShader, llvmpipe: CI containers,
 * headless servers). Frame-time budgets written for a real GPU don't hold
 * there; functional assertions still do. */
export async function softwareRenderer(page:Page):Promise<boolean>{
 return page.evaluate(()=>{
  const gl=document.createElement('canvas').getContext('webgl2')??document.createElement('canvas').getContext('webgl');if(!gl)return true;
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=String(info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
 });
}

/** A measured-time budget (frame deltas, reveal latency) that holds on a real
 * GPU, widened on a software renderer. Not a wait: see helpers/test.ts for those. */
export async function frameBudgetMs(page:Page,gpuMs:number,softwareFactor=8):Promise<number>{
 return (await softwareRenderer(page))?gpuMs*softwareFactor:gpuMs;
}

export type TestVideo={file:string;name:string;mimeType:string;ext:'.mp4'|'.webm';pattern:RegExp};
/** A short synthetic map video the running browser can decode. Playwright's
 * Chromium ships without H.264, so VP9 WebM is used there; the app accepts both. */
export async function createTestVideo(page:Page,options:{filter?:string;seconds?:number;prefix?:string}={}):Promise<TestVideo>{
 const h264=await page.evaluate(()=>document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"')!=='');
 const ext=h264?'.mp4':'.webm',file=path.join(mkdtempSync(path.join(tmpdir(),`${options.prefix??'map-video'}-`)),`map${ext}`);
 const codec=h264?['-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart']:['-c:v','libvpx-vp9','-pix_fmt','yuv420p','-b:v','400k','-deadline','realtime','-cpu-used','8'];
 const result=spawnSync(ffmpeg!,['-v','error','-f','lavfi','-i',options.filter??'testsrc2=size=640x360:rate=30','-t',String(options.seconds??3),...codec,'-y',file],{windowsHide:true});
 if(result.status!==0)throw Error(`ffmpeg failed: ${result.stderr}`);
 return {file,name:`map${ext}`,mimeType:h264?'video/mp4':'video/webm',ext,pattern:new RegExp(`\\${ext}$`)};
}
