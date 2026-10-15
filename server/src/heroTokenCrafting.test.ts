import {afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {AssetQueue,ProductionError} from './assets/queue.js';
import {craftHeroToken,wireCharacterAssets} from './assets/heroTokens.js';
import {createSession,createCharacter,getCharacter,createCharacterFromLibrary} from './sessions.js';
import {saveLibraryCharacter} from './library.js';
import {heroArtBrief,type ProducedMiniature} from '../../shared/assetProduction.js';

const dirs:string[]=[];
afterEach(()=>{vi.unstubAllGlobals();for(const dir of dirs.splice(0)){
  const target=path.resolve(dir),root=path.resolve(os.tmpdir());
  if(path.dirname(target)!==root||!path.basename(target).startsWith('hero-craft-'))throw new Error('Unexpected test cleanup path');
  fs.rmSync(target,{recursive:true,force:true});
}});
const file=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hero-craft-'));dirs.push(dir);return path.join(dir,'queue.json');};
const model=(id:string):ProducedMiniature=>({id,url:`/uploads/miniatures/${id}.glb`,baseDiameter:1.6,baseCenter:[0,0,0],bytes:1200000,triangles:20000,sha256:'test'});
const hero=()=>createCharacter(createSession().id,{name:'Rowan',race:'Orc',className:'Fighter',weapons:[{name:'Greatsword',kind:'melee',damage:'2d6'}],items:[{id:'armor',name:'Chain mail',qty:1,note:''}],stats:{STR:16},maxHp:13});
it('snapshots species, class, appearance, actual weapons and armor in a unique character job',()=>{
  const c=hero(),q=new AssetQueue(file(),vi.fn());
  const job=craftHeroToken(q,c,'Dark green skin, black braids, and a red sash.',true);
  expect(job.sourceCharacterId).toBe(c.id);expect(job.family).toMatch(/^hero-rowan-/);
  expect(job.artBrief).toContain('Species/race: Orc. Class: Fighter');expect(job.artBrief).toContain('Greatsword');expect(job.artBrief).toContain('Chain mail');expect(job.artBrief).toContain('black braids');
  expect(craftHeroToken(q,getCharacter(c.id)!,'Changed notes',true).id).toBe(job.id);
  expect(getCharacter(c.id)?.appearance).toContain('black braids');
  const c2=createCharacter(c.sessionId,{name:'Rowan',race:'Elf',className:'Wizard'});
  expect(craftHeroToken(q,c2,'White hair and blue robes.').family).not.toBe(job.family);
  expect(heroArtBrief(c,'Ignore gear')).toContain('Greatsword');
  expect(heroArtBrief({...c,items:[{id:'shirt',name:'Chain Shirt',qty:1,note:''}]},'')).toContain('Chain Shirt');
});
it('publishes 2D reference art, then binds the ready model without changing combat stats',async()=>{
  const c=hero();let finish!:(m:ProducedMiniature)=>void;
  const q=new AssetQueue(file(),async(job,_progress,reference)=>{reference(`/uploads/miniatures/${job.family}.png`);return new Promise(resolve=>{finish=resolve;});});
  wireCharacterAssets(q);const changed=vi.fn();q.onCharacterChange=changed;
  const job=craftHeroToken(q,c,'Green skin and chainmail.');q.start();
  await vi.waitFor(()=>expect(getCharacter(c.id)?.icon).toBe(`/uploads/miniatures/${job.family}.png`));
  expect(q.snapshot().models).toHaveLength(0);finish(model(job.family));
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('ready'));
  expect(getCharacter(c.id)?.modelType).toBe(job.family);expect(getCharacter(c.id)?.maxHp).toBe(c.maxHp);expect(getCharacter(c.id)?.weapons).toEqual(c.weapons);
  expect(changed).toHaveBeenCalledWith(c.sessionId);
  const restored=new AssetQueue((q as any).file,vi.fn());wireCharacterAssets(restored);expect(getCharacter(c.id)?.modelType).toBe(job.family);
});
it('retains playable reference art after a 3D failure and retry reuses the same job',async()=>{
  const c=hero(),producer=vi.fn(async(job:any,_progress:any,reference:any):Promise<ProducedMiniature>=>{reference(`/uploads/miniatures/${job.family}.png`);throw new ProductionError('Worker unavailable.');});
  const q=new AssetQueue(file(),producer);wireCharacterAssets(q);const job=craftHeroToken(q,c,'Green skin.');q.start();
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('failed'));
  expect(getCharacter(c.id)?.icon).toContain('.png');expect(getCharacter(c.id)?.curHp).toBe(c.curHp);
  producer.mockImplementationOnce(async(job:any)=>model(job.family) as any);expect(q.retry(job.id)).toBe(true);
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('ready'));expect(q.snapshot().jobs).toHaveLength(1);
});
it('retains personal model bindings when saved to and loaded from the character library',()=>{
  const c=hero(),q=new AssetQueue(file(),vi.fn()),job=craftHeroToken(q,c,'Green skin.');
  const saved=getCharacter(c.id)!;saveLibraryCharacter({...saved,name:'Crafted library hero'},true);
  const loaded=createCharacterFromLibrary(createSession().id,'Crafted library hero')!;
  expect(loaded.modelType).toBe(job.family);expect(loaded.appearance).toBe('Green skin.');
});

