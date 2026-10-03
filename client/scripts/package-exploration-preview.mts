import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MINIATURES} from '../src/lib/miniatures.ts';

// Package a self-contained static preview. This never publishes or touches a save.
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(client,'exploration-dist');
const source=path.join(client,'src/exploration-preview');
await fs.copyFile(path.join(out,'exploration-test.html'),path.join(out,'index.html'));
await fs.copyFile(path.join(source,'courtyard.png'),path.join(out,'courtyard.png'));
const scene=JSON.parse(await fs.readFile(path.join(source,'scene.json'),'utf8'));
scene.imagePath='./courtyard.png';
await fs.writeFile(path.join(out,'scene.json'),JSON.stringify(scene));
for(const id of ['druk','goblin']){
 const model=MINIATURES[id];
 for(const url of [model.url,model.baseTextureUrl].filter(Boolean) as string[]){
  const dest=path.join(out,url.slice(1));
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.copyFile(path.join(client,'public',url.slice(1)),dest);
 }
}
console.log(`Interactive preview packaged in ${out}`);
