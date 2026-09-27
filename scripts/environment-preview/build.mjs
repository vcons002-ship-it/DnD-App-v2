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
await writeFile(path.join(out,'asset-receipt.json'),JSON.stringify({map:{width:1216,height:832,bytes:map.length,sha256:hash(map)},assets},null,2)+'\n');
console.log('Environment preview packaged: '+out);
