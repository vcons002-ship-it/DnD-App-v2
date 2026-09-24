/** Validate the reduced, self-contained monster models before every client build. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/miniatures/monsters');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, 1);
const familySource = readFileSync(path.resolve(directory, '../../../../shared/monsterAppearance.ts'), 'utf8');
const declaredFamilies = [...familySource.match(/MONSTER_MODEL_TYPES = \[([\s\S]*?)\] as const/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.deepEqual(manifest.models.map(m => m.id).sort(), declaredFamilies.sort(), 'Every selectable family must have a packaged asset');
const variantDeclaration = familySource.match(/MONSTER_VARIANTS = \{([\s\S]*?)\} as const/)[1];
const declaredVariants = [...variantDeclaration.matchAll(/\[([^\]]+)\]/g)].flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].slice(1).map(v => v[1]));
assert.deepEqual((manifest.variants ?? []).map(m => m.id).sort(), declaredVariants.sort(), 'Every selectable variant must have a packaged asset');
for (const model of [...manifest.models, ...(manifest.variants ?? [])]) {
  assert.equal(model.url, `/miniatures/monsters/${model.id}.glb`);
  const bytes = readFileSync(path.join(directory, `${model.id}.glb`));
  assert.equal(bytes.length, model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert(gltf.buffers.every(buffer => !buffer.uri));
  assert(gltf.images.every(image => image.bufferView !== undefined && !image.uri && image.mimeType === 'image/jpeg'));
  for (const accessor of gltf.accessors) {
    const view = gltf.bufferViews[accessor.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    assert(view && components && componentBytes, 'Unsupported monster accessor');
    const elementBytes = components * componentBytes;
    const end = (accessor.byteOffset ?? 0) + Math.max(0, accessor.count - 1) * (view.byteStride ?? elementBytes) + elementBytes;
    assert(end <= view.byteLength, `${model.id}: accessor extends beyond its shared buffer view`);
  }
  assert.equal(gltf.animations?.length ?? 0, 0);
  assert.equal(gltf.skins?.length ?? 0, 0);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    assert.notEqual(primitive.indices, undefined);
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.equal(triangles, model.triangles);
  assert(triangles >= 764 && triangles <= 40_764, 'Error-bounded reduced body plus fitted base');
  assert.equal(model.policy, 'monster-reduction-v1');
  assert.match(model.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(model.baseDiameter, ['dragon', 'two-headed-dragon', 'treant', 'troll', 'stone-golem', 'werebear'].includes(model.id) ? .96 : 1);
  assert.deepEqual(model.baseCenter, [0, 0, 0]);
  console.log(`${model.id}: ${triangles.toLocaleString()} triangles, ${(bytes.length / 1e6).toFixed(2)} MB; SHA256 verified`);
}
