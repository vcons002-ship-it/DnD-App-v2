/** Opt-in contract smoke: mocked image/Hunyuan responses, REAL model finishing,
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
    if (req.url === '/health') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocol:'dnd-hybrid-v1',running:false}));return;}
    if (req.method === 'POST') {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const data=JSON.parse(Buffer.concat(chunks));await fs.mkdir(data.output_dir,{recursive:true});
      let result;
      if(req.url==='/align'){
        const views={};for(const [i,v]of ['front','back','left','right'].entries()){
          const source=data.reference_paths[v],image=await fs.readFile(source);
          const pixel=await sharp(image).removeAlpha().extract({left:0,top:0,width:1,height:1}).raw().toBuffer();
          assert.equal('#'+pixel.toString('hex'),colors[i],'Named reference order');
          const output=path.join(data.output_dir,v+'.png');await fs.writeFile(output,image);views[v]={output,figureHeightPx:870};
        }
        result={policy:'hybrid-alignment-v1',views};
      }else if(req.url==='/shape'){
        assert.equal(data.steps,75);assert.equal(data.guidance,5.5);
        const output=path.join(data.output_dir,'shape.glb');await fs.writeFile(output,raw);submitted++;
        result={checkpoint:'tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv',conditioningShape:[1,4,3,512,512],settings:data,output};
      }else if(req.url==='/trial'){
        assert.equal(data.reference_paths.length,4);assert.equal(data.faces,120000);assert.equal(data.views,6);
        const output=path.join(data.output_dir,'paint.glb');await fs.writeFile(output,raw);
        // Synthetic GPU receipt only. The supplied GLB is finished for real below.
        result={encodedReferenceCount:4,actualOutputViewCount:6,triangles:120000,textureSizes:{a:[4096,4096],m:[4096,4096],r:[4096,4096]},output};
      }else{res.statusCode=404;res.end();return;}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
    }
    res.statusCode = 404; res.end();
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.HUNYUAN_SHAPE_URL = process.env.HUNYUAN_PAINT_URL = `http://127.0.0.1:${server.address().port}`;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    const request = JSON.parse(init.body);
    assert.equal(request.generationConfig.imageConfig.imageSize, '2K');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: sheet.toString('base64') } }] } }] }));
  }
  assert.ok(String(url).startsWith(process.env.HUNYUAN_SHAPE_URL), 'No external services during smoke');
  return fetchOriginal(url, init);
};
try {
  const { config } = await import('../../src/config.ts');
  config.comfyUrl = ''; config.geminiApiKey = 'fixture';
  const { startAssetProduction, assetQueue } = await import('../../src/assets/production.ts');
  startAssetProduction();
  const queue = assetQueue(); queue.enqueue({ name: 'Fixture creature', modelType: 'fixture-creature' });
  const deadline = Date.now() + 120000;
  while (!['awaiting_approval', 'failed'].includes(queue.snapshot().jobs[0].state) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  const review=queue.snapshot().jobs[0];
  assert.equal(review.state,'awaiting_approval');assert.equal(submitted,0,'3D must not start before source-art approval');
  assert.equal(review.sourceArt.views.length,4);assert.equal(queue.approveArt(review.id,review.sourceArt.sha256),true);
  while (!['ready', 'failed'].includes(queue.snapshot().jobs[0].state) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(queue.snapshot().jobs[0].state, 'ready', `See worker log under ${root}: ${queue.snapshot().jobs[0].error}`);
  assert.equal(submitted, 1);
  const readyJob=queue.snapshot().jobs[0];
  const finishing=JSON.parse(await fs.readFile(path.join(root,'asset-production',readyJob.id,`attempt-${readyJob.attempts}`,'practical.glb.receipt.json'),'utf8'));
  assert.equal(finishing.detailPolicy.id,'defined-crease-v2','Approved crease definition is part of app production');
  const model = queue.snapshot().models[0];
  const published = await fs.readFile(path.join(config.uploadsDir, 'miniatures', path.basename(model.url)));
  assert.equal(model.bytes, published.length);
  assert.equal(model.sha256, createHash('sha256').update(published).digest('hex'));
  assert.equal(published.readUInt32LE(0), 0x46546c67);
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'asset-production/queue.json'), 'utf8'));
  assert.equal(persisted.models[0].sha256, model.sha256);
  console.log(JSON.stringify({ result: 'passed', generation: 'mocked', workerTools: 'real finishing; synthetic GPU stage receipts', namedViews: 4, output: root, model }, null, 2));
} finally { globalThis.fetch = fetchOriginal; await new Promise(resolve => server.close(resolve)); }
