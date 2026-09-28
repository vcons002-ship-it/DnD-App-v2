import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]),slug='environment-daylight-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
for(const file of ['before.png','after.png'])await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clear Day figure colors</title>
<style>body{margin:0;background:#101a19;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}p{color:#bccbc6}a{color:#e2c993}img{display:block;width:100%;height:auto;border:1px solid #536b60;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}button{font:inherit;color:#eee9dc;background:#182b22;border:1px solid #597561;padding:10px 16px;border-radius:6px;cursor:pointer}button[aria-pressed=true]{background:#476a43;border-color:#d1c48f}small{color:#a1bcb0}</style>
<main><h1>Clear Day: richer figure colors</h1><p>Lower daylight fill and reflections restore contrast in the figures' cloth, skin and armor. The map keeps its original colors. Flip between the same camera view below.</p>
<nav aria-label="Lighting comparison"><button aria-pressed="false" data-file="before.png">Previous lighting</button><button aria-pressed="true" data-file="after.png">Adjusted daylight</button></nav>
<img id="comparison" src="after.png" width="1142" height="752" alt="Adjusted daylight on the same seven figures and courtyard"><p id="caption" aria-live="polite">Adjusted daylight</p>
<nav><a href="lab/environment-test.html?storm=1">Try the updated interactive scene</a><a href="after.png">Open full-size image</a></nav>
<p><small>Development preview. No texture recoloring or map color filter was applied. The running campaign app and save are unchanged.</small></p></main>
<script>for(const button of document.querySelectorAll('button[data-file]'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('button[data-file]'))b.setAttribute('aria-pressed',String(b===button));const image=document.getElementById('comparison');image.src=button.dataset.file;image.alt=button.textContent+' on the same seven figures and courtyard';document.getElementById('caption').textContent=button.textContent;});</script></html>`);
const receipt={url:url+'index.html',files:[]};
for(const file of ['index.html','lab/environment-test.html','before.png','after.png']){
  const response=await fetch(url+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
  const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(destination,file));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  if(hash(remote)!==hash(local))throw Error(`${file}: published bytes differ`);
  receipt.files.push({file,bytes:local.length,sha256:hash(local)});
}
await writeFile(path.join(evidence,'publication.json'),JSON.stringify(receipt,null,2));console.log(receipt.url);
