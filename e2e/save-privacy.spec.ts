import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import {expectUnclipped} from './helpers/rollVisibility';

test('Ice Knife saves precede damage, stay private to the DM, and never replay afterward',async({page,request})=>{
 test.setTimeout(120000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Save presentation regression'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 try {
  const snapshot=async()=> (await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  await snapshot();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d')!;x.fillStyle='#303832';x.fillRect(0,0,1000,800);return c.toDataURL().split(',')[1];});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  dm.emit('session:setManualDamage',{manual:false});dm.emit('session:setHideDmRolls',{hide:false});
  dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:80,locked:false});
  dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});dm.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});
  const vanec=(await snapshot()).characters.find((c:any)=>c.name==='Vanec');
  dm.emit('character:update',{characterId:vanec.id,className:'Sorcerer',level:5,maxHp:100,curHp:100,armorClass:1,stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:18},spellSlots:{L1:{max:4,used:0}},sheetAbilities:[{id:'ice',name:'Ice Knife',type:'spell',source:'srd',level:1,description:'Piercing attack and Cold explosion.',roll:{kind:'attack',dice:'1d10',damageType:'piercing',baseLevel:1}}]});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:vanec.id,x:300,y:300});
  dm.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:100,armorClass:1,stats:{STR:10,DEX:16,CON:10,INT:10,WIS:10,CHA:10},saveProficiencies:['DEX'],level:5,disposition:'enemy',weapons:[{name:'Scimitar',kind:'melee',damage:'1d6+4',damageType:'slashing',attackBonus:100}]});
  const template=(await snapshot()).monsterTemplates.find((m:any)=>m.name==='Goblin');
  dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:500,y:300});
  dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:550,y:300});await snapshot();
  const playerFrames:any[]=[],playerStates:any[]=[],dmFrames:any[]=[];
  page.on('websocket',ws=>ws.on('framereceived',({payload})=>{
   const text=String(payload);if(!text.startsWith('42'))return;
   try{const [event,data]=JSON.parse(text.slice(2));if(event==='dice:frame')playerFrames.push(data);if(event==='state:snapshot')playerStates.push(data);}catch{}
  }));
  dm.on('dice:frame',(frame:any)=>dmFrames.push(frame));
  await page.setViewportSize({width:1440,height:900});await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
  await page.evaluate(()=>{
   (window as any).lateSavePopups=[];
   new MutationObserver(()=>{for(const el of document.querySelectorAll('.roll-reveal-backdrop:not([data-live-dice]) .roll-reveal'))if(/Saving Throw|DEX save/i.test(el.textContent??''))(window as any).lateSavePopups.push(el.textContent);}).observe(document.body,{subtree:true,childList:true});
  });
  await page.locator('.compact-player-combat').getByRole('button',{name:/Ice Knife/}).click();
  await expect.poll(()=>playerFrames.some(f=>f.done&&f.saveDice?.length===2),{timeout:45000}).toBe(true);
  const save=playerFrames.find(f=>f.done&&f.saveDice?.length===2);
  // Vanec knows his own spell DC; goblin save bonuses remain private.
  expect(save.saveDice.every((d:any)=>d.hideModifiers&&d.modifier===undefined&&d.dc===15&&['pass','fail'].includes(d.outcome))).toBe(true);
  const dmSave=dmFrames.find(f=>f.done&&f.saveDice?.length===2);
  expect(dmSave.saveDice.every((d:any)=>Number.isFinite(d.modifier)&&Number.isFinite(d.dc))).toBe(true);
  await expect(page.locator('.tray-save-outcome').first()).toContainText(/PASS|FAIL/,{timeout:5000});
  for(const verdict of await page.locator('.tray-save-verdict,.tray-save-outcome b').all())await expectUnclipped(verdict);
  await page.screenshot({path:test.info().outputPath('grouped-save-outcomes.png')});
  await expect(page.locator('.tray-save-equation')).toHaveCount(0);
  await expect.poll(()=>playerFrames.some(f=>f.done&&f.sides.length===2&&f.sides.every((s:number)=>s===6)),{timeout:30000}).toBe(true);
  const completed=playerFrames.filter(f=>f.done).filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i);
  expect(completed.findIndex(f=>f.saveDice?.length===2)).toBeLessThan(completed.findIndex(f=>f.sides.length===2&&f.sides.every((s:number)=>s===6)));
  await expect.poll(()=>playerStates.some(s=>s.rollLog.filter((r:any)=>r.reveal?.kind==='check').length===2),{timeout:15000}).toBe(true);
  const player=playerStates.at(-1),checks=player.rollLog.filter((r:any)=>r.reveal?.kind==='check');
  expect(checks.every((r:any)=>r.reveal.presentedLive&&r.reveal.hideModifiers&&r.reveal.attackTotal===undefined&&r.reveal.toHit.length===0&&r.hideTotal&&r.hpNote===undefined)).toBe(true);
  expect(player.monsters.every((m:any)=>m.armorClass===undefined&&m.curHp===undefined&&m.stats===undefined)).toBe(true);
  await page.keyboard.press('Escape');await page.waitForTimeout(2500);
  expect(await page.evaluate(()=>(window as any).lateSavePopups)).toEqual([]);
  // A DM-initiated creature attack preserves its full calculation only for the DM.
  const before=await snapshot(),enemy=before.tokens.find((t:any)=>t.kind==='monster'),hero=before.tokens.find((t:any)=>t.kind==='pc');
  const oldIds=new Set(before.rollLog.map((r:any)=>r.id));
  dm.emit('combat:attack',{attackerTokenId:enemy.id,targetTokenId:hero.id,weaponIndex:0});
  await expect.poll(()=>playerStates.at(-1)?.rollLog.some((r:any)=>!oldIds.has(r.id)&&r.reveal?.kind==='attack'),{timeout:45000}).toBe(true);
  const privateAttack=playerStates.at(-1).rollLog.findLast((r:any)=>r.reveal?.kind==='attack');
  expect(privateAttack).toMatchObject({hideMods:true,hideTotal:true,total:0});
  expect(privateAttack.reveal).toMatchObject({hideModifiers:true,toHit:[],damageMods:[]});
  expect(privateAttack.reveal.attackTotal).toBeUndefined();
  const full=(await snapshot()).rollLog.find((r:any)=>r.id===privateAttack.id);
  expect(full.reveal.toHit.length).toBeGreaterThan(0);expect(full.reveal.attackTotal).toBeGreaterThan(0);
  await expect(page.locator('.roll-reveal[data-reveal-kind="attack"]')).toBeVisible();
  await expect(page.locator('.rr-buildup')).toHaveCount(0);
 }finally{dm.disconnect();}
});
