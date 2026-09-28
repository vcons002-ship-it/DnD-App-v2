import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory=new URL('../../client/public/miniatures/objects/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',directory),'utf8'));
assert.deepEqual(manifest.models.map(m=>m.id).sort(),['object-chest','object-trap']);
for(const m of manifest.models){
 const bytes=readFileSync(new URL(m.id.replace('object-','')+'.glb',directory));
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.equal(bytes.length,m.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256);
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 assert(gltf.buffers.every(b=>!b.uri));
 assert(gltf.images.every(i=>!i.uri&&i.bufferView!==undefined));
 assert(!gltf.nodes.some(n=>n.name?.endsWith('_round_base')));
 let triangles=0;
 for(const mesh of gltf.meshes)for(const p of mesh.primitives)triangles+=gltf.accessors[p.indices].count/3;
 assert.equal(triangles,m.triangles);assert(triangles>0&&triangles<=60000);
 assert(bytes.length<12*1024*1024);assert.equal(m.baseDiameter,1);
 assert.equal(m.sourceViewCount,4);assert.equal(m.multiviewTexture,true);
 console.log(`${m.id}: ${triangles} triangles, ${(bytes.length/1e6).toFixed(2)} MB; verified`);
}