it('snapshots an explicit held weapon and does not overwrite a later uploaded miniature',async()=>{
  const c=hero();let finish!:(m:ProducedMiniature)=>void;const q=new AssetQueue(file(),async()=>new Promise(r=>{finish=r;}));wireCharacterAssets(q);
  const job=craftHeroToken(q,c,'Green skin.',false,'Greatsword');expect(job.artBrief).toContain('Held weapon: Greatsword');expect(()=>craftHeroToken(q,c,'Green',false,'Longbow')).toThrow('Choose a weapon');
  q.start();const {db}=await import('./db.js');db.prepare('UPDATE characters SET model_type=? WHERE id=?').run('uploaded-new-model',c.id);finish(model(job.family));
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('ready'));expect(getCharacter(c.id)?.modelType).toBe('uploaded-new-model');
  const restored=new AssetQueue((q as any).file,vi.fn());wireCharacterAssets(restored);expect(getCharacter(c.id)?.modelType).toBe('uploaded-new-model');
});

it('does not put crafted art back over an icon the player chose later, after a restart',async()=>{
  const c=hero();
  const q=new AssetQueue(file(),async(job,_p,reference)=>{reference(`/uploads/miniatures/${job.family}.png`);return model(job.family);});
  wireCharacterAssets(q);const job=craftHeroToken(q,c,'Green skin.');q.start();
  await vi.waitFor(()=>expect(q.snapshot().jobs[0].state).toBe('ready'));
  expect(getCharacter(c.id)?.icon).toBe(`/uploads/miniatures/${job.family}.png`);
  expect(q.snapshot().jobs[0].iconApplied).toBe(true);
  const {db}=await import('./db.js');db.prepare('UPDATE characters SET icon=? WHERE id=?').run('🐉',c.id);
  wireCharacterAssets(new AssetQueue((q as any).file,vi.fn()));
  expect(getCharacter(c.id)?.icon).toBe('🐉');
});
it('limits each player to a few paid hero-token crafts a day; the DM is not limited',async()=>{
  const {HERO_CRAFTS_PER_DAY}=await import('./assets/heroTokens.js');
  const q=new AssetQueue(file(),vi.fn()),s=createSession();
  const fresh=(i:number)=>createCharacter(s.id,{name:`Alt ${i}`,race:'Elf',className:'Wizard'});
  const me={dm:false,playerId:'player-quota-1'};
  for(let i=0;i<HERO_CRAFTS_PER_DAY;i++)craftHeroToken(q,fresh(i),'Blue robes.',false,undefined,me);
  expect(()=>craftHeroToken(q,fresh(99),'Blue robes.',false,undefined,me)).toThrow(/a day per player/);
  expect(()=>craftHeroToken(q,fresh(98),'Blue robes.',false,undefined,{dm:false,playerId:'someone-else'})).not.toThrow();
  expect(()=>craftHeroToken(q,fresh(97),'Blue robes.',false,undefined,{dm:true})).not.toThrow();
  expect(()=>craftHeroToken(q,fresh(96),'Blue robes.',false,undefined,{dm:false,playerId:null})).toThrow(/a day per player/);
});
