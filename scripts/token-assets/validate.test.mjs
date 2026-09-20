import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectGlb, packagePath, sha256, validatePackage } from './validate.mjs';

function triangleGlb(node = { mesh: 0 }) {
  const binary = Buffer.alloc(80);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  normals.forEach((value, index) => binary.writeFloatLE(value, 36 + index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 72 + index * 2));
  const document = {
    asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    materials: [{}],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [node], scenes: [{ nodes: [0] }], scene: 0,
  };
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const bytes = Buffer.alloc(28 + json.length + binary.length);
  bytes.write('glTF');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + json.length);
  bytes.writeUInt32LE(0x004e4942, 24 + json.length);
  binary.copy(bytes, 28 + json.length);
  return bytes;
}

function packageFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'dnd-token-validator-'));
  t.after(() => {
    // Delete only the exact disposable fixture allocated above.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert(path.basename(root).startsWith('dnd-token-validator-'));
    rmSync(root, { recursive: true, force: true });
  });
  const directory = path.join(root, 'assets/miniatures');
  mkdirSync(path.join(directory, 'models'), { recursive: true });
  const content = triangleGlb();
  const files = ['druk', 'varis'].map((id) => {
    const relative = `assets/miniatures/models/${id}.glb`;
    writeFileSync(path.join(root, relative), content);
    return { path: relative, bytes: content.length, sha256: sha256(content) };
  });
  const models = files.map((file, index) => ({
    ...file, id: ['druk', 'varis'][index],
    triangles: 1, meshNodes: 1, images: 0, animations: 0, skins: 0,
  }));
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, status: 'accepted-review-assets-not-runtime-integrated', files, models,
  }));
  writeFileSync(path.join(directory, 'README.md'), 'Fixture package documentation.');
  return { root, directory };
}

test('SHA256 has the expected stable value', () => {
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('only relative package paths are accepted', () => {
  for (const invalid of ['../secret', 'assets/miniatures/../../.env', 'C:\\secret', '/etc/passwd']) {
    assert.throws(() => packagePath(process.cwd(), invalid));
  }
  assert(packagePath(process.cwd(), 'assets/miniatures/models/druk.glb').endsWith('druk.glb'));
});
test('LFS pointers are diagnosed rather than mistaken for GLB', () => {
  assert.throws(() => inspectGlb(Buffer.from('version https://git-lfs.github.com/spec/v1\n')), /git lfs pull/);
});
test('truncated or unrelated files are rejected', () => {
  assert.throws(() => inspectGlb(Buffer.alloc(5)), /Truncated/);
  assert.throws(() => inspectGlb(Buffer.alloc(20)));
});

test('a valid static triangle passes but a zero-index skin is rejected', () => {
  const stats = inspectGlb(triangleGlb());
  assert.equal(stats.triangles, 1);
  assert.equal(stats.skins, 0);
  assert.throws(() => inspectGlb(triangleGlb({ mesh: 0, skin: 0 })), /Unexpected skinned node/);
});

test('complete inventory allows only declared assets and package metadata', (t) => {
  const { root } = packageFixture(t);
  const result = validatePackage(root);
  assert.equal(result.status, 'passed');
  assert.equal(result.files, 2);
});

test('an unlisted nested file is rejected', (t) => {
  const { root, directory } = packageFixture(t);
  const nested = path.join(directory, 'references/private');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'campaign.json'), '{}');
  assert.throws(() => validatePackage(root), /Unlisted package file: assets\/miniatures\/references\/private\/campaign\.json/);
});

test('a nested directory link is rejected before traversal', (t) => {
  const { root, directory } = packageFixture(t);
  const outside = path.join(root, 'outside');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'private.json'), '{}');
  symlinkSync(outside, path.join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validatePackage(root), /Symlink in package: assets\/miniatures\/linked/);
});

test('a linked package root is rejected before reading the manifest', (t) => {
  const { root, directory } = packageFixture(t);
  const outside = path.join(root, 'outside');
  renameSync(directory, outside);
  symlinkSync(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validatePackage(root), /Symlink in package path: assets\/miniatures/);
});
