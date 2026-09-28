import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]);
const slug='environment-dungeon-lanterns-20260927';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=[['dungeon-normal','Normal dungeon darkness'],['dungeon-heavy','Heavy darkness, same lantern brightness'],['hip-lantern-closeup','Lanterns on the side of the hip'],['dungeon-normal-movement','Moving through the dungeon'],['dungeon-heavy-movement','Moving in heavy darkness'],['dungeon-full','Full dungeon with occasional lanterns'],['dungeon-darkness-dm-controls','Darkness and lantern model controls in the app']];
const files=['dungeon-lanterns.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dungeon lanterns and darkness</title>
<style>body{margin:0;background:#111714;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{font:500 24px Georgia}p{color:#bfc7be}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #52604e;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#31412d;border:1px solid #8e9167;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#9fae9e}</style>
<main><h1>Dungeon lanterns &amp; darkness</h1><p>Druk, Varis and Vanec explore the Castle Basement with small lanterns at their hips. Light floor mist drifts through the rooms, with three occasional floor lanterns.</p>
<video id="demo" controls playsinline preload="metadata" poster="poster.png"><source src="dungeon-lanterns.mp4" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?dungeon=1">Try the interactive scene</a><a href="dungeon-lanterns.mp4">Open video directly</a><a href="#hip-lantern-closeup">Hip lantern close-up</a></nav>
<p>The video compares normal and heavy darkness from the same position, then follows the party moving through the corridor under each setting. Lantern brightness stays the same. Mist is 1.5 feet high at 8% density.</p>
<p>DM: <strong>Maps &rarr; Environment &rarr; Lighting &rarr; Heavy darkness</strong>. For a placed light, choose <strong>Model: Lantern</strong>; set its height to 0.5 feet for a floor lantern. Each light can also use a visible torch or an invisible light source.</p>
<p><small>Development preview; the running campaign app has not been updated. Darkness is visual and respects existing fog visibility. Painted walls do not block light. The map and character artwork are the existing assets, without model or image reduction.</small></p>
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
