import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { generateImageWithBackup } from '../ai/imageGateway.js';
import { reportAi } from '../ai/status.js';
import { AssetQueue, ProductionError } from './queue.js';
import { setAssetProductionListener } from './hooks.js';
import type { AssetJob, ProducedMiniature } from '../../../shared/assetProduction.js';

const scripts = fileURLToPath(new URL('../../tools/asset-production/', import.meta.url));
const root = path.join(config.dataDir, 'asset-production');
const python = process.env.ASSET_PYTHON || 'python';
const blender = process.env.ASSET_BLENDER || (process.platform === 'win32' ? 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' : 'blender');
const hunyuan = (process.env.HUNYUAN_URL || 'http://127.0.0.1:42003').replace(/\/$/, '');

/** Shell-free worker execution; output goes to the private job log, never DM chat. */
export async function runWorker(command: string, args: string[], log: string, timeoutMs = 90 * 60 * 1000) {
  const handle = await fs.open(log, 'a');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', handle.fd, handle.fd] });
      const timer = setTimeout(() => { child.kill(); reject(new ProductionError('The worker timed out. Queue paused; check that its previous job has stopped before retrying.', true)); }, timeoutMs);
      child.once('error', () => { clearTimeout(timer); reject(new ProductionError('A required worker could not start. Check Python and Blender paths, then retry.')); });
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new ProductionError('The 3D worker failed its generation or quality checks. Check the job log, then retry.')); });
    });
  } finally { await handle.close(); }
}

export async function produceAsset(job: AssetJob, progress: (stage: string) => void): Promise<ProducedMiniature> {
  const work = path.join(root, job.id), attempt = path.join(work, `attempt-${job.attempts}`);
  await fs.mkdir(attempt, { recursive: true });
  const log = path.join(attempt, 'worker.log');
  progress('Checking 3D worker');
  try {
    const response = await fetch(`${hunyuan}/config`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error();
  } catch { throw new ProductionError('Hunyuan is unavailable. Queue paused; start the local multi-view worker, retry, and resume. No cloud 3D backup is configured.', true); }
  // Check tools before consuming an image request or occupying the GPU.
  await runWorker(python, ['--version'], log, 10000);
  await runWorker(blender, ['--version'], log, 20000);
  const refs = path.join(work, 'references');
  await fs.mkdir(refs, { recursive: true });
  const views = ['front', 'back', 'left', 'right'] as const;
  const ready = await fs.access(path.join(refs, 'views.json')).then(() => true, () => false);
  if (!ready) {
    progress('Generating four reference views');
    const anatomy = job.family === 'owlbear'
      ? 'A wild owlbear: a bulky four-legged bear body with an owl head, beak, feathers and large claws. Animal anatomy, no clothing, armor or weapons.'
      : job.family === 'brown-bear'
      ? 'A realistic brown bear standing on all four paws, alert with its mouth open. Animal anatomy, no clothing, armor or weapons.'
      : 'Natural anatomy for this creature. Only humanoid weapon users carry simple equipment with weapons held ready; animals have no clothing or equipment.';
    const prompt = `A clean 2 by 2 orthographic character turnaround sheet of one ${job.family.replaceAll('-', ' ')} D&D miniature. ${anatomy} Exactly four equal square panels: top left front, top right back, bottom left left side, bottom right right side. Same creature, proportions, colors and ready pose in every panel. Full body and feet centered with generous white margin in each panel. Detailed painted miniature. Plain white background. No base, text, labels, borders or effects.`;
    const result = await generateImageWithBackup(prompt, { width: 2048, height: 2048, turnaround: true }, 'api');
    if ('error' in result) throw new ProductionError('Reference art generation failed after the image backup attempts. Check AI settings and retry.');
    const bytes = await fs.readFile(path.join(config.uploadsDir, path.basename(result.path)));
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 2048 || metadata.height < 2048 || metadata.width !== metadata.height) throw new ProductionError('The image service did not return a usable 2K square multi-view sheet. Retry with a high-resolution image model.');
    await fs.writeFile(path.join(refs, 'sheet.png'), await sharp(bytes).png().toBuffer());
    const width = Math.floor(metadata.width / 2), height = Math.floor(metadata.height / 2);
    const receipt: object[] = [];
    for (const [i, view] of views.entries()) {
      const png = await sharp(bytes).extract({ left: (i % 2) * width, top: Math.floor(i / 2) * height, width, height }).png().toBuffer();
      await fs.writeFile(path.join(refs, `${view}.png`), png);
      receipt.push({ view, width, height, sha256: createHash('sha256').update(png).digest('hex') });
    }
    await fs.writeFile(path.join(refs, 'views.json'), JSON.stringify({ prompt, source: result.path, views: receipt }, null, 2));
  }
  progress('Building textured multi-view model');
  const generation = path.join(attempt, 'generation');
  try {
    await runWorker(python, ['-X', 'utf8', path.join(scripts, 'generate_multiview_mesh.py'), '--base-url', hunyuan,
      ...views.flatMap(view => [`--${view}`, path.join(refs, `${view}.png`)]), '--output-dir', generation,
      '--steps', '50', '--guidance', '5.5', '--seed', '923300', '--octree-resolution', '512', '--num-chunks', '10000', '--remove-background'], log);
  } catch {
    throw new ProductionError('Hunyuan did not finish with a verified model. Queue paused; check its job status before retrying and resuming.', true);
  }
  const receipt = JSON.parse(await fs.readFile(path.join(generation, 'generation_receipt.json'), 'utf8'));
  if (!receipt.actual_multiview_model_verified || receipt.view_count !== 4) throw new ProductionError('The worker did not verify the four-view Hunyuan model. The asset was not published.');
  const texturedPath = receipt.artifacts.find((artifact: { result_index: number }) => artifact.result_index === 1)?.path;
  if (typeof texturedPath !== 'string' || path.dirname(path.resolve(texturedPath)) !== path.resolve(generation)) throw new ProductionError('The worker returned no textured model.');
  const textured = path.basename(texturedPath);
  progress('Reducing geometry and compressing textures');
  const reduced = path.join(attempt, 'reduced'), based = path.join(attempt, 'based');
  await runWorker(process.execPath, [path.join(scripts, 'reduce.mjs'), path.join(generation, textured), reduced], log);
  progress('Fitting base and validating model');
  await runWorker(blender, ['--background', '--python', path.join(scripts, 'prepare_base.py'), '--', path.join(reduced, 'model.glb'), based, job.family, '1.6'], log);
  const output = path.join(attempt, 'model.glb');
  await runWorker(process.execPath, [path.join(scripts, 'package.mjs'), path.join(reduced, 'model.glb'), path.join(based, `${job.family}-board-source.glb`), output, job.family], log);
  const model = JSON.parse(await fs.readFile(path.join(attempt, 'model.json'), 'utf8')) as ProducedMiniature;
  const filename = `${job.family}-${model.sha256.slice(0, 16)}.glb`;
  const directory = path.join(config.uploadsDir, 'miniatures');
  await fs.mkdir(directory, { recursive: true });
  await fs.copyFile(output, path.join(directory, `${filename}.pending`));
  await fs.rename(path.join(directory, `${filename}.pending`), path.join(directory, filename));
  return { ...model, url: `/uploads/miniatures/${filename}` };
}

let queue: AssetQueue | undefined;
export function assetQueue() { return queue ??= new AssetQueue(path.join(root, 'queue.json'), produceAsset, reportAi); }
export function startAssetProduction() {
  const worker = assetQueue();
  setAssetProductionListener(creature => { worker.enqueue(creature); });
  worker.start();
}
