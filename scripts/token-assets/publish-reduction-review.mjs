/** Publish only a self-contained review; never change the installed app or campaign. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source=path.resolve(process.argv[2],'review'),destination=path.resolve(process.argv[3]),url=process.argv[4];
assert(url&&url.startsWith('https://'),'Pass the public preview URL');
await fs.mkdir(destination,{recursive:false});
const files=(await fs.readdir(source)).filter(f=>/\.(html|js|json|glb|png)$/.test(f));
for(const file of files)await fs.copyFile(path.join(source,file),path.join(destination,file));
for(const file of files){
 const response=await fetch(new URL(file,url),{method:'HEAD',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,file+' publicly reachable');
 const expected=(await fs.stat(path.join(source,file))).size;
 if(response.headers.has('content-length'))assert.equal(Number(response.headers.get('content-length')),expected,file+' content length');
}
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const file of ['index.html','viewer-data.json','viewer.js']){
 const response=await fetch(new URL(file,url),{signal:AbortSignal.timeout(20000)});
 assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await fs.readFile(path.join(source,file))),file+' served bytes');
}
await fs.writeFile(path.join(path.dirname(source),'publication.json'),JSON.stringify({url:new URL('index.html',url).href,destination,files},null,2));
console.log(new URL('index.html',url).href);
