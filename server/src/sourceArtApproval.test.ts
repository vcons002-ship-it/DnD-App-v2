import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {AssetQueue,SourceArtApprovalRequired} from './assets/queue.js';
import {produceAsset} from './assets/production.js';
import {referenceArtPrompt,productionTargetHeight} from './assets/referencePrompt.js';
import {generateImageWithBackup,generateApiImage} from './ai/imageGateway.js';
import {createSession,createCharacter,getCharacter} from './sessions.js';
import {craftHeroToken,wireCharacterAssets} from './assets/heroTokens.js';
import type {AssetJob,ProducedMiniature,SourceArt} from '../../shared/assetProduction.js';

vi.mock('./ai/imageGateway.js',()=>({generateImageWithBackup:vi.fn(),generateApiImage:vi.fn()}));
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
  await expect(produceAsset({...job,attempts:2,sourceArt:{...checkpoint!,approvedAt:new Date().toISOString()}},vi.fn())).rejects.toThrow('hybrid multiview shape worker is unavailable');
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
  expect(prompt).toContain('battle-ready stance');
  expect(prompt).toContain('Same subject, scale');expect(prompt).not.toContain('Detailed painted miniature');
});

it('fits new hero models to the party silhouette instead of the monster height target',()=>{
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'elf'})).toBe(1.45);
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'human'})).toBe(1.45);
  expect(productionTargetHeight({sourceCharacterId:'pc',subjectFamily:'halfling'})).toBe(.95);
  expect(productionTargetHeight({subjectFamily:'elf'})).toBe(1.6);
  expect(productionTargetHeight({sourceCharacterId:'pc',heightInches:66})).toBe(66/48);
});

it('refreshes only the requested image with reference guidance and requires a new approval for the combined set',async()=>{
  await fs.mkdir(config.uploadsDir,{recursive:true});
  const input=path.join(config.uploadsDir,`single-${path.basename(directory)}.png`),replacement=path.join(config.uploadsDir,`replacement-${path.basename(directory)}.png`);
  await sharp({create:{width:2048,height:2048,channels:3,background:'#aa8855'}}).png().toFile(input);
  await sharp({create:{width:2048,height:2048,channels:3,background:'#558866'}}).png().toFile(replacement);
  vi.mocked(generateImageWithBackup).mockResolvedValue({path:`/uploads/${path.basename(input)}`});
  vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${path.basename(replacement)}`});
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const job:AssetJob={id:path.basename(directory),family:'hero-partial',state:'running',stage:'',attempts:1,updatedAt:''};
  let first!:SourceArt,second!:SourceArt;
  try{await produceAsset(job,vi.fn());}catch(e){first=(e as SourceArtApprovalRequired).art;}
  try{await produceAsset({...job,attempts:2,referenceRevision:2,referenceSourceRevision:1,refreshView:'left'},vi.fn());}catch(e){second=(e as SourceArtApprovalRequired).art;}
  expect(second.sha256).not.toBe(first.sha256);expect(second.approvedAt).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
  const root=path.join(config.dataDir,'asset-production',job.id);
  for(const view of ['front','back','right'])expect(await fs.readFile(path.join(root,'references-v2',`${view}.png`))).toEqual(await fs.readFile(path.join(root,'references-v1',`${view}.png`)));
  expect(await fs.readFile(path.join(root,'references-v2','left.png'))).not.toEqual(await fs.readFile(path.join(root,'references-v1','left.png')));
  expect(generateImageWithBackup).toHaveBeenCalledTimes(1);expect(generateApiImage).toHaveBeenCalledTimes(1);
  expect(vi.mocked(generateApiImage).mock.calls[0][2]?.[0].data.length).toBeGreaterThan(0);
});

it('keeps a finished model while refreshing one of its saved views, then requires approval again',async()=>{
  const producer=vi.fn(async(job:AssetJob)=>{if(!job.sourceArt?.approvedAt)throw new SourceArtApprovalRequired({...art,sha256:String(job.referenceRevision??1).repeat(64)});return model(job.family);});
  const q=new AssetQueue(path.join(directory,'queue.json'),producer);q.start();const job=q.enqueue({name:'New beast'})!;
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
  q.approveArt(job.id,q.snapshot().jobs[0].sourceArt!.sha256);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('ready'));
  expect(q.snapshot().jobs[0].sourceArt?.views).toHaveLength(4);
  expect(q.regenerateArt(job.id,undefined,true,undefined,{view:'front'})).toBe(true);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('awaiting_approval'));
  expect(q.snapshot().models).toHaveLength(1);expect(q.approveArt(job.id,'1'.repeat(64))).toBe(false);
  expect(q.snapshot().jobs[0]).toMatchObject({refreshView:'front',referenceSourceRevision:1,referenceRevision:2});
});

it('cancels active work without late publication and serializes a re-craft behind the retiring worker',async()=>{
  let finish!:(m:ProducedMiniature)=>void,progress!:(s:string)=>void,reference!:(u:string)=>void;
  const producer=vi.fn((job:AssetJob,p:(s:string)=>void,r:(u:string)=>void,signal?:AbortSignal)=>{
    progress=p;reference=r;return new Promise<ProducedMiniature>(resolve=>{finish=resolve;});
  });
  const q=new AssetQueue(path.join(directory,'queue.json'),producer),c=createCharacter(createSession().id,{name:'Again',race:'Elf',modelType:'old',icon:'old-icon'});wireCharacterAssets(q);q.start();
  const first=craftHeroToken(q,c,'Armor and a ready stance.');
  expect(q.cancel(first.id)).toBe(true);expect(q.snapshot().jobs[0].state).toBe('cancelling');expect(producer.mock.calls[0][3]?.aborted).toBe(true);
  progress('Late progress');reference('/uploads/miniatures/should-not-apply.png');
  expect(getCharacter(c.id)).toMatchObject({modelType:'old',icon:'old-icon'});
  const next=craftHeroToken(q,getCharacter(c.id)!,'Revised appearance.');expect(next.id).not.toBe(first.id);expect(producer).toHaveBeenCalledTimes(1);
  finish(model(first.family));await vi.waitFor(()=>expect(producer).toHaveBeenCalledTimes(2));
  expect(q.snapshot().jobs[0].state).toBe('cancelled');expect(q.snapshot().models).toHaveLength(0);
  finish(model(next.family));await vi.waitFor(()=>expect(q.snapshot().jobs[1].state).toBe('ready'));
  expect(getCharacter(c.id)?.modelType).toBe(next.family);expect(q.snapshot().models).toHaveLength(1);
});
