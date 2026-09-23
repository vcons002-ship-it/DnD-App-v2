/** Verify the actual self-contained files shipped by the VTT client. */
import './validate-monsters.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'client/public/miniatures');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.status, 'reviewed_runtime_bundle', 'Only reviewed final models may ship.');
assert.deepEqual(manifest.models.map(model => model.id).sort(), ['druk', 'vanec', 'varis']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const verifyFile = entry => {
  assert.match(entry.url, /^\/miniatures\/[a-z0-9-]+\.(glb|json|png)$/);
  const bytes = readFileSync(path.join(directory, path.basename(entry.url)));
  assert.equal(bytes.length, entry.bytes, entry.url);
  assert.equal(digest(bytes), entry.sha256, entry.url);
  return bytes;
};
let triangles = 0;
let totalBytes = 0;
for (const model of manifest.models) {
  assert(!model.interimTestOnly, 'Replace the temporary E2E model before shipping.');
  assert.match(model.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(model.compression, 'EXT_meshopt_compression');
  const bytes = verifyFile(model);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'Run git lfs pull if an asset is a pointer.');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  if (model.baseTextureUrl) {
    const texture = manifest.files.find(file => file.url === model.baseTextureUrl);
    assert(texture, 'Missing base texture manifest entry.');
    assert.equal(texture.sha256, model.baseTextureSha256);
    const png = verifyFile(texture);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert(png.readUInt32BE(16) >= 1024 && png.readUInt32BE(20) >= 1024);
    assert(gltf.nodes.some(node => node.name === 'Druk_Base_Earthy_Stone_Moss_Top'));
  }
  assert(gltf.extensionsRequired?.includes('EXT_meshopt_compression'),
    'The runtime must declare its Meshopt decoder requirement.');
  assert(gltf.bufferViews.some(view => view.extensions?.EXT_meshopt_compression),
    'The advertised lossless delivery compression must exist in the GLB.');
  assert(gltf.buffers.every(buffer => !buffer.uri), 'Runtime GLBs must not load external buffers.');
  assert(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.equal(gltf.skins?.length ?? 0, 0);
  assert(model.baseDiameter > 0 && Number.isFinite(model.baseDiameter));
  assert.equal(model.baseCenter.length, 3);
  assert(model.baseCenter.every(Number.isFinite));
  let count = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    assert.notEqual(primitive.indices, undefined);
    count += gltf.accessors[primitive.indices].count / 3;
  }
  assert.equal(count, model.triangles);
  assert(count > 0);
  assert.equal(count, model.sourceTriangles, 'The approved full-detail geometry must be retained.');
  assert.equal(model.originalTextures, true, 'The approved texture resolution must be retained.');
  const binaryOffset = 20 + bytes.readUInt32LE(12) + 8;
  assert.equal(model.sourceImageHashes.length, gltf.images.length);
  gltf.images.forEach((image, index) => {
    const view = gltf.bufferViews[image.bufferView];
    const start = binaryOffset + (view.byteOffset ?? 0);
    assert.equal(digest(bytes.subarray(start, start + view.byteLength)), model.sourceImageHashes[index],
      'Embedded image bytes must match the full-resolution source.');
  });
  if (model.fxUrl) {
    const fxEntry = manifest.files.find(file => file.url === model.fxUrl);
    assert(fxEntry, 'Missing effect manifest.');
    const fx = JSON.parse(verifyFile(fxEntry));
    assert(gltf.animations.some(clip => clip.name === fx.geometry_clip));
    for (const name of Object.keys(fx.material_channels)) assert(gltf.materials.some(material => material.name === name), name);
  }
  triangles += count; totalBytes += bytes.length;
  console.log(`${model.id}: ${count.toLocaleString()} triangles, ${(bytes.length / 1e6).toFixed(2)} MB; SHA256 verified`);
}
for (const file of manifest.files) verifyFile(file);
console.log(`Runtime package verified: ${triangles.toLocaleString()} triangles, ${(totalBytes / 1e6).toFixed(2)} MB across three models.`);
