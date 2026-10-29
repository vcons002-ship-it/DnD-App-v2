import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

for(const role of ['dm','player'] as const)test(`${role} rotates using desktop buttons and a captured secondary drag without a browser image menu`,async({page,request},info)=>{
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Map rotation regression'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const initial=await snapshot(),image=await sharp({create:{width:1000,height:700,channels:3,background:'#354039'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Rotation room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
  dm.emit('map:setActive',{mapId:map.id});dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name==='Druk').id,x:500,y:350});
  for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});await snapshot();
  await page.addInitScript(()=>{
   localStorage.setItem('dnd.playerId','rotation-test');localStorage.setItem('dnd.tokenView:rotation-test','2d');
   (window as any).__contextMenus=[];
   document.addEventListener('contextmenu',e=>{queueMicrotask(()=>(window as any).__contextMenus.push({prevented:e.defaultPrevented,target:(e.target as HTMLElement).className}));});
  });
  await page.setViewportSize({width:1500,height:1000});
  if(role==='dm'){
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  }else{
   await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  }
  const left=page.getByRole('button',{name:'Rotate map left',exact:true}),right=page.getByRole('button',{name:'Rotate map right',exact:true});
  await expect(left).toBeVisible();await expect(right).toBeVisible();
  const rotation=()=>page.evaluate(()=>Number(localStorage.getItem('dnd.battlefieldRotation:rotation-test')??0));
  await right.click();await expect.poll(rotation).toBe(15);await left.click();await expect.poll(rotation).toBe(0);
  const box=(await page.locator('.konvajs-content').first().boundingBox())!,x=box.x+box.width*.6,y=box.y+box.height*.3;
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});
  // WebKit can send contextmenu to the wrapper owning pointer capture.
  expect(await page.locator('.stage-wrap').evaluate(el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})))).toBe(true);
  await page.mouse.move(x+100,y,{steps:8});await page.mouse.up({button:'right'});await expect.poll(rotation).toBeCloseTo(35,0);
  const menus=await page.evaluate(()=>(window as any).__contextMenus);expect(menus.length).toBeGreaterThan(0);expect(menus.every((m:any)=>m.prevented)).toBe(true);
  await page.getByRole('button',{name:'Reset battlefield rotation',exact:true}).click();await expect.poll(rotation).toBe(0);
  // Native token actions still receive contextmenu after the capture handler.
  const p=await page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),token=stage.find('.token')[0],p=token.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};});
  await page.mouse.click(p.x,p.y,{button:'right'});await expect(page.getByRole('dialog',{name:'Token actions',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close token actions',exact:true}).click();
  await page.screenshot({path:info.outputPath(`${role}-rotation-controls.png`)});
  await page.setViewportSize({width:430,height:932});await expect(left).toBeVisible();await expect(right).toBeVisible();
  await page.setViewportSize({width:1500,height:1000});await page.getByRole('checkbox',{name:'Legacy mode',exact:false}).check();
  await expect(left).toBeDisabled();await expect(right).toBeDisabled();
  await page.getByRole('checkbox',{name:'Legacy mode',exact:false}).uncheck();
  await expect(right).toBeEnabled();await right.click();await expect.poll(rotation).toBe(15);
 }finally{dm.disconnect();}
});
