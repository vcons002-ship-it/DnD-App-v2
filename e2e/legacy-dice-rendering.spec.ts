import {test,expect,webglDisabled} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off'});
for(const [role,preference,blocked] of [['dm','3d',false],['player','3d',false],['dm','2d',false],['player','auto',true]] as const){
 test(`Legacy ${role} dice ${preference}, unavailable WebGL ${blocked}`,async({page,request},info)=>{
  test.skip(preference==='3d'&&webglDisabled,'Requires hardware WebGL');test.setTimeout(120000);
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable Legacy dice rendering'}})).json();
  const buffer=await sharp({create:{width:800,height:600,channels:3,background:'#65533f'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Dice room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
  const admin=io(`http://localhost:${PORT}`,{transports:['websocket']}),frames:any[]=[],errors:string[]=[],requests:string[]=[];
  const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  try{
   const initial=await state(),vanec=initial.characters.find((c:any)=>c.name==='Vanec');
   admin.emit('character:update',{characterId:vanec.id,className:'Sorcerer'});
   admin.on('dice:frame',f=>{frames.push(f);admin.emit('dice:ready',{id:f.id});});
   admin.emit('map:setActive',{mapId:map.id});admin.emit('session:setHideDmRolls',{hide:false});await state();
   await page.addInitScript(({preference,blocked})=>{
    localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-dice-rendering',preference);
    (window as any).__webglRequests=0;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
     if(kind.includes('webgl')){(window as any).__webglRequests++;if(blocked)return null;}
     const context=(original as any).call(this,kind,...args);
     if(kind.includes('webgl')&&context)(window as any).__diceGlCanvas=this;
     return context;
    } as any;
   },{preference,blocked});
   await page.setViewportSize({width:1400,height:950});
   if(role==='dm'){await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();}
   else{await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();}
   await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode','legacy');
   // No dice WebGL context or model work on initial Legacy campaign load.
   await page.waitForTimeout(500);expect(await page.evaluate(()=>(window as any).__webglRequests)).toBe(0);
   for(const sides of [20,100]){
    const start=frames.length,logCount=(await state()).rollLog.length;
    if(sides===20)await page.getByRole('button',{name:'Roll a d20',exact:true}).click();
    else{
     if(role==='player')await page.getByRole('button',{name:'More dice',exact:true}).click();
     else await page.getByRole('button',{name:'Roll a d20',exact:true}).hover();
     await page.locator('.dice-quick-menu').getByRole('button',{name:'d100',exact:true}).click();
    }
    const tray=page.locator('.physics-dice-tray'),count=sides===100?2:1,mode=preference==='2d'||blocked?'2d':'3d';
    await expect(tray).toHaveAttribute('data-renderer',mode,{timeout:30000});
    if(mode==='2d'){
     await expect(page.getByTestId('dice-2d-animation')).toBeVisible();
     await expect(page.locator('.dice-2d-animation canvas').first()).toHaveAttribute('data-orientation','rolling');
     await expect(page.locator('.dice-2d-animation canvas')).toHaveCount(count);
    }else{
     await expect(tray).toHaveAttribute('data-material',role==='player'?'volumetric-glass':'purple-resin',{timeout:30000});
     await expect.poll(()=>tray.locator('.dice-tray-canvas').evaluate(el=>Number((el as HTMLElement).dataset.physicsElapsed??0)),{timeout:30000}).toBeGreaterThan(0);
    }
    await expect(tray).toHaveAttribute('data-status','settled',{timeout:30000});
    await expect(tray.locator('.tray-die-result[data-filled="true"]')).toHaveCount(count,{timeout:20000});
    const final=frames.slice(start).findLast(f=>f.done);expect(final).toBeTruthy();
    const expected=sides===100?((final.values[0]-1)*10+final.values[1]-1||100):final.values[0];
    if(mode==='2d'){
     const displayed=await page.locator('.dice-2d-animation canvas').evaluateAll(nodes=>nodes.map(el=>Number((el as HTMLElement).dataset.value)));
     expect(displayed).toEqual(sides===100?[(final.values[0]-1)*10,final.values[1]-1]:final.values);
    }
    await page.screenshot({path:info.outputPath(`${role}-${preference}-d${sides}.png`)});
    await expect.poll(async()=>(await state()).rollLog.length,{timeout:30000}).toBeGreaterThan(logCount);
    const result=(await state()).rollLog.at(-1);expect(result.total).toBe(expected);
    await expect(page.locator('[data-live-dice=true]')).toHaveCount(0,{timeout:20000});await page.keyboard.press('Escape');await expect(page.locator('.roll-reveal-backdrop')).toBeHidden({timeout:15000});
   }
   if(role==='dm'&&preference==='3d'){
    const before=(await state()).rollLog.length;
    await page.evaluate(()=>{const gl=(window as any).__diceGlCanvas.getContext('webgl2');const extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss extension unavailable');extension.loseContext();});
    await page.getByRole('button',{name:'Roll a d20',exact:true}).click();
    await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-renderer','2d');
    await expect(page.getByTestId('dice-2d-animation')).toBeVisible();
    await expect(page.locator('.tray-die-result[data-filled="true"]')).toHaveCount(1,{timeout:20000});
    await expect.poll(async()=>(await state()).rollLog.length,{timeout:20000}).toBeGreaterThan(before);
   }
   if(role==='dm'&&preference==='2d'){
    admin.emit('session:setHideDmRolls',{hide:true});const before=(await state()).rollLog.length;
    await page.getByRole('button',{name:'Roll a d20',exact:true}).click();
    const review=page.getByRole('region',{name:'Approve hidden result'});
    await expect(review).toBeVisible({timeout:30000});expect((await state()).rollLog.length).toBe(before);
    await expect(page.getByTestId('dice-2d-animation')).toBeVisible();
    await review.getByRole('button',{name:'Apply result',exact:true}).click();
    await expect(review).toBeHidden();await expect.poll(async()=>(await state()).rollLog.length).toBeGreaterThan(before);
   }
   expect(requests.some(u=>/\.glb(?:\?|$)|\/MiniatureLayer-/.test(u))).toBe(false);
   if(preference==='2d'){
    expect(await page.evaluate(()=>(window as any).__webglRequests)).toBe(0);
    expect(requests.some(u=>/\/(?:materialDice|diceTrayRenderer)-/.test(u))).toBe(false);
   }else expect(await page.evaluate(()=>(window as any).__webglRequests)).toBeGreaterThan(0);
   await page.reload();await expect(page.getByLabel('Dice rendering',{exact:true})).toHaveValue(preference);
   expect(errors).toEqual([]);
  }finally{admin.disconnect();}
 });
}
