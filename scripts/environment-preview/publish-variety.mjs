import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]);
const slug='environment-variety-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=[['autumn-wind','Autumn wind'],['firefly-glade','Firefly glade'],['haunted-marsh','Haunted marsh'],['ashfall','Ashfall'],['sandstorm','Sandstorm'],['blizzard','Blizzard'],['marsh-lanterns','Hip lanterns through the marsh'],['autumn-overhead','Leaves from overhead'],['environment-variety-dm','Presets in the actual DM controls']];
const files=['environment-variety.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Six new battlefield atmospheres</title>
<style>body{margin:0;background:#101a19;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{font:500 24px Georgia}p{color:#bccbc6}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #536b60;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#294638;border:1px solid #8e9167;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#a1bcb0}.presets{display:flex;flex-wrap:wrap;gap:8px}.presets a{border:1px solid #485e53;padding:5px 10px;border-radius:20px;font-size:14px;text-decoration:none}</style>
<main><h1>Six new battlefield atmospheres</h1><p>The same courtyard, with falling autumn leaves, glowing fireflies, haunted green mist, ash and embers, blowing sand, and a blizzard. The video also follows the party with hip lanterns and compares rotated and overhead views.</p>
<video id="demo" controls playsinline preload="metadata" poster="poster.png"><source src="environment-variety.mp4" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?variety=1">Try the interactive scene</a><a href="environment-variety.mp4">Open video directly</a></nav>
<div class="presets">${images.slice(0,6).map(([n,title])=>`<a href="#${n}">${title}</a>`).join('')}</div>
<p>DM: <strong>Maps &rarr; Environment &rarr; Environment preset</strong>. All 15 presets remain editable. New <strong>Atmosphere particles</strong> and <strong>Mist color</strong> controls let you combine these effects with existing rain, snow, lighting and mist. Presets preserve placed lights and your shadow and wind directions.</p>
<p>Each viewer retains Auto / High / Low / Off quality. Low reduces particle counts, and reduced motion freezes environmental animation. Fireflies and embers glow visually without adding a light source for every particle.</p>
<p><small>Development preview; the running campaign app has not been updated. Original artwork is preserved. Weather and haze do not change combat or visibility rules; unrevealed map fog still hides effects. The interactive preview loads the full character models, so the video is the quicker option on mobile.</small></p>
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
