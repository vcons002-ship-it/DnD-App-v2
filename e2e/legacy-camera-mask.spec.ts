import {openToolbarGroup} from './helpers/mobileToolbar';
import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
for(const assisted of [false,true])for(const role of ['player','dm'] as const)test(`Legacy ${role} camera cannot expose darkness with assistance ${assisted}`,async({page,browser,request})=>{
 test.setTimeout(120000);const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable camera concealment'}})).json();
 const image=await sharp({create:{width:1800,height:1200,channels:3,background:'#e63b1f'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Camera room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 let companion:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  const s=await state(),pc=s.characters.find((c:any)=>c.name==='Druk');admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:20,feetPerSquare:5,widthFt:450,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('map:editWalls',{mapId:map.id,add:{id:'occluder',ax:600,ay:0,bx:600,by:1200}});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',mist:false,lights:[]}});admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:300,y:300});await state();
  const init=(assisted:boolean)=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-server-rendering',assisted?'on':'off');};
  await page.addInitScript(init,assisted);await page.setViewportSize({width:1440,height:900});
  if(role==='player'){await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();}
  else{companion=await browser.newContext();await companion.addInitScript(init,assisted);const p=await companion.newPage();await p.goto(`/join?code=${code}`);await p.getByRole('button',{name:'Join',exact:true}).click();await p.locator('.claim-row').filter({hasText:'Druk'}).click();await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');}
  await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source',assisted?'server':'client');await page.waitForTimeout(700);
  // Check the real transform in the same JS turn as the layer's pan handler.
  // A delayed React commit/500ms refresh cannot satisfy this check.
  const result=await page.evaluate(()=>{
   const w=window as any,stage=w.Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable()),start=layer.position();
   const check=()=>{
    const root=document.querySelector('[data-testid=legacy-vision]')!,view={x:layer.x(),y:layer.y(),scale:layer.scaleX()},errors:number[]=[];
    if(root.tagName.toLowerCase()==='svg')for(const g of root.querySelectorAll('g[transform]')){const m=(g as SVGGraphicsElement).transform.baseVal.consolidate()!.matrix;errors.push(Math.abs(m.e-view.x),Math.abs(m.f-view.y),Math.abs(m.a-view.scale),Math.abs(m.d-view.scale));}
    else{const world=root.querySelector('[data-testid=legacy-mask-world]')??root.querySelector('div[style*="translate("]');if(world){const m=new DOMMatrix(getComputedStyle(world).transform);errors.push(Math.abs(m.e-view.x),Math.abs(m.f-view.y),Math.abs(m.a-view.scale),Math.abs(m.d-view.scale));}}
    for(const plane of document.querySelectorAll<HTMLElement>('.stage-wrap [data-world-x]')){const x=Number(plane.dataset.worldX),y=Number(plane.dataset.worldY),scale=Number(plane.dataset.rasterScale),m=new DOMMatrix(getComputedStyle(plane.firstElementChild!).transform);errors.push(Math.abs(parseFloat(plane.style.left)-(view.x+x*view.scale)),Math.abs(parseFloat(plane.style.top)-(view.y+y*view.scale)),Math.abs(m.a-view.scale/scale));}
    return {checked:errors.length,maxError:Math.max(...errors)};
   };
   w.__checkLegacyCamera=check;w.__cameraSamples=[];
   layer.on('draw.cameraMask',()=>queueMicrotask(()=>w.__cameraSamples.push(check())));
   const samples=[];
   for(const [dx,dy] of [[-600*layer.scaleX(),0],[175,90],[-90,-70],[0,0]]){layer.position({x:start.x+dx,y:start.y+dy});layer.fire('dragmove',{target:layer,evt:new MouseEvent('mousemove')},true);samples.push(check());}
   // Leave the hidden orange area under the former vision hole.
   layer.position({x:start.x-600*layer.scaleX(),y:start.y});layer.fire('dragmove',{target:layer,evt:new MouseEvent('mousemove')},true);
   const rect=stage.getContent().getBoundingClientRect(),hidden=layer.getAbsoluteTransform().point({x:900,y:300});
   return {samples,hidden:{x:Math.round(rect.left+hidden.x),y:Math.round(rect.top+hidden.y)}};
  });
  for(const sample of result.samples){expect(sample.checked).toBeGreaterThan(0);expect(sample.maxError).toBeLessThan(.01);}
  const pixel=await page.screenshot({clip:{...result.hidden,width:2,height:2}}),raw=await sharp(pixel).removeAlpha().raw().toBuffer();expect(Math.max(...raw)).toBeLessThan(30);
  // Commit the pan and exercise real wheel zoom. Check every canvas-draw turn.
  await page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable());layer.fire('dragend',{target:layer,evt:new MouseEvent('mouseup')},true);});
  await page.mouse.move(700,400);for(const delta of [-240,240,-240]){await page.mouse.wheel(0,delta);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const sample=await page.evaluate(()=>(window as any).__checkLegacyCamera());expect(sample.maxError).toBeLessThan(.01);}
  const samples=await page.evaluate(()=>(window as any).__cameraSamples);expect(samples.length).toBeGreaterThan(0);expect(Math.max(...samples.map((s:any)=>s.maxError))).toBeLessThan(.01);
  if(assisted){
   // Observe before triggering the short (400 ms) animation. Polling a removed
   // debug attr or waiting for another automation round trip can miss it.
   await page.evaluate(()=>{const w=window as any;w.__motionCamera=new Promise((resolve,reject)=>{
    const observer=new MutationObserver(()=>{const el=document.querySelector('[data-testid=legacy-motion-mask] img')??document.querySelector('[data-testid=legacy-vision][data-frame]');if(!el)return;observer.disconnect();clearTimeout(timer);
     const stage=w.Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable()),before=el.getAttribute('data-frame');layer.position({x:layer.x()+65,y:layer.y()+40});layer.fire('dragmove',{target:layer,evt:new MouseEvent('mousemove')},true);resolve({...w.__checkLegacyCamera(),before,after:el.getAttribute('data-frame')});
    });const timer=setTimeout(()=>{observer.disconnect();reject(Error('Prepared movement mask did not appear'));},20000);observer.observe(document.querySelector('.stage-wrap')!,{childList:true,subtree:true,attributes:true,attributeFilter:['data-frame']});
   });});
   const token=(await state()).tokens.find((t:any)=>t.kind==='pc');admin.emit('token:move',{tokenId:token.id,x:420,y:300});
   const moving=await page.evaluate(()=>(window as any).__motionCamera);
   expect(moving.checked).toBeGreaterThanOrEqual(9);expect(moving.maxError).toBeLessThan(.01);expect(moving.after).toBe(moving.before);
  }
 }finally{admin.disconnect();await companion?.close();}
});
