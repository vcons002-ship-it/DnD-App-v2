import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';

test('the player aimed-line preview and server damage include a footprint edge, excluding a separated creature',async({page,request})=>{
 test.setTimeout(120000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Lightning footprint browser test'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const snapshot=async():Promise<StateSnapshot>=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const first=await snapshot(),caster=first.characters.find(c=>c.name==='Vanec')!;
  const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
  socket.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:6,maxHp:100,curHp:100,stats:{CHA:20},sheetAbilities:[{...catalog.find(a=>a.name==='Lightning Bolt')!,id:'bolt',source:'srd'}],spellSlots:{L3:{max:3,used:0}}});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=700;const ctx=c.getContext('2d')!;ctx.fillStyle='#302a29';ctx.fillRect(0,0,1400,700);return c.toDataURL('image/png').split(',')[1];});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Line arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:140,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  socket.emit('session:setManualDamage',{manual:false});socket.emit('session:setHideDmRolls',{hide:false});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:100,y:300});
  for(const [name,x,y] of [['Footprint edge',600,349],['Outside footprint',850,351]] as const){
   socket.emit('monster:create',{name,maxHp:500,stats:{DEX:10},creatureType:'Medium humanoid',disposition:'enemy'});
   const template=(await snapshot()).monsterTemplates.find(m=>m.name===name)!;socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
  }
  const ready=await snapshot(),actor=ready.tokens.find(t=>t.refId===caster.id)!,edge=ready.monsters.find(m=>m.name.startsWith('Footprint edge'))!,outside=ready.monsters.find(m=>m.name.startsWith('Outside footprint'))!;
  await page.addInitScript(()=>{localStorage.setItem('dnd.rollAnimOff','1');localStorage.setItem('dnd.playerMiniatures','false');localStorage.setItem('dnd.monsterMiniatures','false');});
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  await page.locator('.compact-player-combat').getByRole('button',{name:/Lightning Bolt/}).click();
  const area=page.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();
  const point=await page.evaluate(({id})=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').length),n=s.find('.token-hit-region').find((n:any)=>n.getAttr('tokenId')===id),r=s.container().getBoundingClientRect(),p=n.getAbsoluteTransform().point({x:600,y:0});return {x:r.left+p.x,y:r.top+p.y};},{id:actor.id});
  await page.mouse.move(point.x,point.y);await page.mouse.click(point.x,point.y);
  await expect(area).toContainText('1 visible targets');await page.screenshot({path:test.info().outputPath('lightning-footprint-preview.png')});
  await area.getByRole('button',{name:/Confirm area/}).click();
  await expect(area).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.spell-area-shape')).length)).toBe(0);
  await expect.poll(async()=>(await snapshot()).monsters.find(m=>m.id===edge.id)!.curHp,{timeout:90000}).toBeLessThan(500);
  const after=await snapshot();expect(after.monsters.find(m=>m.id===outside.id)!.curHp).toBe(500);expect(after.characters.find(c=>c.id===caster.id)!.curHp).toBe(100);expect(after.characters.find(c=>c.id===caster.id)!.spellSlots.L3.used).toBe(1);
 }finally{socket.disconnect();}
});

test('Burning Hands cone preview and server damage include a footprint edge, excluding a separated creature',async({page,request})=>{
 test.setTimeout(120000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Burning Hands cone browser test'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const snapshot=async():Promise<StateSnapshot>=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const first=await snapshot(),caster=first.characters.find(c=>c.name==='Vanec')!;
  const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
  socket.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:3,maxHp:100,curHp:100,stats:{CHA:20},sheetAbilities:[{...catalog.find(a=>a.name==='Burning Hands')!,id:'burning',source:'srd'}],spellSlots:{L1:{max:3,used:0}}});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=700;const ctx=c.getContext('2d')!;ctx.fillStyle='#302a29';ctx.fillRect(0,0,1400,700);return c.toDataURL('image/png').split(',')[1];});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Line arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:140,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  socket.emit('session:setManualDamage',{manual:false});socket.emit('session:setHideDmRolls',{hide:false});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:100,y:300});
  for(const [name,x,y] of [['Footprint edge',200,374],['Outside footprint',200,380]] as const){
   socket.emit('monster:create',{name,maxHp:500,stats:{DEX:10},creatureType:'Medium humanoid',disposition:'enemy'});
   const template=(await snapshot()).monsterTemplates.find(m=>m.name===name)!;socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
  }
  const ready=await snapshot(),actor=ready.tokens.find(t=>t.refId===caster.id)!,edge=ready.monsters.find(m=>m.name.startsWith('Footprint edge'))!,outside=ready.monsters.find(m=>m.name.startsWith('Outside footprint'))!;
  await page.addInitScript(()=>{localStorage.setItem('dnd.rollAnimOff','1');localStorage.setItem('dnd.playerMiniatures','false');localStorage.setItem('dnd.monsterMiniatures','false');});
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  await page.locator('.compact-player-combat').getByRole('button',{name:/Burning Hands/}).click();
  const area=page.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();
  const point=await page.evaluate(({id})=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').length),n=s.find('.token-hit-region').find((n:any)=>n.getAttr('tokenId')===id),r=s.container().getBoundingClientRect(),p=n.getAbsoluteTransform().point({x:150,y:0});return {x:r.left+p.x,y:r.top+p.y};},{id:actor.id});
  await page.mouse.move(point.x,point.y);await page.mouse.click(point.x,point.y);
  await expect(area).toContainText('1 visible targets');await page.screenshot({path:test.info().outputPath('burning-hands-preview.png')});
  await area.getByRole('button',{name:/Confirm area/}).click();
  await expect(area).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.spell-area-shape')).length)).toBe(0);
  await expect.poll(async()=>(await snapshot()).monsters.find(m=>m.id===edge.id)!.curHp,{timeout:90000}).toBeLessThan(500);
  const after=await snapshot();expect(after.monsters.find(m=>m.id===outside.id)!.curHp).toBe(500);expect(after.characters.find(c=>c.id===caster.id)!.curHp).toBe(100);expect(after.characters.find(c=>c.id===caster.id)!.spellSlots.L1.used).toBe(1);
 }finally{socket.disconnect();}
});
