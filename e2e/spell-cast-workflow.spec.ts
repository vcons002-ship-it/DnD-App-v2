import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});

test('non-combat spells cast from saved entries, catalog and combat with explicit costs and safe cancellation',async({page,request},info)=>{
 test.setTimeout(120000);const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable casting clarity'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Vanec');
  const catalog=(await(await request.get('/api/spells/all')).json()).results;
  const names=['Identify','Mage Hand','Shield','Fireball','Command'];
  const abilities=names.map((name,i)=>({...catalog.find((a:any)=>a.name===name),id:`cast-${i}`,source:'srd',prepared:true}));
  expect(abilities.every(a=>a.name)).toBe(true);
  dm.emit('character:update',{characterId:pc.id,className:'Wizard',level:5,weapons:[],sheetAbilities:abilities,spellSlots:{L1:{max:4,used:0},L2:{max:3,used:0},L3:{max:2,used:0}}});
  const buffer=await sharp({create:{width:900,height:600,channels:3,background:'#86765f'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Quiet camp',image:{name:'camp.png',mimeType:'image/png',buffer}}})).json();
  dm.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:350,y:300});await state();
  await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-dice-rendering','2d');localStorage.setItem('dnd.rollAnimOff','1');});
  await page.setViewportSize({width:1400,height:950});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  const openBook=async()=>{await page.getByRole('button',{name:'Character',exact:true}).click();await page.locator('.character-window').getByRole('button',{name:'Spellbook',exact:true}).click();};
  const sheet=page.locator('.character-window'),entry=sheet.locator('.spell-entry').filter({has:page.locator('.spell-name').getByText('Identify',{exact:true})});
  const character=async()=>(await state()).characters.find((c:any)=>c.id===pc.id);
  await openBook();await entry.getByRole('button',{name:'Cast Identify',exact:true}).click();
  let setup=page.getByRole('dialog',{name:'Cast Identify',exact:true});
  await expect(setup).toBeVisible();await expect(setup.getByRole('combobox',{name:'Cast spell target'})).toHaveCount(0);
  await setup.getByLabel('Identify cast level',{exact:true}).selectOption('2');
  await expect(setup.getByRole('button',{name:/^Cast Identify · Level 2 slot/})).toBeEnabled();
  expect((await character()).spellSlots.L2.used).toBe(0);await setup.getByRole('button',{name:'Cancel spell casting'}).click();
  expect((await state()).rollLog).toHaveLength(0);
  await entry.getByRole('button',{name:'Cast Identify',exact:true}).click();
  await setup.getByLabel('Identify cast level',{exact:true}).selectOption('2');
  await setup.getByRole('button',{name:/^Cast Identify · Level 2 slot/}).click();
  await expect.poll(async()=>(await character()).spellSlots.L2.used).toBe(1);
  expect((await state()).round).toBe(0);expect((await state()).rollLog.filter((r:any)=>r.label==='Identify')).toHaveLength(1);
  // The catalog Cast button uses the learned entry without adding or spending
  // anything during browsing. Its native setup must be clickable above the sheet.
  await sheet.getByRole('button',{name:/Add spell or ability/}).click();await sheet.getByRole('button',{name:/Browse spellbook/}).click();
  const catalogBook=page.locator('.spellbook');await catalogBook.locator('.spellbook-search').fill('Identify');
  await catalogBook.getByRole('button',{name:'Cast Identify',exact:true}).click();
  await expect(setup).toBeVisible();expect((await character()).spellSlots.L1.used).toBe(0);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('mobile-cast-setup.png')});
  const bounds=(await setup.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await setup.getByRole('button',{name:/^Cast Identify · Level 1 slot/}).click();
  await expect.poll(async()=>(await character()).spellSlots.L1.used).toBe(1);
  await page.setViewportSize({width:1400,height:950});await catalogBook.getByTitle('Close',{exact:true}).click();await sheet.getByRole('button',{name:'Close character window',exact:true}).click();
  const combat=page.getByRole('region',{name:'Combat panel',exact:true});
  await combat.getByRole('button',{name:/^Cast Identify · Level 1 slot/}).click();
  await expect.poll(async()=>(await character()).spellSlots.L1.used).toBe(2);
  // The combat panel's reference list can cast without exposing sheet editing.
  await combat.getByRole('button',{name:'Cast Identify',exact:true}).click();
  await page.getByRole('dialog',{name:'Cast Identify',exact:true}).getByRole('button',{name:/^Cast Identify · Level 1 slot/}).click();
  await expect.poll(async()=>(await character()).spellSlots.L1.used).toBe(3);
  // Cantrips keep the explicit no-slot action, including supported summons.
  await combat.locator('.compact-player-combat').getByRole('button',{name:'Cast Mage Hand',exact:true}).click();
  const hand=page.getByRole('dialog',{name:'Cast Mage Hand',exact:true});await expect(hand).toContainText('no spell slot');
  await hand.getByRole('button',{name:/^Cast Mage Hand · Cantrip/}).click();
  await expect.poll(async()=>(await state()).monsters.some((m:any)=>m.name==='Mage Hand')).toBe(true);
  expect((await character()).spellSlots).toMatchObject({L1:{used:3},L2:{used:1},L3:{used:0}});
  // A spellbook area cast leaves the native sheet and spends nothing until the
  // map confirmation. Cancel remains free.
  await openBook();await sheet.getByRole('button',{name:'Cast Fireball',exact:true}).click();
  await page.getByRole('dialog',{name:'Cast Fireball',exact:true}).getByRole('button',{name:/^Cast Fireball · Level 3 slot/}).click();
  await expect(sheet).toHaveCount(0);const area=page.getByRole('region',{name:'Place spell area'});
  await expect(area).toContainText('Level 3 slot');expect((await character()).spellSlots.L3.used).toBe(0);
  await area.getByRole('button',{name:'Cancel (Esc)',exact:true}).click();expect((await character()).spellSlots.L3.used).toBe(0);
  await openBook();await sheet.getByRole('button',{name:'Cast Shield',exact:true}).click();
  const shield=page.getByRole('dialog',{name:'Cast Shield',exact:true});await expect(shield).toContainText('reaction prompt');
  await expect(shield.getByRole('button',{name:/^Cast Shield ·/})).toHaveCount(0);await shield.getByRole('button',{name:'Cancel spell casting'}).click();
  await sheet.getByRole('button',{name:'Cast Command',exact:true}).click();
  const command=page.getByRole('dialog',{name:'Cast Command',exact:true});
  await command.getByRole('button',{name:/^Cast Command · Level 1 slot/}).click();
  const words=page.getByRole('dialog',{name:'Choose Command',exact:true});
  await words.getByRole('button',{name:'Halt',exact:true}).click();
  await expect(words.getByRole('button',{name:/^Cast Command · Level 1 slot/})).toBeEnabled();
  await words.getByRole('button',{name:'Cancel',exact:true}).click();
  await command.getByRole('button',{name:'Cancel spell casting'}).click();
  expect((await character()).spellSlots.L1.used).toBe(3);
  const logCount=(await state()).rollLog.length;
  dm.emit('character:update',{characterId:pc.id,spellSlots:{L1:{max:4,used:4},L2:{max:3,used:3},L3:{max:2,used:2}}});await state();
  await sheet.getByRole('button',{name:'Cast Identify',exact:true}).click();
  const empty=page.getByRole('dialog',{name:'Cast Identify',exact:true});
  await expect(empty.getByRole('button',{name:/^Cast Identify · Level 1 slot/})).toBeDisabled();
  await expect(empty).toContainText('No level 1 slot remaining');await empty.getByRole('button',{name:'Cancel spell casting'}).click();
  expect((await state()).rollLog.length).toBe(logCount);
  expect(errors).toEqual([]);
 }finally{dm.disconnect();}
});
