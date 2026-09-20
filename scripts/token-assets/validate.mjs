/** Read-only verification of the selected miniature package. No dependencies. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const components = {
  5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'],
  5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
};
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function packagePath(root, relative) {
  assert.equal(typeof relative, 'string');
  assert(relative.startsWith('assets/miniatures/'), `Out-of-scope package path: ${relative}`);
  assert(!relative.includes('\\') && !relative.includes(':'));
  const result = path.resolve(root, relative);
  assert(result.startsWith(path.resolve(root, 'assets/miniatures') + path.sep));
  return result;
}

function packageInventory(root) {
  // Check the package's parent too: readdir/stat must never follow a linked
  // assets directory or package root before we inspect their contents.
  for (const relative of ['assets', 'assets/miniatures']) {
    const entry = lstatSync(path.join(root, relative));
    assert(!entry.isSymbolicLink(), `Symlink in package path: ${relative}`);
    assert(entry.isDirectory(), `Expected package directory: ${relative}`);
  }
  const files = new Set();
  const visit = (relative) => {
    for (const name of readdirSync(path.join(root, relative)).sort()) {
      const child = `${relative}/${name}`;
      const entry = lstatSync(path.join(root, child));
      assert(!entry.isSymbolicLink(), `Symlink in package: ${child}`);
      if (entry.isDirectory()) visit(child);
      else {
        assert(entry.isFile(), `Non-regular file in package: ${child}`);
        files.add(child);
      }
    }
  };
  visit('assets/miniatures');
  return files;
}

export function inspectGlb(bytes) {
  assert(!bytes.subarray(0, 50).toString().startsWith('version https://git-lfs'),
    'Found a Git LFS pointer instead of the model. Run git lfs pull.');
  assert(bytes.length >= 20, 'Truncated GLB header');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const chunks = new Map();
  for (let offset = 12; offset < bytes.length;) {
    assert(offset + 8 <= bytes.length, 'Truncated chunk header');
    const length = bytes.readUInt32LE(offset);
    const kind = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, 'Unaligned GLB chunk');
    assert(offset + 8 + length <= bytes.length, 'Truncated chunk');
    assert(!chunks.has(kind), 'Duplicate GLB chunk');
    chunks.set(kind, bytes.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  assert(chunks.has(0x4e4f534a) && chunks.has(0x004e4942), 'Missing JSON/BIN chunk');
  const document = JSON.parse(chunks.get(0x4e4f534a).toString('utf8').trim());
  const binary = chunks.get(0x004e4942);
  assert.equal(document.asset.version, '2.0');
  assert.equal(document.buffers.length, 1);
  assert(!document.buffers[0].uri, 'External buffer not packaged');
  assert(document.buffers[0].byteLength <= binary.length);
  assert.equal(document.animations?.length ?? 0, 0, 'Unexpected animation');
  assert.equal(document.skins?.length ?? 0, 0, 'Unexpected skeleton');
  assert.equal(document.extensionsRequired?.length ?? 0, 0, 'Unsupported required extension');
  for (const view of document.bufferViews ?? []) {
    assert.equal(view.buffer, 0);
    assert(Number.isSafeInteger(view.byteLength) && view.byteLength > 0);
    assert((view.byteOffset ?? 0) >= 0);
    assert((view.byteOffset ?? 0) + view.byteLength <= document.buffers[0].byteLength);
  }
  const cache = new Map();
  const accessor = (index) => {
    if (cache.has(index)) return cache.get(index);
    const a = document.accessors[index];
    assert(a && !a.sparse, 'Missing/sparse accessor');
    assert(!a.normalized, 'This source package uses unnormalized accessors');
    const view = document.bufferViews[a.bufferView];
    const component = components[a.componentType];
    const width = widths[a.type];
    assert(view && component && width);
    assert(Number.isSafeInteger(a.count) && a.count > 0);
    const [size, method] = component;
    const stride = view.byteStride ?? size * width;
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    assert(stride >= width * size);
    assert((a.byteOffset ?? 0) + (a.count - 1) * stride + width * size <= view.byteLength);
    const values = new Float64Array(a.count * width);
    for (let row = 0; row < a.count; row++) {
      for (let col = 0; col < width; col++) {
        const value = binary[method](start + row * stride + col * size);
        assert(Number.isFinite(value), 'Non-finite attribute');
        values[row * width + col] = value;
      }
    }
    const result = { values, count: a.count, width };
    cache.set(index, result);
    return result;
  };
  for (let index = 0; index < document.accessors.length; index++) accessor(index);
  const imageHashes = [];
  for (const image of document.images ?? []) {
    assert(!image.uri, 'External image not packaged');
    const view = document.bufferViews[image.bufferView];
    assert(view, 'Missing embedded image');
    const start = view.byteOffset ?? 0;
    const payload = binary.subarray(start, start + view.byteLength);
    if (image.mimeType === 'image/png') {
      assert.equal(payload.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    } else {
      assert.equal(image.mimeType, 'image/jpeg');
      assert.equal(payload.subarray(0, 3).toString('hex'), 'ffd8ff');
    }
    imageHashes.push(sha256(payload));
  }
  for (const texture of document.textures ?? []) {
    assert(document.images[texture.source], 'Invalid image reference');
  }
  let triangles = 0;
  let meshNodes = 0;
  for (const node of document.nodes ?? []) {
    assert.equal(node.skin, undefined, 'Unexpected skinned node');
    if (node.mesh === undefined) continue;
    meshNodes++;
    const mesh = document.meshes[node.mesh];
    assert(mesh && !mesh.weights);
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'Expected triangles');
      assert(!primitive.targets, 'Unexpected morph targets');
      assert(document.materials[primitive.material], 'Missing material');
      const positions = accessor(primitive.attributes.POSITION);
      const normals = accessor(primitive.attributes.NORMAL);
      assert.equal(positions.width, 3);
      assert.equal(normals.width, 3);
      assert.equal(normals.count, positions.count);
      for (let n = 0; n < normals.values.length; n += 3) {
        assert(Math.abs(Math.hypot(...normals.values.subarray(n, n + 3)) - 1) < .005, 'Non-unit normal');
      }
      for (const [name, index] of Object.entries(primitive.attributes)) {
        const attribute = accessor(index);
        assert.equal(attribute.count, positions.count, `Attribute count: ${name}`);
        if (name === 'COLOR_0') assert(attribute.values.every((v) => v >= 0 && v <= 1));
      }
      const indices = accessor(primitive.indices);
      assert.equal(indices.width, 1);
      assert.equal(indices.count % 3, 0);
      assert(indices.values.every((n) => Number.isSafeInteger(n) && n >= 0 && n < positions.count));
      triangles += indices.count / 3;
    }
  }
  return { triangles, meshNodes, images: imageHashes.length, animations: 0, skins: 0, imageHashes };
}

export function validatePackage(root = ROOT) {
  // Scan before opening the manifest or any declared asset so a symlink cannot
  // redirect even a read-only validation into an unrelated/private directory.
  const inventory = packageInventory(root);
  const manifest = JSON.parse(readFileSync(path.join(root, 'assets/miniatures/manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'accepted-review-assets-not-runtime-integrated');
  const allowed = new Set([
    'assets/miniatures/manifest.json',
    'assets/miniatures/README.md',
    ...manifest.files.map((file) => file.path),
  ]);
  for (const file of inventory) assert(allowed.has(file), `Unlisted package file: ${file}`);
  const paths = new Set();
  let bytes = 0;
  for (const file of manifest.files) {
    assert(!paths.has(file.path), `Duplicate manifest path ${file.path}`);
    paths.add(file.path);
    assert(inventory.has(file.path), `Manifest file absent from package inventory: ${file.path}`);
    const content = readFileSync(packagePath(root, file.path));
    assert.equal(content.length, file.bytes, `Size mismatch: ${file.path}`);
    assert.equal(sha256(content), file.sha256, `Hash mismatch: ${file.path}`);
    bytes += content.length;
  }
  assert.deepEqual(manifest.models.map((m) => m.id).sort(), ['druk', 'varis']);
  const models = manifest.models.map((model) => {
    assert(paths.has(model.path), 'Model absent from file inventory');
    const content = readFileSync(packagePath(root, model.path));
    assert.equal(sha256(content), model.sha256);
    assert.equal(content.length, model.bytes);
    const stats = inspectGlb(content);
    for (const key of ['triangles', 'meshNodes', 'images', 'animations', 'skins']) {
      assert.equal(stats[key], model[key], `${model.id}: ${key}`);
    }
    return { id: model.id, sha256: model.sha256, ...stats };
  });
  return { status: 'passed', files: paths.size, bytes, models };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(validatePackage(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
