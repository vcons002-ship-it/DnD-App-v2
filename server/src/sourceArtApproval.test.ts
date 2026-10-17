import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {AssetQueue,SourceArtApprovalRequired} from './assets/queue.js';
import {produceAsset} from './assets/production.js';
import {referenceArtPrompt,productionTargetHeight} from './assets/referencePrompt.js';
import {generateImageWithBackup} from './ai/imageGateway.js';
import {createSession,createCharacter,getCharacter} from './sessions.js';
import {craftHeroToken,wireCharacterAssets} from './assets/heroTokens.js';
import type {AssetJob,ProducedMiniature,SourceArt} from '../../shared/assetProduction.js';

vi.mock('./ai/imageGateway.js',()=>({generateImageWithBackup:vi.fn()}));
let directory:string;
const art:SourceArt={sha256:'a'.repeat(64),sheetUrl:'/uploads/miniatures/review-sheet.png',views:['front','back','left','right'].map(view=>({view:view as 'front'|'back'|'left'|'right',url:`/uploads/miniatures/${view}.png`}))};
const model=(id:string):ProducedMiniature=>({id,url:`/uploads/miniatures/${id}.glb`,baseDiameter:1.6,baseCenter:[0,0,0],bytes:1000,triangles:100,sha256:'test'});
beforeEach(async()=>{directory=await fs.mkdtemp(path.join(config.dataDir,'art-review-'));});
afterEach(async()=>{vi.unstubAllGlobals();vi.clearAllMocks();await fs.rm(directory,{recursive:true,force:true});});

it('generates and publishes all four review images but never contacts Hunyuan before approval; changed images revoke approval',async()=>{
  await fs.mkdir(config.uploadsDir,{recursive:true});
  const input=path.join(config.uploadsDir,`sheet-${path.basename(directory)}.png`);
  await sharp({create:{width:2048,height:2048,channels:3,background:'#aa8855'}}).png().toFile(input);
  vi.mocked(generateImageWithBackup).mockResolvedValue({path:`/uploads/${path.basename(input)}`});
  const fetcher=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal('fetch',fetcher);
  const job:AssetJob={id:path.basename(directory),family:'hero-review',subjectFamily:'elf',state:'running',stage:'',attempts:1,updatedAt:'',artBrief:'Held weapon: Longsword.'};
  let checkpoint:SourceArt|undefined;
  try{await produceAsset(job,vi.fn());}catch(e){expect(e).toBeInstanceOf(SourceArtApprovalRequired);checkpoint=(e as SourceArtApprovalRequired).art;}
  expect(checkpoint?.views.map(v=>v.view)).toEqual(['front','back','left','right']);
  expect(fetcher).not.toHaveBeenCalled();
  for(const url of [checkpoint!.sheetUrl,...checkpoint!.views.map(v=>v.url)])expect((await fs.stat(path.join(config.uploadsDir,'miniatures',path.basename(url)))).size).toBeGreaterThan(0);
  await expect(produceAsset({...job,attempts:2,sourceArt:{...checkpoint!,approvedAt:new Date().toISOString()}},vi.fn())).rejects.toThrow('Hunyuan is unavailable');
  expect(generateImageWithBackup).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);
  const reference=path.join(config.dataDir,'asset-production',job.id,'references-v1','left.png');
  await sharp({create:{width:1024,height:1024,channels:3,background:'#112233'}}).png().toFile(reference);
  await expect(produceAsset({...job,attempts:3,sourceArt:{...checkpoint!,approvedAt:'approved'}},vi.fn())).rejects.toBeInstanceOf(SourceArtApprovalRequired);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('persists approval checkpoints without blocking other jobs, rejects stale approval, and starts exactly once with the approved art',async()=>{
  const producer=vi.fn(async(job:AssetJob)=>{if(!job.sourceArt?.approvedAt)throw new SourceArtApprovalRequired({...art,sha256:job.family.padEnd(64,'a')});return model(job.family);});
  const file=path.join(directory,'queue.json'),q=new AssetQueue(file,producer);q.start();
  const a=q.enqueue({name:'Elephant'})!,b=q.enqueue({name:'Uncatalogued creature'})!;
  await vi.waitFor(()=>expect(q.snapshot().jobs.every(j=>j.state==='awaiting_approval')).toBe(true));
  expect(q.snapshot().paused).toBe(false);expect(producer).toHaveBeenCalledTimes(2);
  const resumed=new AssetQueue(file,producer);resumed.start();expect(producer).toHaveBeenCalledTimes(2);
  expect(resumed.approveArt(a.id,'wrong-revision')).toBe(false);expect(resumed.retry(a.id)).toBe(false);
  const hash=resumed.snapshot().jobs[0].sourceArt!.sha256;
  expect(resumed.approveArt(a.id,hash)).toBe(true);expect(resumed.approveArt(a.id,hash)).toBe(false);
  await vi.waitFor(()=>expect(resumed.snapshot().jobs[0].state).toBe('ready'));
  expect(resumed.snapshot().jobs[1].id).toBe(b.id);expect(resumed.snapshot().jobs[1].state).toBe('awaiting_approval');
  expect(resumed.snapshot().models).toHaveLength(1);expect(producer).toHaveBeenCalledTimes(3);
});

it('regeneration invalidates approval, uses revised equipment, has bounded player revisions, and keeps the current character art/model',async()=>{
  const c=createCharacter(createSession().id,{name:'Reviewer',race:'Human',className:'Fighter',icon:'old-icon',modelType:'old-model'});
  const producer=vi.fn(async()=>{throw new SourceArtApprovalRequired(art);}),q=new AssetQueue(path.join(directory,'queue.json'),producer);
  wireCharacterAssets(q);q.start();const job=craftHeroToken(q,c,'Chainmail and dark hair.',false,'Unarmed');
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
  expect(craftHeroToken(q,c,'Duplicate click').id).toBe(job.id);expect(q.snapshot().jobs).toHaveLength(1);
  expect(getCharacter(c.id)).toMatchObject({icon:'old-icon',modelType:'old-model'});
  expect(q.regenerateArt(job.id,'New description',false,'Unarmed')).toBe(true);
  expect(q.snapshot().jobs[0]).toMatchObject({referenceRevision:2,artBrief:'New description',heldWeapon:'Unarmed'});
  expect(q.snapshot().jobs[0].sourceArt).toBeUndefined();expect(q.approveArt(job.id,art.sha256)).toBe(false);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
  expect(q.regenerateArt(job.id)).toBe(true);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
  expect(()=>q.regenerateArt(job.id)).toThrow('Three art versions');
  expect(q.regenerateArt(job.id,undefined,true)).toBe(true);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
});

it('asks for reconstruction-friendly realism and identical orthographic views, not painted miniature proportions',()=>{
  const prompt=referenceArtPrompt({id:'x',family:'hero',subjectFamily:'orc',sourceCharacterId:'c',artBrief:'Held weapon: Greatsword.',state:'queued',attempts:0,stage:'',updatedAt:''});
  expect(prompt).toContain('Realistic sculpted anatomy');expect(prompt).toContain('Soft even neutral studio lighting');expect(prompt).toContain('Held weapon: Greatsword');
  expect(prompt).toContain('Same subject, scale');expect(prompt).not.toContain('Detailed painted miniature');
});

it('fits new hero models to the party silhouette instead of the monster height target',()=>{
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'elf'})).toBe(1.45);
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'human'})).toBe(1.45);
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'halfling'})).toBe(.95);
  expect(productionTargetHeight({subjectFamily:'elf'})).toBe(1.6);
});
