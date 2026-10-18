import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';

for(const role of ['dm','player'] as const)test(`${role} chooses annotation colors inside the dropdown and draws with the selected color`,async({page,request},info)=>{
 test.setTimeout(60000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Annotation palette'}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  await snapshot();const image=await sharp({create:{width:1000,height:700,channels:3,background:'#354039'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Drawing board',image:{name:'board.png',mimeType:'image/png',buffer:image}}})).json();
  admin.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});await snapshot();
  await page.setViewportSize({width:1366,height:900});
  if(role==='dm'){
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  }else{
   await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  }
  const trigger=page.getByRole('button',{name:'Annotate',exact:true}),menu=page.getByRole('dialog',{name:'Annotation tools',exact:true});
  await expect(trigger).toBeVisible();await expect(page.locator('.anno-swatch')).toHaveCount(0);
  await trigger.click();await expect(menu).toBeVisible();await expect(menu.locator('.anno-swatch')).toHaveCount(5);
  await menu.getByRole('button',{name:'Blue',exact:true}).click();await expect(menu.getByRole('button',{name:'Blue',exact:true})).toHaveAttribute('aria-pressed','true');
  await menu.getByRole('button',{name:'Freehand pen',exact:false}).click();await expect(menu).toHaveCount(0);await expect(trigger).toContainText('Pen');
  const box=(await page.locator('.konvajs-content').first().boundingBox())!;
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.45);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55,{steps:10});await page.mouse.up();
  await expect.poll(async()=>(await snapshot()).annotations.filter((a:any)=>a.kind==='freehand').length).toBe(1);
  expect((await snapshot()).annotations.find((a:any)=>a.kind==='freehand').color).toBe('#4cc9f0');
  await trigger.click();await expect(menu.getByRole('button',{name:'Blue',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();await expect(trigger).toContainText('Pen');
  await page.setViewportSize({width:430,height:932});await openToolbarGroup(page,'Map tools');await trigger.click();await expect(menu).toBeVisible();
  const bounds=(await menu.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(430);expect(bounds.y+bounds.height).toBeLessThanOrEqual(932);
  await page.screenshot({path:info.outputPath(`${role}-mobile-annotation-palette.png`)});
  await menu.getByRole('button',{name:'Done annotating',exact:true}).click();await expect(menu).toHaveCount(0);await expect(trigger).toContainText('Annotate');
 }finally{admin.disconnect();}
});
