// Run after the optional Playwright rectangle-wall walkthrough recording.
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

if(!process.argv[2])throw Error('Pass the walkthrough test output directory.');
const evidence=path.resolve(process.argv[2]);
const ffmpeg=process.env.FFMPEG_PATH || execFileSync(process.platform==='win32'?'where.exe':'which',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
const ffprobe=path.join(path.dirname(ffmpeg),process.platform==='win32'?'ffprobe.exe':'ffprobe');
const chapters=JSON.parse(await readFile(path.join(evidence,'wall-video-chapters.json'),'utf8'));
const output=path.join(evidence,'published');
await mkdir(output,{recursive:true});
// Browser video frame duplication can drift from wall-clock timestamps. Locate
// the captions actually present in the recording before cutting its chapters.
const aligned=new Map();
for(const file of new Set(chapters.map(c=>c.file))){
  const group=chapters.filter(c=>c.file===file);
  const bytes=execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',file,'-vf','crop=560:32:520:116,scale=280:16,fps=25','-pix_fmt','gray','-f','rawvideo','pipe:1'],{maxBuffer:100*1024*1024});
  const size=280*16,changes=[];
  for(let frame=1;frame<bytes.length/size;frame++){
    let total=0;for(let i=0;i<size;i++)total+=Math.abs(bytes[frame*size+i]-bytes[(frame-1)*size+i]);
    if(total/size>28&&frame/25>Math.max(2,group[0].start*.4))changes.push(frame/25);
  }
  if(changes.length!==group.length)throw Error(`Caption alignment requires inspection for ${file}: found ${changes.length}, expected ${group.length}`);
  const timeAt=t=>{
    let i=group.findIndex(c=>c.start>t)-1;
    if(i<0)i=t<group[0].start?0:group.length-2;
    const ratio=(changes[i+1]-changes[i])/(group[i+1].start-group[i].start);
    return changes[i]+(t-group[i].start)*ratio;
  };
  group.forEach((c,i)=>aligned.set(c,{start:changes[i]+.04,end:timeAt(c.end)}));
}
let cursor=0;
const sections=[];
for(let i=0;i<chapters.length;i++){
  const c=chapters[i],timing=aligned.get(c),duration=timing.end-timing.start;
  const file=path.join(output,`chapter-${i}.mp4`);
  execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-ss',String(timing.start),'-i',c.file,'-t',String(duration),'-an','-vf','fps=30','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',file],{stdio:'inherit'});
  sections.push({label:c.label,time:cursor});
  cursor+=Number(execFileSync(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());
}
await writeFile(path.join(output,'concat.txt'),chapters.map((_,i)=>`file 'chapter-${i}.mp4'`).join('\n'));
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(output,'concat.txt'),'-c','copy','-movflags','+faststart',path.join(output,'dungeon-walkthrough.mp4')],{stdio:'inherit'});
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-ss','8','-i',path.join(output,'dungeon-walkthrough.mp4'),'-frames:v','1',path.join(output,'poster.png')],{stdio:'inherit'});
const images=[['rectangle-walls-dm','Walls follow the dungeon, with an open south doorway'],['rectangle-walls-light','DM overview: Druk inside and Varis in the hallway'],['rectangle-walls-varis','Varis: the room is still hidden'],['varis-approaching','Approaching the south doorway'],['varis-at-door','Druk becomes visible through the doorway'],['rectangle-walls-druk-doorway','The same moment from Druk\u2019s view'],['varis-inside-room','Entering reveals the far corner and goblin'],['varis-darkvision','Heavy darkness, with the lantern off'],['rectangle-walls-lantern','Varis enters with his hip lantern'],['shadow-torch-west','Torch to the west: shadows extend east'],['shadow-torch-east','Torch to the east: shadows extend west'],['varis-room-45','The same room in the 45-degree view']];
for(const [name] of images)await copyFile(path.join(evidence,name+'.png'),path.join(output,name+'.png'));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rectangle walls: light and personal vision</title>
<style>body{margin:0;background:#111518;color:#eee9df;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:20px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e3c78c}h2{font:500 24px Georgia}p{color:#c2c8ca}a{color:#ecd3a3}video,img{display:block;width:100%;height:auto;border:1px solid #716449;border-radius:8px;box-sizing:border-box}nav{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}button{font:inherit;background:#262c30;color:#eee4ce;border:1px solid #7f704e;padding:9px 13px;border-radius:6px;cursor:pointer;text-align:left}section{margin-top:28px}small{color:#a1adb3}</style>
<main><h1>Varis approaches Druk\u2019s room</h1><p>A longer walkthrough recorded in the real app. The camera stays overhead while Varis approaches the actual south doorway, sees Druk, enters the room, and backs out. Then compare darkvision, a moving hip lantern, and shadows from a placed torch.</p>
<video id="demo" controls playsinline preload="metadata" poster="poster.png"><source src="dungeon-walkthrough.mp4" type="video/mp4"></video>
<p><a href="dungeon-walkthrough.mp4">Open the video directly</a> \u00b7 ${Math.round(cursor)} seconds \u00b7 Captioned walkthrough</p>
<nav aria-label="Video chapters">${sections.map((s,i)=>`<button data-time="${s.time.toFixed(2)}">${i+1}. ${escape(s.label)}</button>`).join('')}</nav>
<p><strong>DM controls:</strong> Walls \u2192 Draw wall rectangles. Drag corner to corner and release. Escape cancels a draft; Erase or Undo removes an entire rectangle. Leave an opening where there is a doorway. Connected lines remain available for diagonal barriers.</p>
<p>Druk sees the room from inside. Varis initially sees only the hall. Approaching the opening reveals Druk first; the goblin in the far corner stays hidden until Varis enters. Each player\u2019s view updates independently. Door gaps in this walkthrough are treated as open.</p>
<p>Creature shadows now use the position and height of nearby torches and lanterns. The fixed directional shadow is disabled in dungeon lighting. Shadows painted into the map image itself remain part of that artwork.</p>
<p><small>Development preview; the campaign app has not been updated. Walls block light and sight, including darkvision; they do not stop token movement. Each map saves its own walls. Four nearby light sources can cast detailed creature shadows at a time; remaining lights still illuminate the scene.</small></p>
${images.map(([n,title])=>`<section><h2>${escape(title)}</h2><a href="${n}.png"><img src="${n}.png" alt="${escape(title)}" loading="lazy"></a></section>`).join('')}
</main><script>const video=document.getElementById('demo');document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{video.currentTime=Number(button.dataset.time);video.play().catch(()=>{});video.scrollIntoView({behavior:'smooth',block:'center'});}));</script></html>`);

const slug='dungeon-wall-walkthrough-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const files=['index.html','dungeon-walkthrough.mp4','poster.png',...images.map(([n])=>n+'.png')];
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
