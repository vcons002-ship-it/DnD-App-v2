import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const input=path.resolve(process.argv[2]??'artifacts/shadow-c-motion/miniature-battlefield-dungeon-torch-shadows-closeup-chromium');
const ffmpeg=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
const run=(args,options={})=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error',...args],options);
const chapters=JSON.parse(await readFile(path.join(input,'motion-chapters.json'),'utf8'));
const output=path.join(input,'published');await mkdir(output,{recursive:true});
const caption='crop=1000:44:300:110,scale=500:22',size=500*22,rate=25,video=path.join(input,'video.webm');
const frames=run(['-i',video,'-vf','scale=in_range=pc:out_range=pc,'+caption+',fps=25','-pix_fmt','gray','-f','rawvideo','pipe:1'],{maxBuffer:100*1024*1024});
const refs=chapters.map(c=>run(['-i',path.join(input,c.name+'.png'),'-vf',caption,'-frames:v','1','-pix_fmt','gray','-f','rawvideo','pipe:1']));
let from=0;
for(const [stage,c] of chapters.entries()){
 let found=-1;
 for(let frame=from;frame<frames.length/size;frame++){
  let sum=0;for(let i=0;i<size;i++)sum+=Math.abs(frames[frame*size+i]-refs[stage][i]);
  if(sum/size<8){found=frame;break;}
 }
 if(found<0)throw Error('Caption not found: '+c.name);
 c.sourceTime=found/rate;from=found+rate*5;
}
const start=chapters[0].sourceTime+.08;
chapters.forEach(c=>c.time=Math.max(0,c.sourceTime-start));
run(['-y','-ss',String(start),'-i',video,'-an','-vf','crop=900:800:350:100,scale=in_range=pc:out_range=tv,fps=30','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-color_range','tv','-movflags','+faststart',path.join(output,'option-c-motion.mp4')],{stdio:'inherit'});
run(['-y','-i',path.join(input,'mixed.png'),'-vf','crop=900:800:350:100','-frames:v','1','-q:v','2',path.join(output,'poster.jpg')],{stdio:'inherit'});
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C: moving shadows and flickering lights</title><style>*{box-sizing:border-box}body{margin:0;background:#10151a;color:#eee8dc;font:16px/1.5 system-ui}main{max-width:940px;margin:auto;padding:18px 12px 40px}h1{font:500 clamp(26px,5vw,38px) Georgia;color:#e5c88e}p{color:#bdc7cc}video{display:block;width:100%;border:1px solid #736348;border-radius:7px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}button{padding:10px;background:#222b32;color:#eee5d4;border:1px solid #736348;border-radius:5px;font:inherit;cursor:pointer}a{color:#e5c88e}</style><main><h1>C: moving shadows and flickering lights</h1><p>Recorded in the test app with actual click-and-drag token movement. The hip lantern emits light from nine feet above the floor; placed fixtures are six feet high.</p><video id="demo" src="option-c-motion.mp4" poster="poster.jpg" controls playsinline preload="metadata"></video><nav>${chapters.map((c,i)=>`<button data-time="${c.time.toFixed(2)}">${i+1}. ${c.label.replace('C: ','')}</button>`).join('')}</nav><p><a href="option-c-motion.mp4">Open the video directly</a></p><p>The torch, placed lantern and carried lantern use the same brightness and reach flicker, with independent timing. The moving lantern passes through its owner; other figures cast shadows. Drag previews are temporary ghosts; after release, the real figure moves and its shadow follows.</p><p>Development preview only. The live campaign has not been updated.</p></main><script>const video=document.getElementById('demo');document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{video.currentTime=Number(b.dataset.time);video.play().catch(()=>{});});</script></html>`);
const slug='shadow-c-motion-20260928',destination='C:/Users/vcons/DnD-App-v2/server/uploads/previews/'+slug,url='https://dnd.nic024i.app/uploads/previews/'+slug+'/';
await mkdir(destination,{recursive:true});
for(const file of ['index.html','option-c-motion.mp4','poster.jpg']){
 await copyFile(path.join(output,file),path.join(destination,file));const r=await fetch(url+file);
 if(!r.ok||!Buffer.from(await r.arrayBuffer()).equals(await readFile(path.join(output,file))))throw Error('Published content mismatch: '+file);
}
await writeFile(path.join(input,'publication.json'),JSON.stringify({url:url+'index.html',chapters},null,2));
console.log(JSON.stringify({url:url+'index.html',chapters},null,2));
