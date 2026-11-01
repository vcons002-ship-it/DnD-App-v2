import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

for(const size of [{width:320,height:740},{width:390,height:844},{width:430,height:900},{width:520,height:900},{width:521,height:900},{width:900,height:700},{width:1222,height:1144},{width:844,height:390}]){
 test(`compact touch toolbar ${size.width}x${size.height}`,async({browser,request},testInfo)=>{
  const context=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-dice-rendering','2d');});
  const page=await context.newPage(),headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'The campaign with a deliberately long name'}})).json();
  const buffer=await sharp({create:{width:1000,height:800,channels:3,background:'#565447'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
  const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
  try{
   await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
   dm.emit('map:setActive',{mapId:map.id});
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
   const bar=page.locator('header.topbar');await expect(bar.getByRole('button',{name:'Map tools',exact:true})).toBeVisible();
   const bounds=await bar.boundingBox();expect(bounds!.height).toBeLessThanOrEqual(size.width<=700?106:58);
   if(size.width<=520)await expect(bar.locator('.session-title')).toBeHidden();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   for(const name of ['View','Map tools','Map features','Campaign menu','Settings','Rotate map left','Rotate map right']){
    const b=await bar.getByRole('button',{name,exact:true}).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(size.width);
   }
   expect(await bar.getByRole('button',{name:'Map features',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
   const features=await bar.getByRole('button',{name:'Map features',exact:true}).boundingBox(),tools=await bar.getByRole('button',{name:'Map tools',exact:true}).boundingBox();
   expect(features!.x+features!.width<=tools!.x || tools!.x+tools!.width<=features!.x || features!.y+features!.height<=tools!.y || tools!.y+tools!.height<=features!.y).toBe(true);
   await page.screenshot({path:testInfo.outputPath('compact-toolbar.png')});
   await bar.getByRole('button',{name:'View',exact:true}).click();
   const view=page.getByRole('dialog',{name:'View',exact:true});await expect(view).toBeVisible();
   await expect(view.getByRole('checkbox',{name:/Legacy mode/})).toBeVisible();
   await expect(bar.getByRole('button',{name:'Rotate map left'})).toBeDisabled();
   await view.getByRole('checkbox',{name:/Legacy mode/}).uncheck();
   await view.getByLabel('Battlefield visibility').selectOption('player');
   const popup=await view.boundingBox();expect(popup!.x+popup!.width).toBeLessThanOrEqual(size.width);expect(popup!.y+popup!.height).toBeLessThanOrEqual(size.height);
   await page.keyboard.press('Escape');await expect(view).toBeHidden();
   const right=bar.getByRole('button',{name:'Rotate map right'});
   await expect(right).toBeEnabled();await right.click();
   await bar.getByRole('button',{name:'View',exact:true}).click();
   await expect(page.getByRole('button',{name:'Reset battlefield rotation'})).toBeVisible();
   await page.keyboard.press('Escape');
   await bar.getByRole('button',{name:'Map tools',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'Map tools',exact:true}).getByRole('button',{name:'Map features',exact:true})).toHaveCount(0);
   await bar.getByRole('button',{name:'Map features',exact:true}).click();
   await expect(page.getByLabel('Map feature tools')).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByLabel('Map feature tools')).toBeHidden();
   await bar.getByRole('button',{name:'Map tools',exact:true}).click();
   await bar.getByRole('button',{name:'Campaign menu',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'Map tools',exact:true})).toBeHidden();
   const campaign=page.getByRole('dialog',{name:'Campaign menu',exact:true});await expect(campaign.getByText(`Code: ${code}`,{exact:false})).toBeVisible();await expect(campaign.getByText('The campaign with a deliberately long name',{exact:false})).toBeVisible();
   await expect(campaign.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
   await page.keyboard.press('Escape');await expect(campaign).toBeHidden();
   await bar.getByRole('button',{name:'Settings',exact:true}).click();
   await expect(page.locator('.modal-head h3',{hasText:'Settings'})).toBeVisible();
   await page.locator('.modal-head').getByRole('button',{name:'\u2715'}).click();
   await expect(page.locator('.modal-head h3',{hasText:'Settings'})).toBeHidden();
   await page.setViewportSize({width:1440,height:900});
   await expect(bar.getByRole('button',{name:'View',exact:true})).toBeHidden();
   await expect(bar.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
   await expect(bar.getByLabel('Battlefield visibility')).toBeVisible();
   await expect(bar.getByRole('checkbox',{name:/Legacy mode/})).toBeVisible();
  }finally{dm.disconnect();await context.close();}
 });
}

test('player can reach rotation buttons on a narrow phone',async({browser,request})=>{
 const context=await browser.newContext({viewport:{width:320,height:740},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-dice-rendering','2d');});
 const page=await context.newPage(),headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Player rotation'}})).json();
 const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#565447'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 try{
  await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  dm.emit('map:setActive',{mapId:map.id});
  await expect.poll(async()=> (await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot.activeMapId).toBe(map.id);
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  const bar=page.locator('header.topbar');
  for(const name of ['Rotate map left','Rotate map right','View','Map tools']){
   const button=bar.getByRole('button',{name,exact:true});await expect(button).toBeVisible();
   const rect=await button.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{dm.disconnect();await context.close();}
});
