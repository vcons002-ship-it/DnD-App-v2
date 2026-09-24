import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
const [reduced, based, output, family] = process.argv.slice(2);
if (!family) throw Error('Usage: package.mjs REDUCED BASED OUTPUT FAMILY');
const io = new NodeIO(), hash = data => createHash('sha256').update(data).digest('hex');
const master = await io.read(reduced), doc = await io.read(based);
const original = master.getRoot().listTextures(), textures = doc.getRoot().listTextures();
if (!original.length || original.length !== textures.length) throw Error('Texture count mismatch');
for (const [index, texture] of textures.entries()) {
  // Blender preserves material texture order for this static import/export path.
  texture.setImage(original[index].getImage()).setMimeType(original[index].getMimeType());
}
await io.write(output, doc);
const check = await io.read(output);
if (check.getRoot().listAnimations().length || check.getRoot().listSkins().length) throw Error('Static model required');
let triangles = 0;
for (const mesh of check.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const positions = primitive.getAttribute('POSITION'), indices = primitive.getIndices();
  if (!positions || !indices || primitive.getMode() !== 4) throw Error('Indexed triangles required');
  for (const coordinate of positions.getArray()) if (!Number.isFinite(coordinate)) throw Error('Nonfinite position');
  for (const index of indices.getArray()) if (index >= positions.getCount()) throw Error('Invalid index');
  triangles += indices.getCount() / 3;
}
if (triangles < 1 || triangles > 60000) throw Error('Model exceeds runtime triangle budget');
for (const [index, texture] of check.getRoot().listTextures().entries()) {
  if (hash(texture.getImage()) !== hash(original[index].getImage())) throw Error('Texture changed');
}
const data = await fs.readFile(output);
if (data.length > 12 * 1024 * 1024) throw Error('Model exceeds runtime byte budget');
await fs.writeFile(path.join(path.dirname(output), 'model.json'), JSON.stringify({
  id: family, baseDiameter: 1, baseCenter: [0, 0, 0], bytes: data.length, triangles,
  sha256: hash(data), policy: 'monster-reduction-v1', sourceViewCount: 4,
}, null, 2));
