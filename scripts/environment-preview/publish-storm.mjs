import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]);
const slug='environment-rainstorm-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=[['clear-day','Clear day'],['light-rain','Light rain'],['rainstorm','Rainstorm'],['storm-lightning','Cloud lightning illuminates the map and figures'],['storm-party','Hip lanterns in the rain'],['storm-overhead','Overhead storm view'],['environment-presets-dm','Presets in the actual DM controls']];
const files=['storm-environment.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rainstorm and environment presets</title>
<style>body{margin:0;background:#101720;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{font:500 24px Georgia}p{color:#bcc7d0}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #536371;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#293f51;border:1px solid #8e9167;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#a1afbc}.presets{display:flex;flex-wrap:wrap;gap:8px}.presets span{border:1px solid #485969;padding:5px 10px;border-radius:20px;font-size:14px}</style>
<main><h1>Storm over the courtyard</h1><p>Clear skies give way to light rain and a storm: wind-driven rain, ground splashes, wet-stone highlights, drifting mist and occasional cloud lightning. Druk, Varis and Vanec carry their hip lanterns through it.</p>
<video id="demo" controls playsinline preload="metadata" poster="storm-party.png"><source src="storm-environment.mp4" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?storm=1">Try the interactive scene</a><a href="storm-environment.mp4">Open video directly</a></nav>
<h2>One-click presets</h2><div class="presets">${['Clear day','Golden dusk','Moonlit night','Light rain','Rainstorm','Snowfall','Misty moor','Dungeon','Deep dungeon'].map(s=>`<span>${s}</span>`).join('')}</div>
<p>DM: <strong>Maps &rarr; Environment &rarr; Environment preset</strong>. Choose a preset and adjust its controls afterward. Placed lights, shadow direction and wind direction are retained. The selected look changes to <strong>Custom settings</strong> when you tune its other values.</p>
<p>Wet Ground and Lightning Flashes can be adjusted separately. Reduced motion suppresses lightning flashes. The interactive scene includes all nine presets and keeps the original artwork.</p>
<p><small>Development preview; the running campaign app has not been updated. Fog remains authoritative. Wet highlights are a visual surface effect; they do not simulate water accumulation or reflect individual figures. No new 3D scenery or thunder audio is included.</small></p>
${images.map(([n,title])=>`<section id="${n}"><h2>${title}</h2><a href="${n}.png"><img src="${n}.png" alt="${title}" loading="lazy"></a></section>`).join('')}
</main></html>`);
const receipt={url:url+'index.html',files:[]};
for(const file of ['index.html','lab/environment-test.html',...files]){
  const response=await fetch(url+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
  const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(destination,file));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  if(hash(remote)!==hash(local))throw Error(`${file}: published bytes differ`);
  receipt.files.push({file,bytes:local.length,sha256:hash(local)});
}
await writeFile(path.join(evidence,'publication.json'),JSON.stringify(receipt,null,2));
console.log(receipt.url);
