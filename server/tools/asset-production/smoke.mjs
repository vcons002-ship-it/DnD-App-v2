/** Opt-in contract smoke: mocked image/Hunyuan responses, REAL Python transport,
 * reduction, Blender, publication and durable queue. Never touches a campaign. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const input = process.argv[2];
if (!input) throw Error('Run with node --import tsx smoke.mjs RAW_TEXTURED_GLB');
const raw = await fs.readFile(input);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dnd-production-contract-'));
process.env.DATA_ROOT = root;
process.env.DM_PASSPHRASE = 'fixture-only';
const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
const panels = await Promise.all(colors.map(background => sharp({ create: { width: 1024, height: 1024, channels: 3, background } }).png().toBuffer()));
const sheet = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#ffffff' } }).composite(panels.map((input, i) => ({ input, left: (i % 2) * 1024, top: Math.floor(i / 2) * 1024 }))).png().toBuffer();
let submitted = 0;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/config') { res.setHeader('Content-Type', 'application/json'); res.end('{}'); return; }
    if (req.url === '/asset.glb') { res.end(raw); return; }
    if (req.method === 'POST' && req.url === '/gradio_api/call/generation_all') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const { data } = JSON.parse(Buffer.concat(chunks));
      assert.equal(data[0], null); assert.equal(data[1], null);
      for (let i = 0; i < 4; i++) {
        const image = Buffer.from(data[i + 2].url.split(',')[1], 'base64');
        const pixel = await sharp(image).removeAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
        assert.equal(`#${pixel.toString('hex')}`, colors[i], 'Named front/back/left/right view order');
      }
      assert.deepEqual(data.slice(6), [50, 5.5, 923300, 512, true, 10000, false]);
      submitted++; res.setHeader('Content-Type', 'application/json'); res.end('{"event_id":"fixture"}'); return;
    }
    if (req.url === '/gradio_api/call/generation_all/fixture') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(`event: complete\ndata: ${JSON.stringify([null, { url: `${process.env.HUNYUAN_URL}/asset.glb`, orig_name: 'textured_mesh.glb' }, null, { model: { shapegen: 'tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv' } }, 923300])}\n\n`); return;
    }
    res.statusCode = 404; res.end();
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.HUNYUAN_URL = `http://127.0.0.1:${server.address().port}`;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    const request = JSON.parse(init.body);
    assert.equal(request.generationConfig.imageConfig.imageSize, '2K');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: sheet.toString('base64') } }] } }] }));
  }
  assert.ok(String(url).startsWith(process.env.HUNYUAN_URL), 'No external services during smoke');
  return fetchOriginal(url, init);
};
try {
  const { config } = await import('../../src/config.ts');
  config.comfyUrl = ''; config.geminiApiKey = 'fixture';
  const { startAssetProduction, assetQueue } = await import('../../src/assets/production.ts');
  startAssetProduction();
  const queue = assetQueue(); queue.enqueue({ name: 'Fixture creature', modelType: 'fixture-creature' });
  const deadline = Date.now() + 120000;
  while (!['ready', 'failed'].includes(queue.snapshot().jobs[0].state) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(queue.snapshot().jobs[0].state, 'ready', `See worker log under ${root}: ${queue.snapshot().jobs[0].error}`);
  assert.equal(submitted, 1);
  const model = queue.snapshot().models[0];
  const published = await fs.readFile(path.join(config.uploadsDir, 'miniatures', path.basename(model.url)));
  assert.equal(model.bytes, published.length);
  assert.equal(model.sha256, createHash('sha256').update(published).digest('hex'));
  assert.equal(published.readUInt32LE(0), 0x46546c67);
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'asset-production/queue.json'), 'utf8'));
  assert.equal(persisted.models[0].sha256, model.sha256);
  console.log(JSON.stringify({ result: 'passed', generation: 'mocked', workerTools: 'real', namedViews: 4, output: root, model }, null, 2));
} finally { globalThis.fetch = fetchOriginal; await new Promise(resolve => server.close(resolve)); }
