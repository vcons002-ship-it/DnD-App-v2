import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { generateImageWithBackup,generateApiImage } from '../ai/imageGateway.js';
import { reportAi } from '../ai/status.js';
import { AssetQueue, ProductionError, SourceArtApprovalRequired } from './queue.js';
import {referenceArtPrompt,productionTargetHeight} from './referencePrompt.js';
import { setAssetProductionListener } from './hooks.js';
import type { AssetJob, ProducedMiniature } from '../../../shared/assetProduction.js';
import {runHybridPipeline} from './hybrid.js';
import {wireCharacterAssets} from './heroTokens.js';

const scripts = fileURLToPath(new URL('../../tools/asset-production/', import.meta.url));
const root = path.join(config.dataDir, 'asset-production');
const python = process.env.ASSET_PYTHON || 'python';
const blender = process.env.ASSET_BLENDER || (process.platform === 'win32' ? 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' : 'blender');

/** Shell-free worker execution; output goes to the private job log, never DM chat. */
export async function runWorker(command: string, args: string[], log: string, timeoutMs = 90 * 60 * 1000,signal?:AbortSignal,finishRemote=false) {
  signal?.throwIfAborted();
  const handle = await fs.open(log, 'a');
  try {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', handle.fd, handle.fd] });
      // Hunyuan runs remotely inside a GPU thread: killing its HTTP client does
      // not stop that thread. Wait for its completion before freeing the queue.
      const abort=()=>{if(!finishRemote)child.kill();};signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      const timer = setTimeout(() => { child.kill(); reject(new ProductionError('The worker timed out. Queue paused; check that its previous job has stopped before retrying.', true)); }, timeoutMs);
      child.once('error', () => { cleanup(); reject(new ProductionError('A required worker could not start. Check Python and Blender paths, then retry.')); });
      child.once('close', code => { cleanup(); signal?.aborted?reject(signal.reason):code === 0 ? resolve() : reject(new ProductionError('The 3D worker failed its generation or quality checks. Check the job log, then retry.')); });
    });
  } finally { await handle.close(); }
}

