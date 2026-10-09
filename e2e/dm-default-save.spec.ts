import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test('DM attack and damage use the creature name; default Ice Breath saves and applies to the selected target',async({page,request})=>{
 test.setTimeout(180000);
 await page.setViewportSize({width:1500,height:950});
 await page.addInitScript(()=>{const id=localStorage.getItem('dnd.playerId')??crypto.randomUUID();localStorage.setItem('dnd.playerId',id);localStorage.setItem(`dnd.tokenView:${id}`,'2d');localStorage.setItem(`dnd.monsterTokenView:${id}`,'2d');});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Ice Breath selected target'}})).json();
 const buffer=await sharp({create:{width:900,height:600,channels:3,background:'#655d50'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Hall',image:{name:'hall.png',mimeType:'image/png',buffer}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>{const result=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(result.ok).toBe(true);return result.snapshot;};
 const frames:any[]=[];dm.on('dice:frame',f=>frames.push(f));
 try{
  const druk=(await snapshot()).characters.find((c:any)=>c.name==='Druk');
  dm.emit('character:update',{characterId:druk.id,maxHp:100,curHp:100,armorClass:1,stats:{CON:10}});
  dm.emit('session:setManualDamage',{manual:true});dm.emit('session:setHideDmRolls',{hide:false});
  dm.emit('map:setActive',{mapId:map.id});dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});dm.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:430,y:310});
  dm.emit('monster:create',{name:'Frost Drake',maxHp:50,armorClass:12,weapons:[{name:'Claw',kind:'melee',damage:'1d4',damageType:'slashing',attackBonus:30}],sheetAbilities:[{id:'ice',name:'Ice Breath',type:'spell',level:0,description:'DC 30 Constitution save. 3d6 cold damage, half on success.',recharge:{min:5},roll:{kind:'save',save:'CON',dc:30,dice:'3d6',damageType:'cold'}}]});
  const template=(await snapshot()).monsterTemplates.find((m:any)=>m.name==='Frost Drake');
  dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:350,y:310});
  const state=await snapshot(),enemy=state.tokens.find((t:any)=>t.kind==='monster'),pc=state.tokens.find((t:any)=>t.refId===druk.id);
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await page.waitForTimeout(1000);
  const point=(id:string)=>page.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},id);
  const aim=async()=>{const e=await point(enemy.id),p=await point(pc.id);await page.mouse.click(e.x,e.y);await page.mouse.click(p.x,p.y,{button:'right'});};
  // Exercise the actual right-click action, and inspect the initial title before
  // a completed RollReveal exists. The server still rolls real physical dice.
  for(let attempt=0;attempt<10;attempt++){
   const count=(await snapshot()).rollLog.length;
   await aim();await page.getByRole('dialog',{name:'Token actions'}).getByRole('button',{name:/Claw/}).click();
   await expect(page.locator('.roll-reveal-who')).toContainText('Frost Drake',{timeout:30000});
   await expect.poll(async()=>(await snapshot()).rollLog.length,{timeout:30000}).toBeGreaterThan(count);
   const hit=(await snapshot()).rollLog.filter((r:any)=>r.pending).at(-1);
   if(hit?.pending)break;
   await expect(page.locator('.roll-reveal-backdrop')).toBeHidden({timeout:30000});
  }
  const hit=(await snapshot()).rollLog.filter((r:any)=>r.pending).at(-1);expect(hit?.pending).toBeTruthy();
  const damage=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn');await expect(damage).toBeVisible({timeout:30000});
  const box=(await damage.boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(page.locator('.roll-reveal-who')).toContainText('Frost Drake',{timeout:30000});
  await expect.poll(async()=>(await snapshot()).characters.find((c:any)=>c.id===druk.id).curHp,{timeout:45000}).toBeLessThan(100);
  await expect(page.locator('.roll-reveal-backdrop')).toBeHidden({timeout:30000});
  const hp=(await snapshot()).characters.find((c:any)=>c.id===druk.id).curHp,first=frames.length;
  await page.evaluate(()=>{
   const seen:{id:string;kind:string|null}[]=[];(window as any).__breathScreens=seen;
   const observer=new MutationObserver(()=>{
    const card=document.querySelector('.roll-reveal');
    const id=card?.getAttribute('data-roll-id');if(!id)return;
    if(seen.at(-1)?.id!==id)seen.push({id,kind:card?.getAttribute('data-reveal-kind')??null});
   });observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-roll-id','data-reveal-kind']});
   (window as any).__breathObserver=observer;
  });
  await aim();await page.getByRole('dialog',{name:'Token actions'}).locator('.fm-spell-attack').filter({hasText:'Ice Breath'}).click();
  await expect(page.locator('.roll-reveal-who')).toContainText('Frost Drake',{timeout:30000});
  await expect.poll(()=>frames.slice(first).some(f=>/CON.*Sav|Sav.*CON/i.test(f.label)),{timeout:45000}).toBe(true);
  await expect.poll(async()=>(await snapshot()).characters.find((c:any)=>c.id===druk.id).curHp,{timeout:45000}).toBeLessThan(hp);
  const resolved=await snapshot(),cast=resolved.rollLog.find((r:any)=>r.apply?.save==='CON');
  expect(cast.apply.consumedTargets).toContain(pc.id);
  expect(resolved.rollLog.some((r:any)=>r.reveal?.kind==='check'&&r.reveal?.attacker?.includes('Druk')&&/CON.*Sav|Sav.*CON/i.test(r.reveal?.title))).toBe(true);
  expect(frames.filter(f=>f.dmDice).every(f=>f.attacker?.includes('Frost Drake'))).toBe(true);
  expect(cast.reveal.presentedLive).toBe(true);
  await expect(page.locator('.roll-reveal-backdrop')).toBeHidden({timeout:30000});
  const screens=await page.evaluate(()=>{(window as any).__breathObserver.disconnect();return (window as any).__breathScreens;});
  // Only the streamed damage tray and then its saving throw; no third damage tray.
  expect([...new Set(screens.map((s:any)=>s.id))]).toHaveLength(2);
  const done=frames.slice(first).filter(f=>f.done);
  expect(done.some(f=>f.calculation?.kind==='damage')).toBe(true);
 }finally{dm.disconnect();}
});
