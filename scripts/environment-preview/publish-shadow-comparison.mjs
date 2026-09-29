// Publish the three build-only shadow presentations from the closeup app test.
// Each input is a real app recording using the same map, camera and light stages.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=path.resolve(process.argv[2]??'artifacts/shadow-comparison-v3');
const ffmpeg=process.env.FFMPEG_PATH??execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
const ffprobe=path.join(path.dirname(ffmpeg),'ffprobe.exe');
const output=path.join(root,'published');await mkdir(output,{recursive:true});
const styles=[['compact','A · Longer complete silhouette','The complete silhouette, with twice the previous maximum projection length. It follows each local light.'],['map','B · Environmental shape per light','The environmental-style silhouette points away from each torch or lantern, with a separate shadow per light and a consistent shape and length.'],['full','C · Full lighter shadow','The full torch or lantern projection, lighter than wall shadows. The carried lantern now emits light at six feet above the floor while its visible model stays at the hip.']];
const stages=[['off','Shadows off'],['on','One light · left'],['opposite','One light · right'],['lantern','Varis carries the light'],['lantern-tilted','Lantern · six-foot light'],['two','Two opposite lights'],['three','Three light angles'],['three-tilted','Three lights · 45°']];
const capture='miniature-battlefield-dungeon-torch-shadows-closeup-chromium';
const files=[],alignment={};
const run=(args,options={})=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error',...args],options);
// Match the actual caption pixels, not wall-clock times: browser recordings may
// duplicate frames under load and drift from the automation's elapsed clock.
const caption='crop=1000:44:300:110,scale=500:22';
const frameSize=500*22,rate=25,seconds=3;
for(const [style] of styles){
 const input=path.join(root,style,capture),video=path.join(input,'video.webm');
 // Playwright's VP8 recording contains full-range samples. Explicit input
 // range avoids a second contrast expansion while converting for matching/MP4.
 const frames=run(['-i',video,'-vf','scale=in_range=pc:out_range=pc,'+caption+',fps='+rate,'-pix_fmt','gray','-f','rawvideo','pipe:1'],{maxBuffer:100*1024*1024});
 const refs=stages.map(([name])=>run(['-i',path.join(input,name+'.png'),'-vf',caption,'-frames:v','1','-pix_fmt','gray','-f','rawvideo','pipe:1']));
 const matches=[];
 for(let frame=0;frame<frames.length/frameSize;frame++){
  let best=-1,error=Infinity;
  refs.forEach((ref,i)=>{let sum=0;for(let p=0;p<frameSize;p++)sum+=Math.abs(frames[frame*frameSize+p]-ref[p]);const value=sum/frameSize;if(value<error){error=value;best=i;}});
  matches.push({stage:best,error});
 }
 const starts=[];let from=0;
 stages.forEach((_,stage)=>{
  const index=matches.findIndex((m,i)=>i>=from&&m.stage===stage&&m.error<8&&matches.slice(i,i+5).every(n=>n.stage===stage&&n.error<8));
  if(index<0){const candidates=matches.map((m,i)=>({...m,time:i/rate})).filter(m=>m.stage===stage).sort((a,b)=>a.error-b.error).slice(0,3);throw Error(`No reliable caption match for ${style}/${stages[stage][0]}: ${JSON.stringify(candidates)}`);}
  starts.push(index/rate);from=index+Math.round(3*rate);
 });
 const duration=Number(execFileSync(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'}));
 alignment[style]={starts,duration};
 for(const [i,[name]] of stages.entries()){
  if((starts[i+1]??duration)-starts[i]<seconds+.08)throw Error(`Stage ${style}/${name} is too short; inspect capture`);
  run(['-y','-ss',String(starts[i]+.08),'-i',video,'-t',String(seconds),'-an','-vf','crop=900:800:350:100,scale=in_range=pc:out_range=tv,fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_range','tv',path.join(output,`${style}-${i}.mp4`)],{stdio:'inherit'});
  const image=`${style}-${name}.jpg`;
  run(['-y','-i',path.join(input,name+'.png'),'-vf','crop=900:800:350:100','-frames:v','1','-q:v','2',path.join(output,image)],{stdio:'inherit'});files.push(image);
 }
 const concat=path.join(output,`${style}-concat.txt`);await writeFile(concat,stages.map((_,i)=>`file '${style}-${i}.mp4'`).join('\n'));
 run(['-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',path.join(output,`${style}.mp4`)],{stdio:'inherit'});files.push(`${style}.mp4`);
}
await writeFile(path.join(output,'alignment.json'),JSON.stringify(alignment,null,2));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dungeon shadows · three-way comparison</title>
<style>*{box-sizing:border-box}body{margin:0;background:#10151a;color:#ece7dc;font:16px/1.5 system-ui}main{max-width:1100px;margin:auto;padding:20px 14px 50px}h1{font:500 clamp(27px,5vw,40px) Georgia;color:#edcc8d}h2{font:500 24px Georgia}p{color:#c5cbd0}a{color:#edcc8d}button,select{font:inherit;color:#eee6d3;background:#222b32;border:1px solid #75674c;border-radius:6px;padding:10px;cursor:pointer}button[aria-pressed=true]{background:#665230;border-color:#f1d296}nav{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}video{display:block;width:100%;max-width:900px;margin:auto;border:1px solid #75674c;border-radius:8px;background:#000}figure{margin:0;min-width:0}img{width:100%;display:block;border-radius:5px}figcaption{padding:8px 0;color:#f2d9a9}.stills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}small{color:#a5afb8}select{max-width:100%}@media(max-width:700px){.stills{grid-template-columns:1fr}nav button{font-size:14px}main{padding:12px 10px 35px}}</style>
<main><h1>Revised shadow comparison</h1><p>A has longer shadows. B now casts an environmental-style silhouette away from each light. C retains its full lighter projection. All three use six-foot carried light with the visible lantern still at the hip.</p><p>Same dungeon, figures and camera. Compare one torch, the carried lantern, two opposite torches and three angles. Torch flicker remains active throughout.</p>
<nav aria-label="Shadow approach">${styles.map(([id,title])=>`<button data-style="${id}" aria-pressed="${id==='full'}">${escape(title)}</button>`).join('')}</nav>
<p id="description">${escape(styles[2][2])}</p>
<video id="demo" controls playsinline preload="metadata" poster="full-lantern-tilted.jpg" src="full.mp4"></video>
<nav aria-label="Lighting setup">${stages.map(([,label],i)=>`<button data-time="${(i*seconds).toFixed(1)}">${escape(label)}</button>`).join('')}</nav>
<p>Switch approaches to compare the same point in the clip. <a id="direct" href="full.mp4">Open this video directly</a> · 24 seconds each.</p>
<h2>Still comparison</h2><p>Each light can cast its own shadow in all three approaches. Other lights fill the shadow from their own angles, so overlapping light makes individual shadows lighter.</p>
<label for="stage">Light setup: </label><select id="stage">${stages.map(([id,label])=>`<option value="${id}" ${id==='two'?'selected':''}>${escape(label)}</option>`).join('')}</select>
<div class="stills">${styles.map(([id,title])=>`<figure><figcaption>${escape(title)}</figcaption><a id="link-${id}" href="${id}-two.jpg"><img id="image-${id}" src="${id}-two.jpg" alt="${escape(title)} with two opposing lights" loading="lazy"></a></figure>`).join('')}</div>
<p>Carried lantern light passes through its owner. Other light sources can still cast that figure’s shadow. Walls block light fully; painted shadows in the map artwork are unchanged.</p>
<p><small>Recorded in a separate test app. This comparison does not update the live campaign. The two local-shadow approaches support up to four detailed shadow-casting lights at a time; additional lights still illuminate the map.</small></p></main>
<script>const styles=${JSON.stringify(styles)},stages=${JSON.stringify(stages)},video=document.getElementById('demo');let selected='full';document.querySelectorAll('[data-style]').forEach(button=>button.addEventListener('click',()=>{const style=button.dataset.style;if(style===selected)return;const time=video.currentTime,resume=!video.paused;selected=style;video.pause();video.src=style+'.mp4';video.poster=style+'-'+document.getElementById('stage').value+'.jpg';video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(time,video.duration-.1);if(resume)video.play().catch(()=>{});},{once:true});document.getElementById('direct').href=style+'.mp4';document.getElementById('description').textContent=styles.find(s=>s[0]===style)[2];document.querySelectorAll('[data-style]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{video.currentTime=Number(button.dataset.time);video.play().catch(()=>{});}));document.getElementById('stage').addEventListener('change',event=>{const value=event.target.value,label=stages.find(s=>s[0]===value)[1];styles.forEach(([id,title])=>{document.getElementById('image-'+id).src=id+'-'+value+'.jpg';document.getElementById('image-'+id).alt=title+' · '+label;document.getElementById('link-'+id).href=id+'-'+value+'.jpg';});});</script></html>`);files.push('index.html');
const slug='dungeon-shadow-comparison-v3-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);await mkdir(destination,{recursive:true});
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`,receipt={url:url+'index.html',files:[],alignment};
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const file of files){
 await copyFile(path.join(output,file),path.join(destination,file));
 const response=await fetch(url+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
 const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(destination,file));
 if(hash(remote)!==hash(local))throw Error(`${file}: published content mismatch`);
 receipt.files.push({file,bytes:local.length,sha256:hash(local)});
}
await writeFile(path.join(root,'publication.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({url:receipt.url,files:receipt.files.length,alignment},null,2));