export async function produceAsset(job: AssetJob, progress: (stage: string) => void, referenceArt?:(url:string)=>void,signal?:AbortSignal): Promise<ProducedMiniature> {
  signal?.throwIfAborted();
  const work = path.join(root, job.id), attempt = path.join(work, `attempt-${job.attempts}`);
  await fs.mkdir(attempt, { recursive: true });
  const log = path.join(attempt, 'worker.log');
  const refs = path.join(work, `references-v${job.referenceRevision??1}`);
  await fs.mkdir(refs, { recursive: true });
  const views = ['front', 'back', 'left', 'right'] as const;
  const ready = await fs.access(path.join(refs, 'views.json')).then(() => true, () => false);
  if(!ready&&job.refreshView&&job.referenceSourceRevision){
    progress(`Refreshing ${job.refreshView} reference view`);
    const previous=path.join(work,`references-v${job.referenceSourceRevision}`);
    const source=await fs.readFile(path.join(previous,'sheet.png'));
    const panelSize=(await sharp(path.join(previous,'front.png')).metadata()).width??1024;
    const prompt=`Create only the ${job.refreshView} orthographic full-body view of the same subject in this reference sheet. Battle-ready stance. Keep the other views' proportions, equipment, colors and pose consistent. ${job.artBrief??''} Plain white background, neutral lighting. One view only, no text or borders.`;
    const result=await generateApiImage(prompt,{width:2048,height:2048},[{mimeType:'image/png',data:source.toString('base64')}],signal);
    signal?.throwIfAborted();
    if('error' in result)throw new ProductionError('The image API could not refresh this view. The existing token is kept; retry or regenerate source art.');
    const image=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path)));
    const panels=await Promise.all(views.map(async view=>view===job.refreshView?sharp(image).resize(panelSize,panelSize,{fit:'contain',background:'#ffffff'}).png().toBuffer():fs.readFile(path.join(previous,`${view}.png`))));
    for(const [i,view]of views.entries())await fs.writeFile(path.join(refs,`${view}.png`),panels[i]);
    await sharp({create:{width:panelSize*2,height:panelSize*2,channels:3,background:'#ffffff'}}).composite(panels.map((input,i)=>({input,left:(i%2)*panelSize,top:Math.floor(i/2)*panelSize}))).png().toFile(path.join(refs,'sheet.png'));
    await fs.writeFile(path.join(refs,'views.json'),JSON.stringify({prompt,refreshedView:job.refreshView,sourceRevision:job.referenceSourceRevision,views:views.map((view,i)=>({view,sha256:createHash('sha256').update(panels[i]).digest('hex')}))},null,2));
  }else if (!ready) {
    progress('Generating four reference views');
    const prompt = referenceArtPrompt(job);
    const result = await generateImageWithBackup(prompt, { width: 2048, height: 2048, turnaround: true }, 'api',signal);
    signal?.throwIfAborted();
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
  signal?.throwIfAborted();
  // Fingerprint actual named image bytes. Approval cannot carry to a changed view.
  const viewBytes=await Promise.all(views.map(view=>fs.readFile(path.join(refs,`${view}.png`))));
  const sha256=createHash('sha256').update(Buffer.concat(viewBytes.map(bytes=>Buffer.from(createHash('sha256').update(bytes).digest('hex'))))).digest('hex');
  const artDir=path.join(config.uploadsDir,'miniatures');await fs.mkdir(artDir,{recursive:true});
  const prefix=`${job.family}-refs-${sha256}`;
  const sheetName=`${prefix}-sheet.png`;
  await fs.copyFile(path.join(refs,'sheet.png'),path.join(artDir,sheetName));
  await Promise.all(views.map((view,i)=>fs.writeFile(path.join(artDir,`${prefix}-${view}.png`),viewBytes[i])));
  if(job.sourceArt?.sha256!==sha256||!job.sourceArt.approvedAt){
    throw new SourceArtApprovalRequired({sha256,sheetUrl:`/uploads/miniatures/${sheetName}`,views:views.map(view=>({view,url:`/uploads/miniatures/${prefix}-${view}.png`}))});
  }
  signal?.throwIfAborted();
  await runWorker(python, ['--version'], log, 10000,signal);
  await runWorker(blender, ['--version'], log, 20000,signal);
  if(job.sourceCharacterId){
    progress('Publishing character reference art');
    const front=await fs.readFile(path.join(refs,'front.png'));
    const filename=`${job.family}-front-${createHash('sha256').update(front).digest('hex').slice(0,12)}.png`;
    const artDir=path.join(config.uploadsDir,'miniatures');await fs.mkdir(artDir,{recursive:true});
    await fs.writeFile(path.join(artDir,filename),await sharp(front).resize({width:768,withoutEnlargement:true}).png().toBuffer());
    referenceArt?.(`/uploads/miniatures/${filename}`);
  }
  const hybrid=await runHybridPipeline(refs,work,sha256,progress,signal);
  progress('Correcting model shading and preparing 2K PBR textures');
  const corrected=path.join(attempt,'corrected.glb'),practical=path.join(attempt,'practical.glb');
  await runWorker(process.execPath,[path.join(scripts,'finish_normals.cjs'),hybrid.painted,corrected],log,undefined,signal);
  await runWorker(process.execPath,[path.join(scripts,'prepare_hybrid.mjs'),corrected,practical,'--crease-detail'],log,undefined,signal);
  progress('Reducing geometry and compressing textures');
  const reduced = path.join(attempt, 'reduced'), based = path.join(attempt, 'based');
  await runWorker(process.execPath, [path.join(scripts, 'reduce.mjs'), practical, reduced], log,undefined,signal);
  progress('Fitting base and validating model');
  await runWorker(blender, ['--background', '--python', path.join(scripts, 'prepare_base.py'), '--', path.join(reduced, 'model.glb'), based, job.family, String(productionTargetHeight(job))], log,undefined,signal);
  const output = path.join(attempt, 'model.glb');
  await runWorker(process.execPath, [path.join(scripts, 'package.mjs'), path.join(reduced, 'model.glb'), path.join(based, `${job.family}-board-source.glb`), output, job.family], log,undefined,signal);
  const model = JSON.parse(await fs.readFile(path.join(attempt, 'model.json'), 'utf8')) as ProducedMiniature;
  const filename = `${job.family}-${model.sha256.slice(0, 16)}.glb`;
  const directory = path.join(config.uploadsDir, 'miniatures');
  await fs.mkdir(directory, { recursive: true });
  await fs.copyFile(output, path.join(directory, `${filename}.pending`));
  signal?.throwIfAborted();
  await fs.rename(path.join(directory, `${filename}.pending`), path.join(directory, filename));
  return { ...model, url: `/uploads/miniatures/${filename}` };
}

let queue: AssetQueue | undefined;
export function assetQueue() {
  if(!queue){queue=new AssetQueue(path.join(root,'queue.json'),produceAsset,reportAi);wireCharacterAssets(queue);}
  return queue;
}
export function startAssetProduction() {
  const worker = assetQueue();
  setAssetProductionListener(creature => { worker.enqueue(creature); });
  worker.start();
}
