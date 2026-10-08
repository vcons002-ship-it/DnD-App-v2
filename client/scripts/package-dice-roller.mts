import {mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Package the current built renderer, not copies of a previously published review.
const client=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination=process.argv[2];
if(!destination)throw new Error('Usage: package-dice-roller.mts <output folder>');
const out=resolve(destination);
mkdirSync(resolve(out,'assets'),{recursive:true});
mkdirSync(resolve(out,'art/dice-trays'),{recursive:true});
for(const file of readdirSync(resolve(client,'dist/assets'))){
  if(!/\.(js|css)$/.test(file))continue;
  const text=readFileSync(resolve(client,'dist/assets',file),'utf8')
    .replaceAll('/art/dice-trays/','./art/dice-trays/');
  writeFileSync(resolve(out,'assets',file),text);
}
for(const page of ['dice-comparison.html','dice-power.html']){
  const html=readFileSync(resolve(client,'dist',page),'utf8').replaceAll('="/assets/','="./assets/');
  writeFileSync(resolve(out,page),html);
  if(page==='dice-comparison.html')writeFileSync(resolve(out,'index.html'),html);
}
for(const theme of ['fighter','ranger','sorcerer','dm']){
  copyFileSync(resolve(client,`public/art/dice-trays/${theme}-v1.webp`),resolve(out,`art/dice-trays/${theme}-v1.webp`));
}
console.log(out);
