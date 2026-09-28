import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]);
const slug='environment-weather-lighting-20260927';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=['day','dusk','rain','snow','night','dungeon','torches-off','torches-on','overhead'];
const files=['weather-lighting.mp4','torch-lighting.mp4','poster.png',...images.map(n=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weather and lighting</title>
<style>body{margin:0;background:#111714;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:24px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{text-transform:capitalize}p{color:#bfc7be}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #52604e;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#31412d;border:1px solid #8e9167;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#9fae9e}</style>
<main><h1>Weather and changing light</h1><p>The existing courtyard and approved miniatures, with rain, drifting snow, dusk, night and local dungeon lights. The original map image is unchanged.</p>
<video controls playsinline preload="metadata" poster="poster.png?v=2"><source src="weather-lighting.mp4?v=2" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?atmosphere=1">Open interactive test</a><a href="weather-lighting.mp4">Open video directly</a><a href="#dungeon">Dungeon screenshot</a></nav>
<p>In the app, the DM saves these settings under <strong>Maps → Environment</strong>. Each viewer has independent Auto / High / Low / Off quality controls. Local lights support position, color, radius, height, intensity and a gentle flicker.</p>
<section id="torch-video"><h2>Torch illumination on the figures</h2><p>Lights off/on, Druk moving through their reach, and a camera rotation. Brightness and distance flicker together.</p><video controls playsinline preload="metadata" poster="torches-on.png?v=2"><source src="torch-lighting.mp4?v=2" type="video/mp4"></video></section>
<p><small>This is a development preview. The running campaign app has not been updated. Lighting is decorative: fog controls visibility, and painted walls do not block light. Rain and snow do not accumulate or change combat rules. Three-dimensional scenery is deferred.</small></p>
${images.map(n=>`<section id="${n}"><h2>${n}</h2><a href="${n}.png"><img src="${n}.png" alt="Courtyard ${n} preview" loading="lazy"></a></section>`).join('')}
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
