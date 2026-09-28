import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]),slug='environment-wind-color-20260928';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=[['clear-day','Clear day: original colors'],['cool-tint','Cool scene tint'],['warm-tint','Warm scene tint'],['rain-wind-0','Rain without wind'],['rain-wind-1','Rain at the previous maximum'],['rain-wind-3','Rain at 300% wind'],['wind-color-dm','The controls in the app']];
const files=['wind-color.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wind and scene color</title>
<style>body{margin:0;background:#101a19;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{font:500 24px Georgia}p{color:#bccbc6}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #536b60;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#294638;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#a1bcb0}</style>
<main><h1>Wind and scene color</h1><p>Compare original Clear Day colors, cool and warm custom tints, and rain at 0%, 100% and 300% wind. Wind changes rain's sideways travel and streak angle as well as moving snow, mist and atmosphere particles.</p>
<video controls playsinline preload="metadata" poster="poster.png"><source src="wind-color.mp4" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?storm=1">Try the controls</a><a href="wind-color.mp4">Open video directly</a></nav>
<p>DM: <strong>Maps &rarr; Environment</strong>. In Lighting, choose a <strong>Scene tint</strong>, adjust its strength, or <strong>Reset scene tint</strong>. The tint affects the map, figure lighting and mist. Clear Day resets tint to zero and uses the ordinary figure lighting. Weather now allows wind strength from 0% to 300%; 100% is the former maximum.</p>
<p><small>Development preview; the running campaign app and save are unchanged. The original artwork comparison found zero changed pixels in the unshadowed map test area. Fog masking, local quality and reduced motion still apply.</small></p>
${images.map(([n,title])=>`<section><h2>${title}</h2><a href="${n}.png"><img src="${n}.png" alt="${title}" loading="lazy"></a></section>`).join('')}
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
