import {test,expect,type Page,type APIRequestContext} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({skipRenderingChoice:false});
const headers={'x-dm-passphrase':DM_SECRET};
const graphicsRequest=(url:string)=>/\.glb(?:\?|$)|\/(?:MiniatureLayer|materialDice|diceTrayRenderer)-/.test(url);
async function fixture(request:APIRequestContext){
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Legacy regression'}})).json();
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#65533f'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Legacy room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>{const r=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await snapshot(),pc=initial.characters.find((c:any)=>c.name==='Druk');
 dm.emit('map:setActive',{mapId:map.id});dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:200,y:300});
 dm.emit('map:editWalls',{mapId:map.id,add:{id:'divider',kind:'rectangle',ax:400,ay:0,bx:410,by:600}});
 dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[{id:'torch',x:200,y:300,radiusFt:20,heightFt:6,color:'warm',intensity:1,flicker:true,visibleTorch:true}]}});
 await snapshot();return{code,map,dm,snapshot};
}
async function blockWebgl(page:Page){
 await page.addInitScript(()=>{
   (window as any).__webglRequests=[];
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
     if(kind.includes('webgl')){(window as any).__webglRequests.push(kind);return null;}
     return (original as any).call(this,kind,...args);
   } as any;
 });
}
async function loginDm(page:Page,code:string){
 await page.goto(`/dm?code=${code}`);await page.getByRole('button',{name:'Start in legacy mode',exact:true}).click();
 await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
}
const position=(page:Page,x:number,y:number)=>page.evaluate(({x,y})=>{
 const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=stage.find('.token')[0],p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};
},{x,y});
async function expectViewportCanvases(page:Page){
 await expect.poll(()=>page.evaluate(()=>{
  const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
  return !!stage&&stage.getLayers().every((layer:any)=>[layer.getCanvas(),layer.getHitCanvas()].every(canvas=>canvas._canvas.width===stage.width()&&canvas._canvas.height===stage.height()));
 })).toBe(true);
}

test('startup gates both roles before campaign imports and persists the chosen local mode',async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('dnd-environment-quality'))localStorage.setItem('dnd-environment-quality','high');});
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));await blockWebgl(page);
 for(const path of ['/dm','/join']){
  await page.goto(path);
  await expect(page.getByRole('main',{name:'Choose rendering mode'})).toBeVisible();
  const advice=page.getByLabel('When to use server managed rendering');
  await advice.click();
  await expect(page.locator('.server-rendering-advice-panel')).toContainText('Compare both settings on the same map');
  await page.getByRole('button',{name:'Close advice'}).click();
  if(path==='/dm')await page.screenshot({path:'test-results/legacy-startup-choice.png'});
  expect(requests.filter(u=>graphicsRequest(u)||/\/(DmRoute|PlayerRoute)-/.test(u))).toEqual([]);
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('When to use server managed rendering').click();
 const box=(await page.getByRole('region',{name:'Server rendering advice'}).boundingBox())!;
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
 await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Server rendering advice'})).toBeHidden();
 await page.setViewportSize({width:1280,height:720});
 await page.getByRole('button',{name:'Start in legacy mode',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Join Game',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('dnd-environment-quality'))).toBe('legacy');
 await page.reload();await expect(page.getByRole('heading',{name:'Join Game',exact:true})).toBeVisible();
 await expect(page.getByRole('main',{name:'Choose rendering mode'})).toBeHidden();
 await page.getByRole('checkbox',{name:'Legacy mode',exact:false}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('dnd-environment-quality'))).toBe('high');
 expect(await page.evaluate(()=>(window as any).__webglRequests)).toEqual([]);
});

test('Legacy 2D dice animate and finish with server results without loading WebGL or 3D graphics',async({page,request})=>{
 const f=await fixture(request),requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 try{
  f.dm.emit('session:setHideDmRolls',{hide:false});await f.snapshot();
  await page.addInitScript(()=>localStorage.setItem('dnd-dice-rendering','2d'));
  await blockWebgl(page);await page.setViewportSize({width:1500,height:1000});await loginDm(page,f.code);
  await page.getByRole('button',{name:'Roll a d20',exact:true}).click();
  await expect(page.getByTestId('dice-2d-animation')).toBeVisible();
  await expect(page.locator('.dice-2d-animation canvas')).toHaveAttribute('data-orientation','rolling');
  await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-status','settled',{timeout:20000});
  await expect(page.locator('.tray-die-result[data-filled="true"]')).toHaveCount(1,{timeout:15000});
  await expect.poll(async()=>(await f.snapshot()).rollLog.length,{timeout:60000}).toBeGreaterThan(0);
  const result=(await f.snapshot()).rollLog.at(-1);expect(result.total).toBeGreaterThanOrEqual(1);expect(result.total).toBeLessThanOrEqual(20);
  expect(requests.filter(graphicsRequest)).toEqual([]);expect(await page.evaluate(()=>(window as any).__webglRequests)).toEqual([]);
 }finally{f.dm.disconnect();}
});

