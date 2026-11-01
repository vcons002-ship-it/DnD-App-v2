import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {waitForCombatRoll} from './helpers/combatLive';

test.use({hasTouch:true,isMobile:true,viewport:{width:900,height:700},trace:'off'});
for(const role of ['dm','player'] as const)for(const mode of ['legacy','standard'] as const)test(`${role} long press attacks with the selected companion in ${mode}`,async({page,request,context})=>{
 test.setTimeout(90000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Touch quick combat'}})).json();
 const image=await sharp({create:{width:1000,height:700,channels:3,background:'#59604b'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const s=await state(),pc=s.characters.find((c:any)=>c.name==='Druk');dm.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:250,y:350});
  for(const [name,disposition,x] of [['Touch Companion','friendly',450],['Touch Target','enemy',650]] as const){
   dm.emit('monster:create',{name,disposition,modelType:'goblin',maxHp:100,armorClass:10,weapons:[{name:'Companion Blade',kind:'ranged',range:'150/600',damage:'1d6',attackBonus:5,diceOnly:true}]});
   const template=(await state()).monsterTemplates.find((m:any)=>m.name===name);dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:350});
  }
  const ready=await state(),playerToken=ready.tokens.find((t:any)=>t.refId===pc.id),actor=ready.tokens.find((t:any)=>ready.monsters.some((m:any)=>m.id===t.refId&&m.name.startsWith('Touch Companion'))),target=ready.tokens.find((t:any)=>ready.monsters.some((m:any)=>m.id===t.refId&&m.name.startsWith('Touch Target')));
  await page.addInitScript(mode=>{localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-dice-rendering','2d');},mode);
  await page.goto(`/${role==='dm'?'dm':'join'}?code=${code}`);
  if(role==='dm'){await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();}
  else{await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();}
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode',mode==='legacy'?'legacy':'standard');
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva?.stages.find((s:any)=>s.find('.token').length)?.find('.token').length??0)).toBe(3);
  if(mode==='standard')await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-ids',new RegExp(actor.id));
  const point=async(id:string)=>page.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();return {x:r.left+p.x*r.width/stage.width(),y:r.top+p.y*r.height/stage.height()};},id);
  const a=await point(actor.id),b=await point(target.id);await page.touchscreen.tap(a.x,a.y);
  const touch=await context.newCDPSession(page);const hold=async(p:{x:number;y:number})=>{await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await page.waitForTimeout(650);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  const menu=page.getByRole('dialog',{name:'Token actions',exact:true});await hold(b);await expect(menu).toBeVisible();
  await expect(menu.getByLabel('Act as')).toHaveValue(actor.id);
  await expect(menu).toContainText('Touch Target');await expect(menu).toContainText('Attacking as');await expect(menu).toContainText('Touch Companion');
  await menu.getByRole('button',{name:'Close token actions'}).click();
  // A subsequent ordinary tap must still select the touched token.
  await page.touchscreen.tap(b.x,b.y);await hold(a);await expect(menu).toBeVisible();
  await expect(menu.getByLabel('Act as')).toHaveValue(role==='dm'?target.id:playerToken.id);
  await menu.getByRole('button',{name:'Close token actions'}).click();
  await page.touchscreen.tap(a.x,a.y);await hold(b);await expect(menu.getByLabel('Act as')).toHaveValue(actor.id);
  const previous=new Set<string>((await state()).rollLog.map((roll:any)=>roll.id));
  await menu.getByRole('button',{name:/Companion Blade/}).click();
  const roll=await waitForCombatRoll(state,previous,r=>r.label==='Attack');
  expect(roll.reveal?.attacker).toContain('Touch Companion');expect(roll.reveal?.target).toContain('Touch Target');
 }finally{dm.disconnect();}
});
