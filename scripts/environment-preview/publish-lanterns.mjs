import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]);
const slug='environment-waist-lanterns-20260927';
const destination=path.join('C:/Users/vcons/DnD-App-v2/server/uploads/previews',slug);
const url=`https://dnd.nic024i.app/uploads/previews/${slug}/`;
await mkdir(destination,{recursive:true});
const images=[['druk-waist-lantern','Druk with a small waist lantern'],['party-waist-lanterns','The party carrying lanterns'],['night-three-torches','Three placed torches'],['night-twelve-torches','Twelve placed torches'],['torches-overhead','Overhead view'],['waist-lantern-player-night','Player controls in the app']];
const files=['torches-and-lanterns.mp4','poster.png',...images.map(([n])=>n+'.png')];
for(const file of files)await copyFile(path.join(evidence,file),path.join(destination,file));
await cp(path.resolve('client/environment-dist'),path.join(destination,'lab'),{recursive:true});
await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Waist lanterns and placed torches</title>
<style>body{margin:0;background:#111714;color:#eee9dc;font:16px/1.5 system-ui}main{max-width:1140px;margin:auto;padding:22px 16px 60px}h1{font:500 clamp(28px,5vw,42px) Georgia;color:#e4d0a3}h2{font:500 24px Georgia}p{color:#bfc7be}a{color:#e2c993}video,img{display:block;width:100%;height:auto;border:1px solid #52604e;border-radius:9px;box-sizing:border-box}nav{display:flex;gap:15px;flex-wrap:wrap;margin:20px 0}.button{background:#31412d;border:1px solid #8e9167;padding:10px 16px;border-radius:6px;text-decoration:none}section{margin-top:28px}small{color:#9fae9e}</style>
<main><h1>Waist lanterns &amp; placed torches</h1><p>Night in the courtyard with mist at maximum strength and 10 feet high. Small lanterns hang at the front of the characters' waists, leaving their hands and weapons unchanged.</p>
<video id="demo" controls playsinline preload="metadata" poster="druk-waist-lantern.png"><source src="torches-and-lanterns.mp4" type="video/mp4"></video>
<nav><a class="button" href="lab/environment-test.html?torches=1">Try the interactive scene</a><a href="torches-and-lanterns.mp4">Open video directly</a><a href="#druk-waist-lantern">Lantern close-up</a></nav>
<p>The video compares three and twelve placed torches, optional visible torch models, carried lanterns, party movement, camera rotation and the overhead view.</p>
<p>DM: <strong>Maps &rarr; Environment &rarr; Place light on map</strong>, then <strong>Show 3D torch</strong> for each light. There is no placement count cap. Players use <strong>Lantern on/off</strong> next to their character controls; the DM can also toggle a selected token's lantern.</p>
<p><small>Development preview; the running campaign app has not been updated. Lighting remains decorative and respects existing fog visibility. Painted walls do not block it. Models and map artwork are the approved existing assets. Environment quality is local to each viewer.</small></p>
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