test('legacy DM edits lights and walls with basic occluded visibility on a throttled CPU without GPU or model loads',async({page,request})=>{
 const f=await fixture(request);const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 try{
  await blockWebgl(page);await page.setViewportSize({width:1500,height:1000});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await loginDm(page,f.code);
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode','legacy');
  await expectViewportCanvases(page);
  await page.setViewportSize({width:1400,height:900});await expectViewportCanvases(page);
  await page.setViewportSize({width:1500,height:1000});await expectViewportCanvases(page);
  await expect(page.getByRole('button',{name:'3D player tokens',exact:true})).toBeDisabled();
  await page.getByLabel('Battlefield visibility').selectOption('player');
  const vision=page.getByTestId('legacy-vision');await expect(vision).toHaveAttribute('data-origin-count','1');
  await expect(vision).toHaveAttribute('data-geometry-source','server');
  await expect(page.getByTestId('player-vision')).toHaveCount(0);
  // Full-rate light flicker would move this counter continuously while idle.
  await page.waitForTimeout(700);const before=await vision.getAttribute('data-draw-count');await page.waitForTimeout(700);
  expect(Number(await vision.getAttribute('data-draw-count'))-Number(before)).toBeLessThanOrEqual(2);
  const left=await position(page,250,450),right=await position(page,600,450);
  const screenshot=await page.screenshot(),rgb=async(p:{x:number;y:number})=>[...await sharp(screenshot).extract({left:Math.round(p.x),top:Math.round(p.y),width:1,height:1}).removeAlpha().raw().toBuffer()];
  expect(Math.max(...await rgb(left))).toBeGreaterThan(30);expect(Math.max(...await rgb(right))).toBeLessThan(20);
  await page.getByRole('button',{name:'Map features',exact:true}).click();await page.getByRole('button',{name:'Add features',exact:true}).click();
  await page.getByRole('button',{name:'Place light on map',exact:true}).click();
  for(const x of [220,300]){const p=await position(page,x,400);await page.mouse.click(p.x,p.y);}
  await expect.poll(async()=>(await f.snapshot()).map.environment.lights.length).toBe(3);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Map features',exact:true}).click();await page.getByRole('button',{name:'Draw wall rectangles',exact:true}).click();
  const a=await position(page,120,480),b=await position(page,300,495);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await f.snapshot()).map.walls.length).toBe(2);await expect(page.getByLabel('Battlefield visibility')).toHaveValue('player');
  await page.keyboard.press('Escape');await page.screenshot({path:'test-results/legacy-dm-player-visibility.png'});
  expect(requests.filter(graphicsRequest)).toEqual([]);expect(await page.evaluate(()=>(window as any).__webglRequests)).toEqual([]);
  // A fresh reload must apply Legacy before any campaign renderer mounts.
  await page.reload();await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode','legacy');
  await expectViewportCanvases(page);
  expect(requests.filter(graphicsRequest)).toEqual([]);
 }finally{f.dm.disconnect();}
});

test('DM can place a character while viewing player visibility',async({page,request})=>{
 const f=await fixture(request);
 try{
  await page.setViewportSize({width:1500,height:1000});await loginDm(page,f.code);
  await page.getByLabel('Battlefield visibility').selectOption('player');
  await page.getByRole('button',{name:'Creatures',exact:true}).click();
  await page.locator('.spawn-row').filter({hasText:'Varis'}).click();
  await expect(page.locator('.place-banner')).toBeVisible();
  const before=(await f.snapshot()).tokens.length,p=await position(page,280,400);
  await page.mouse.click(p.x,p.y);
  await expect.poll(async()=>(await f.snapshot()).tokens.length).toBe(before+1);
  await expect(page.getByLabel('Battlefield visibility')).toHaveValue('player');
 }finally{f.dm.disconnect();}
});

test('a legacy player shares a table with a standard DM without changing map atmosphere or other browser preferences',async({page,browser,request})=>{
 const f=await fixture(request),other=await browser.newContext({viewport:{width:1500,height:1000}}),standard=await other.newPage();
 const legacyRequests:string[]=[];page.on('request',r=>legacyRequests.push(r.url()));await blockWebgl(page);
 try{
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Start in legacy mode',exact:true}).click();await page.getByRole('button',{name:'Join',exact:true}).click();
  await expect(page.locator('.player-fantasy')).toBeVisible();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(page.locator('[data-liquid-renderer="fallback"]')).toBeVisible();
  await standard.goto(`/dm?code=${f.code}`);await standard.getByRole('button',{name:'Start in 3D mode',exact:true}).click();
  await standard.locator('input[type=password]').fill(DM_SECRET);await standard.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect(standard.locator('.stage-wrap')).toHaveAttribute('data-render-mode','standard');
  expect(await standard.evaluate(()=>localStorage.getItem('dnd-environment-quality'))).toBe('low');
  expect(await page.evaluate(()=>localStorage.getItem('dnd-environment-quality'))).toBe('legacy');
  expect((await f.snapshot()).map.environment).toMatchObject({enabled:true,lighting:'dungeon',heavyDarkness:true});
  expect(legacyRequests.filter(graphicsRequest)).toEqual([]);expect(await page.evaluate(()=>(window as any).__webglRequests)).toEqual([]);
 }finally{f.dm.disconnect();await other.close();}
});
