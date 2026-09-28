import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Publish only test screenshots; do not replace the running app or its database.
const evidence=path.resolve(process.argv[2]);
const destination='C:/Users/vcons/DnD-App-v2/server/uploads/previews/environment-app-controls-20260927';
const url='https://dnd.nic024i.app/uploads/previews/environment-app-controls-20260927/';
const images=[
  ['environment-player-quality.png','Player environment quality','Open the gear at the upper right → Interface → Environment quality. Choose Auto, High, Low or Off; this changes only your browser.'],
  ['environment-player-quality-panel.png','Player settings close-up','Environment quality is directly below UI scale.'],
  ['environment-player-quality-phone.png','Player quality at phone width','The same gear opens the quality setting on a narrow screen.'],
  ['environment-dm-controls.png','DM map controls','Maps → Environment. Saved shadow and mist settings belong to this map.'],
  ['environment-player-45.png','Player view at 45°','The player receives the map settings, with full-detail figures.'],
  ['environment-player-ruler.png','Measuring on the map','Tools stay above the effects. This check also adds a tile at negative map coordinates.'],
  ['environment-player-fog-45.png','Fog boundary at 45°','Hidden terrain stays black and hidden figures produce no shadows or wakes.'],
  ['environment-player-fog-overhead.png','Fog boundary overhead','The same visibility rules apply in the overhead view.'],
  ['environment-player-phone.png','Phone-width browser','Auto selects Low mist detail. This is viewport emulation, not a phone GPU benchmark.'],
];
await mkdir(destination,{recursive:true});
for(const [file] of images)await copyFile(path.join(evidence,'screenshots',file),path.join(destination,file));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved map environment controls</title>
<style>body{margin:0;background:#101317;color:#ece5d5;font:16px/1.55 system-ui,sans-serif}main{max-width:1140px;margin:auto;padding:24px 16px 60px}h1{font:600 clamp(25px,5vw,40px)/1.15 Georgia,serif;color:#e2c994}h2{font-size:20px;margin:0 0 8px}p{color:#c4c4c0}.note{padding:14px;border:1px solid #4b4538;border-radius:8px}section{margin-top:30px}img{display:block;width:100%;height:auto;border:1px solid #4b4538;border-radius:8px;box-sizing:border-box}a{color:#e3c887}small{color:#b8b8b5}section.phone img{max-width:390px}nav{display:flex;gap:14px;flex-wrap:wrap}</style>
<main><h1>Saved map environment controls</h1><p>Real DM and player views from the development app, using Druk, Varis and Vanec on the courtyard map.</p><p class="note">Effects are off by default. The DM saves the map's shadows and mist under <strong>Maps → Environment</strong>. Each player has an independent <strong>Environment quality</strong> option under Interface settings. These screenshots use a temporary test campaign; the live app and campaign have not been updated.</p>
<nav><a href="#player-quality">Player quality settings</a><a href="../environment-body-wake-20260927/index.html">Previous mist movement video</a><a href="#fog">Fog comparison</a></nav>
${images.map(([file,title,caption],i)=>`<section ${i===0?'id="player-quality"':file==='environment-player-fog-45.png'?'id="fog"':''} class="${/phone|panel/.test(file)?'phone':''}"><h2>${title}</h2><p>${caption}</p><a href="${file}"><img src="${file}" alt="${title}" loading="${i?'lazy':'eager'}"></a></section>`).join('')}
<p><small>Verified: shared saved settings, independent quality preferences, map imports/backups, movement wakes, negative tiles, measuring tools, and fog clipping. Raised scenery editing and painted-wall height are future work.</small></p></main></html>`;
await writeFile(path.join(destination,'index.html'),html);
const receipt={url:url+'index.html',files:[]};
for(const file of ['index.html',...images.map(([file])=>file)]){
  const response=await fetch(url+file);
  if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
  const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(destination,file));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  if(hash(remote)!==hash(local))throw new Error(`${file}: published content differs`);
  receipt.files.push({file,bytes:local.length,sha256:hash(local)});
}
await writeFile(path.join(evidence,'publication.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
