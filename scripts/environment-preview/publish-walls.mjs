// Run after the optional Playwright rectangle-wall walkthrough recording.
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

if(!process.argv[2])throw Error('Pass the walkthrough test output directory.');
const evidence=path.resolve(process.argv[2]);
const ffmpeg=process.env.FFMPEG_PATH || execFileSync(process.platform==='win32'?'where.exe':'which',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
const chapters=JSON.parse(await readFile(path.join(evidence,'wall-video-chapters.json'),'utf8'));
const output=path.join(evidence,'published');
await mkdir(output,{recursive:true});
let cursor=0;
const sections=[];
for(let i=0;i<chapters.length;i++){
  const c=chapters[i],duration=c.end-c.start;
  const file=path.join(output,`chapter-${i}.mp4`);
  execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-ss',String(c.start),'-i',c.file,'-t',String(duration),'-an','-vf','fps=30','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',file],{stdio:'inherit'});
  sections.push({label:c.label,time:cursor});
  cursor+=Math.round(duration*30)/30;
}
await writeFile(path.join(output,'concat.txt'),chapters.map((_,i)=>`file 'chapter-${i}.mp4'`).join('\n'));
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(output,'concat.txt'),'-c','copy','-movflags','+faststart',path.join(output,'wall-rectangles.mp4')],{stdio:'inherit'});
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-ss','8','-i',path.join(output,'wall-rectangles.mp4'),'-frames:v','1',path.join(output,'poster.png')],{stdio:'inherit'});
const images=[['rectangle-walls-dm','Trace the full thickness in one drag'],['rectangle-walls-light','Placed light passes through the doorway'],['rectangle-walls-druk-hidden','Druk: the goblin is hidden by the wall'],['rectangle-walls-varis','Varis: an independent view from the hall'],['rectangle-walls-druk-doorway','Druk: moving reveals the goblin'],['rectangle-walls-lantern','Heavy darkness with Druk\u2019s hip lantern']];
for(const [name] of images)await copyFile(path.join(evidence,name+'.png'),path.join(output,name+'.png'));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rectangle walls: light and personal vision</title>
<style>body{margin:0;background:#111518;color:#eee9df;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:20px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e3c78c}h2{font:500 24px Georgia}p{color:#c2c8ca}a{color:#ecd3a3}video,img{display:block;width:100%;height:auto;border:1px solid #716449;border-radius:8px;box-sizing:border-box}nav{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}button{font:inherit;background:#262c30;color:#eee4ce;border:1px solid #7f704e;padding:9px 13px;border-radius:6px;cursor:pointer;text-align:left}section{margin-top:28px}small{color:#a1adb3}</style>
<main><h1>Rectangle walls, light &amp; personal vision</h1><p>Recorded in the real app on a disposable dungeon map. Drag across a wall\u2019s length and thickness to block all four sides in one stroke. Druk and Varis each see from their own position.</p>
<video id="demo" controls playsinline preload="metadata" poster="poster.png"><source src="wall-rectangles.mp4" type="video/mp4"></video>
<p><a href="wall-rectangles.mp4">Open the video directly</a> \u00b7 ${Math.round(cursor)} seconds \u00b7 Captioned walkthrough</p>
<nav aria-label="Video chapters">${sections.map((s,i)=>`<button data-time="${s.time.toFixed(2)}">${i+1}. ${escape(s.label)}</button>`).join('')}</nav>
<p><strong>DM controls:</strong> Walls \u2192 Draw wall rectangles. Drag corner to corner and release. Escape cancels a draft; Erase or Undo removes an entire rectangle. Leave an opening where there is a doorway. Connected lines remain available for diagonal barriers.</p>
<p><small>Development preview; the campaign app has not been updated. Only the upper-left room is traced for this demonstration. Walls block light and sight, including darkvision; they do not stop token movement. Each map saves its own walls.</small></p>
${images.map(([n,title])=>`<section><h2>${escape(title)}</h2><a href="${n}.png"><img src="${n}.png" alt="${escape(title)}" loading="lazy"></a></section>`).join('')}
</main><script>const video=document.getElementById('demo');document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{video.currentTime=Number(button.dataset.time);video.play().catch(()=>{});video.scrollIntoView({behavior:'smooth',block:'center'});}));</script></html>`);

const slug='wall-rectangles-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const files=['index.html','wall-rectangles.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(output,file),path.join(destination,file));
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt={url:url+'index.html',seconds:cursor,chapters:sections,files:[]};
for(const file of files){
  const response=await fetch(url+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
  const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(destination,file));
  if(hash(remote)!==hash(local))throw Error(`${file}: published bytes differ`);
  receipt.files.push({file,bytes:local.length,sha256:hash(local)});
}
await writeFile(path.join(evidence,'publication.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
