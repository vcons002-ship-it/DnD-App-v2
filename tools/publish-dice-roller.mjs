// Publish the built simulator without copying the whole app or modifying saves.
// Usage: npm run build; node tools/publish-dice-roller.mjs <preview-directory>
import {readFile,mkdir,copyFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw new Error('Pass the destination preview directory.');
const destination=path.resolve(process.argv[2]),dist=path.join(root,'client/dist');
if(destination===root||destination===dist)throw new Error('Use a separate preview directory.');
const pages=new Map();
for(const name of ['dice-comparison.html','dice-power.html','dice-models.html']){
 const html=await readFile(path.join(dist,name),'utf8');
 pages.set(name,html.replaceAll('/assets/','./assets/'));
}
const assets=new Set();
async function collect(source){
 // Vite imports and its preload dependency arrays both name hashed files.
 const files=[...source.matchAll(/["'](?:\.\/|\/assets\/)?([^"'\s/:]+\.(?:js|css|webp|png))["']/g)].map(match=>match[1]);
 for(const file of files){
  if(assets.has(file))continue;
  const sourcePath=path.join(dist,'assets',file);
  try{await stat(sourcePath);}catch{continue;}
  assets.add(file);
  if(/\.(js|css)$/.test(file))await collect(await readFile(sourcePath,'utf8'));
 }
}
for(const html of pages.values())await collect(html.replaceAll('./assets/','/assets/'));
if(!assets.size)throw new Error('No built simulator assets found. Build the client first.');
await mkdir(path.join(destination,'assets'),{recursive:true});
for(const file of assets)await copyFile(path.join(dist,'assets',file),path.join(destination,'assets',file));
await mkdir(path.join(destination,'art/dice-trays'),{recursive:true});
for(const theme of ['fighter','ranger','sorcerer','dm'])await copyFile(path.join(dist,`art/dice-trays/${theme}-v1.webp`),path.join(destination,`art/dice-trays/${theme}-v1.webp`));
// Publish entry pages last. Retain older hashed chunks for already-open pages.
for(const [name,html] of pages)await writeFile(path.join(destination,name),html);
await writeFile(path.join(destination,'index.html'),pages.get('dice-comparison.html'));
const manifest={builtAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),assets:[...assets].sort()};
await writeFile(path.join(destination,'simulator-build.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Published current dice roller and review pages with ${assets.size} asset chunks to ${destination}`);
