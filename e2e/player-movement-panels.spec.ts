import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
for(const assisted of [true,false])test(`player panels keep live targets, health and character controls with assist ${assisted}`,async({page,request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Player movement and panels'}})).json();
 const image=await sharp({create:{width:900,height:600,channels:3,background:'#665b4b'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const first=await state(),pc=first.characters.find((c:any)=>c.name==='Druk');
  admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:90,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('character:update',{characterId:pc.id,curHp:10,maxHp:20,weapons:[{name:'Test bow',kind:'ranged',range:'80/320 ft',damage:'1d6',damageType:'piercing'}]});
  admin.emit('monster:create',{name:'Target goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:12,disposition:'enemy'});
  const created=await state(),monster=created.monsterTemplates.find((m:any)=>m.name==='Target goblin');
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:250,y:300});admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:monster.id,x:450,y:300});
  const tokens=(await state()).tokens,own=tokens.find((t:any)=>t.kind==='pc'),foe=tokens.find((t:any)=>t.kind==='monster');
  await page.addInitScript(assisted=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-server-rendering',assisted?'on':'off');},assisted);
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();const target=page.getByLabel('Attack target');await expect(target).toContainText('Target goblin');const before=await target.textContent();
  admin.emit('token:move',{tokenId:own.id,x:300,y:300});await state();await expect.poll(()=>target.textContent()).not.toBe(before);
  admin.emit('character:update',{characterId:pc.id,curHp:7});await state();await expect(page.getByRole('button',{name:/Health 7 of 20/})).toBeVisible();
  await page.locator('.hud-actions').getByRole('button',{name:'Character',exact:true}).click();await expect(page.locator('.character-window')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.character-window')).toBeHidden();
  admin.emit('token:delete',{tokenId:foe.id});await state();await expect(target).not.toContainText('Target goblin');
 }finally{admin.disconnect();}
});
