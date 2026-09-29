import {test,expect} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
const connections:Socket[]=[];
test.afterEach(()=>connections.splice(0).forEach(s=>s.disconnect()));
import {DM_SECRET,PORT} from './playwright.config';

test('server live fireball and manual weapon damage match the streamed faces',async({page:dm,request})=>{
 test.setTimeout(120000);dm.setDefaultTimeout(12000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Live dice workflow'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});connections.push(socket);
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});return r.snapshot;};
 await snap();
 const png = await dm.evaluate(() => {
   const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 800;
   const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0,0,1000,800);
   return canvas.toDataURL('image/png').split(',')[1];
 });
 socket.emit('session:setManualDamage',{manual:true});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Castle courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
 socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
 socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});socket.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});await snap();
 const vanec=(await snap()).characters.find((c:any)=>c.name==='Vanec');
 socket.emit('character:update',{characterId:vanec.id,className:'Sorcerer',stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:18},level:17,spellSlots:{L3:{max:2,used:0}},sheetAbilities:[{id:'fireball',name:'Fireball',type:'spell',level:3,description:'A burst of flame. Dexterity save for half damage.',roll:{kind:'save',dice:'8d6',scaleDice:'1d6',save:'DEX',saveDamage:'half',damageType:'fire',baseLevel:3}}]});
 socket.emit('map:setActive',{mapId:map.id});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:vanec.id,x:640,y:480});
 socket.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:100,armorClass:1,disposition:'enemy'});
 const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:640,y:288});await snap();
 await dm.setViewportSize({width:1440,height:900});await dm.goto(`/join?code=${code}`);await dm.getByRole('button',{name:'Join',exact:true}).click();await dm.locator('.claim-row').filter({hasText:'Vanec'}).click();await expect(dm.getByTestId('player-hud')).toBeVisible();await dm.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await dm.waitForTimeout(1500);
 const liveFrames:any[]=[];socket.on('dice:frame',(f:any)=>liveFrames.push(f));
 {
 await dm.locator('.compact-player-combat').getByRole('combobox').last().selectOption('3');
 await dm.locator('.compact-player-combat').getByRole('button',{name:/Fireball/}).click();
 await expect(dm.locator('[data-live-dice="true"]')).toBeVisible();
 await expect(dm.locator('[data-live-dice="true"] .tray-die-result')).toHaveCount(8);
 expect((await snap()).rollLog.filter((r:any)=>r.label==='Fireball')).toHaveLength(0);
 await expect(dm.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:30000});
 const result=(await snap()).rollLog.find((r:any)=>r.label==='Fireball');expect(result.reveal.physical).toBe(true);
 const final=liveFrames.findLast((f:any)=>f.done);expect(final).toBeTruthy();expect(final.values).toEqual(result.reveal.damageDice[0].faces);
 expect(liveFrames[0].done).toBe(false);expect(liveFrames[0].values).toEqual(Array(8).fill(null));
 }
 // A real weapon hit waits for the player's damage button, then commits once.
 socket.emit('character:update',{characterId:vanec.id,weapons:[{name:'Quarterstaff',kind:'melee',damage:'1d6',damageType:'bludgeoning',attackBonus:100}]});await snap();
 await dm.keyboard.press('Escape');
 {
   let hit:any;
   for(let i=0;i<5&&!hit;i++){
     await dm.locator('.compact-player-combat').getByRole('button',{name:/Quarterstaff/}).click();
     await expect(dm.locator('[data-live-dice="true"]')).toBeVisible();
     await expect(dm.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:30000});
     await expect(dm.locator('.rr-adjustment').first()).toBeVisible();
     await expect(dm.locator('.roll-reveal[data-impact-ready="false"]')).toBeVisible();
     hit=(await snap()).rollLog.findLast((r:any)=>r.pending&&!r.pending.done);
     if(!hit)await dm.keyboard.press('Escape');
   }
   expect(hit).toBeTruthy();const before=await snap();const enemy=before.monsters.find((m:any)=>m.id===hit.pending.target.refId);
   expect(hit.pending.dice).toEqual([]);expect(enemy.curHp).toBe(100);
   await dm.waitForTimeout(1500);await dm.keyboard.press('Escape');
   await dm.locator('.damage-prompt-btn').click();
   await expect(dm.locator('[data-live-dice="true"]')).toBeVisible();
   expect((await snap()).monsters.find((m:any)=>m.id===enemy.id).curHp).toBe(100);
   await expect.poll(async()=> (await snap()).rollLog.find((r:any)=>r.id===hit.id)?.pending?.done,{timeout:30000}).toBe(true);
   const final=await snap();const damage=final.rollLog.findLast((r:any)=>r.label==='Damage');
   expect(final.monsters.find((m:any)=>m.id===enemy.id).curHp).toBe(100-damage.total);
   expect(damage.reveal.physical).toBe(true);
 }
 socket.disconnect();
});
