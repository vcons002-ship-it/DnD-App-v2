import {build} from 'vite';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const client=path.join(repo,'client'),out=path.join(client,'environment-dist');
await build({root:client,configFile:path.join(client,'vite.environment-preview.config.ts'),build:{rollupOptions:{input:path.join(client,'environment-test.html')}}});
const player=JSON.parse(await readFile(path.join(client,'public/miniatures/manifest.json'),'utf8'));
const monsters=JSON.parse(await readFile(path.join(client,'public/miniatures/monsters/manifest.json'),'utf8'));
const ids=['druk','varis','vanec','cultist-fanatic','goblin','goblin-helmet','wolf'];
const definitions=[...player.models,...monsters.models,...monsters.variants].filter(m=>ids.includes(m.id));
if(definitions.length!==ids.length)throw Error('Missing preview miniature definition');
const files=new Set(definitions.flatMap(m=>[m.url,m.fxUrl,m.baseTextureUrl].filter(Boolean)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const assets=[];
for(const url of files){
  const source=path.join(client,'public',url),target=path.join(out,url);
  const bytes=await readFile(source);
  if(url.endsWith('.glb')&&bytes.readUInt32LE(0)!==0x46546c67)throw Error('Not a downloaded GLB: '+url);
  await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target);
  assets.push({url,bytes:bytes.length,sha256:hash(bytes)});
}
const mapPath=path.join(repo,'assets/environment-preview/courtyard.png');
const map=await readFile(mapPath);
if(hash(map)!=='b6f47c1f0917ced9a691113b5513ed3e42a955e30ff40f0aed5920e90fda524d')throw Error('Courtyard source changed');
await copyFile(mapPath,path.join(out,'courtyard.png'));
const dungeonPath=path.join(repo,'assets/environment-preview/dungeon.png'),dungeon=await readFile(dungeonPath);
const dungeonSource=JSON.parse(await readFile(path.join(repo,'assets/environment-preview/dungeon-source.json'),'utf8'));
if(hash(dungeon)!==dungeonSource.sha256)throw Error('Dungeon source changed');
await copyFile(dungeonPath,path.join(out,'dungeon.png'));
await writeFile(path.join(out,'asset-receipt.json'),JSON.stringify({dungeon:dungeonSource,map:{width:1216,height:832,bytes:map.length,sha256:hash(map)},assets},null,2)+'\n');
console.log('Environment preview packaged: '+out);

if(process.argv.includes('--vision')){
  await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./environment-test.html?vision=1"><title>Interactive dungeon preview</title></head><body style="background:#111714;color:#e7e5d9;font:18px system-ui;padding:24px"><a style="color:#e1c884" href="./environment-test.html?vision=1">Open interactive dungeon preview</a></body></html>`);
}
