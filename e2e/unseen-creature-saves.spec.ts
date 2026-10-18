import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';
import type {StateSnapshot,SheetAbility} from '../shared/types';
import type {LiveDiceFrame} from '../shared/liveDiceTypes';

test('DM receives all unseen creature saves while the caster receives no hidden dice or labels',async({request})=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Unseen save audience'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const player=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const dmFrames:LiveDiceFrame[]=[],playerFrames:LiveDiceFrame[]=[];
 const progress:{id:string;active:boolean;at:number}[]=[],finished:{id:string;at:number}[]=[],saveTimes:{elapsed:number;at:number}[]=[];
 dm.on('dice:frame',f=>{dmFrames.push(f);dm.emit('dice:ready',{id:f.id});if(f.saveDice?.length)saveTimes.push({elapsed:f.elapsed,at:Date.now()});});
 player.on('dice:frame',f=>{playerFrames.push(f);player.emit('dice:ready',{id:f.id});});
 player.on('dice:resolving',p=>progress.push({...p,at:Date.now()}));
 player.on('dice:finished',p=>finished.push({...p,at:Date.now()}));
 const snap=async():Promise<StateSnapshot>=>{const r=await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const caster=(await snap()).characters.find(c=>c.name==='Vanec')!;
  const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
  dm.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:5,stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:18},sheetAbilities:[{...catalog.find(a=>a.name==='Fireball')!,id:'fireball'}],spellSlots:{L3:{max:2,used:0}}});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Arena',image:{name:'arena.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
  dm.emit('map:setActive',{mapId:map.id});
  dm.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:140,locked:false});
  for(const layer of ['map','tokens']){dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});dm.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:50,y:300});
  dm.emit('monster:create',{name:'Concealed guard',modelType:'goblin',creatureType:'Small humanoid',disposition:'enemy',maxHp:200,stats:{DEX:14}});
  const template=(await snap()).monsterTemplates.find(m=>m.name==='Concealed guard')!;
  for(const [x,y] of [[300,300],[340,300],[300,340]])dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
  const targets=(await snap()).tokens.filter(t=>t.kind==='monster');expect(targets).toHaveLength(3);
  for(const target of targets)dm.emit('token:setHidden',{tokenId:target.id,hidden:true});
  dm.emit('map:setActive',{mapId:map.id});dm.emit('session:setHideDmRolls',{hide:false});await snap();
  const joined=await player.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'});expect(joined.ok).toBe(true);
  const claimed=new Promise<StateSnapshot>(resolve=>{const check=(view:StateSnapshot)=>{if(view.characters.some(c=>c.id===caster.id&&c.claimedBy===player.id)){player.off('state:snapshot',check);resolve(view);}};player.on('state:snapshot',check);});
  player.emit('character:claim',{characterId:caster.id});const view=await claimed;
  expect(targets.every(t=>!view.tokens.some(v=>v.id===t.id))).toBe(true);
  player.emit('ability:roll',{kind:'pc',refId:caster.id,abilityId:'fireball',castLevel:3,area:{mapId:map.id,points:[{x:300,y:300}],angle:0}});
  await expect.poll(async()=>{const state=await snap();return targets.every(t=>state.monsters.find(m=>m.id===t.refId)!.curHp<200);},{timeout:90000,intervals:[500]}).toBe(true);
  const saves=dmFrames.filter(f=>f.saveDice?.length),done=saves.findLast(f=>f.done)!;
  expect(done).toBeTruthy();expect(done.sides).toEqual([20,20,20]);expect(done.saveDice).toHaveLength(3);
  expect(done.saveDice!.every(d=>typeof d.modifier==='number'&&typeof d.dc==='number'&&['pass','fail'].includes(d.outcome!))).toBe(true);
  expect(playerFrames.some(f=>f.saveDice?.length||f.sides.some(s=>s===20))).toBe(false);
  await expect.poll(()=>progress.length).toBe(2);
  expect(progress.map(p=>p.active)).toEqual([true,false]);expect(progress[0].id).toBe(progress[1].id);
  expect(finished.some(f=>f.id===playerFrames.at(-1)!.id&&f.at<=progress[0].at)).toBe(true);
  // The caster never gets the save tray and cannot acknowledge it. The DM
  // readies it instead, eliminating the previous 15-second invisible wait.
  expect(saveTimes.find(f=>f.elapsed>0)!.at-saveTimes[0].at).toBeLessThan(2500);
  expect(progress[1].at-progress[0].at).toBeGreaterThan(1000);
  await test.info().attach('save-audience',{body:JSON.stringify({dmSaveDice:done.saveDice,dmFaces:done.values,hiddenSaveFramesToPlayer:playerFrames.filter(f=>f.saveDice?.length).length,progress,finished,saveReadyDelayMs:saveTimes.find(f=>f.elapsed>0)!.at-saveTimes[0].at},null,2),contentType:'application/json'});
 }finally{player.disconnect();dm.disconnect();}
});
