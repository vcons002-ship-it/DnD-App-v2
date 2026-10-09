import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {hasLineOfSight} from '../shared/mapWalls';

test.use({serviceWorkers:'block'});
const sockets:Socket[]=[];test.afterEach(()=>sockets.splice(0).forEach(s=>s.disconnect()));
async function fixture(page:Page,request:APIRequestContext){
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Saved arch test'}})).json();
 const image=await sharp(Buffer.from('<svg width="800" height="600"><rect width="800" height="600" fill="#514735"/><path d="M40 250H760V290H40Z" fill="#999"/><path d="M250 250H450V290H250Z" fill="#d9aa64"/><path d="M255 265H445" stroke="#32291e" stroke-width="3"/></svg>')).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Arch room',image:{name:'arch.png',mimeType:'image/png',buffer:image}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});sockets.push(socket);
 const snapshot=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const s=await snapshot();socket.emit('map:setActive',{mapId:map.id});
 socket.emit('map:editWalls',{mapId:map.id,add:{id:'building',kind:'rectangle',ax:40,ay:250,bx:760,by:290}});
 socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});socket.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});
 socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:s.characters.find((c:any)=>c.name==='Druk').id,x:350,y:360});await snapshot();
 const {source}=await(await request.get(`/api/maps/${map.id}/analysis-source`,{headers})).json();
 let automatic:unknown,calls=0;
 await page.route(`**/api/maps/${map.id}/arch-draft`,async route=>{
  automatic=route.request().postDataJSON().automatic;calls++;
  await route.fulfill({json:{version:1,id:'browser-arches',source,maskImagePath:map.imagePath,arches:[{id:'ai-arch-1',kind:'rectangle',ax:250,ay:250,bx:450,by:290}],uncertain:[{id:'uncertain-arch-1',kind:'rectangle',ax:600,ay:250,bx:700,by:290}]}});
 });
 await page.setViewportSize({width:1440,height:1000});await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
 await page.getByRole('button',{name:'Walls',exact:true}).click();await page.getByRole('button',{name:'AI analysis',exact:true}).click();await page.getByRole('button',{name:'Suggest arches / overpasses',exact:true}).click();
 const options=page.getByRole('dialog',{name:'Map analysis options'});await expect(options.getByRole('checkbox',{name:'Arches / overpasses',exact:true})).toBeChecked();await expect(options.getByRole('checkbox',{name:'Walls',exact:true})).not.toBeChecked();expect(calls).toBe(0);
 await options.getByRole('button',{name:'Analyze selected features',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Map setup draft'});await expect(review.getByLabel('Arch / overpass 1',{exact:true})).toBeChecked();expect(automatic).toBe(false);
 await expect(review.getByText('1 uncertain spans (orange): not applied.',{exact:true})).toBeVisible();
 return {map,code,socket,snapshot,review};
}
test('arch review applies only confirmed spans; normal editing deletes the arch and restores the wall',async({page,request},info)=>{
 const f=await fixture(page,request);await page.screenshot({path:info.outputPath('arch-review.png')});
 await f.review.getByRole('button',{name:'Apply selected setup',exact:true}).click();await expect(f.review).toBeHidden();
 const saved=(await f.snapshot()).map.walls;expect(saved).toHaveLength(2);expect(saved.filter((w:any)=>w.arch)).toHaveLength(1);expect(hasLineOfSight({x:350,y:200},{x:350,y:350},saved)).toBe(true);
 await page.getByRole('button',{name:'Flat battlefield view',exact:true}).click();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.waitForTimeout(400);
 await page.getByRole('button',{name:'Walls',exact:true}).click();await page.getByRole('button',{name:'Adjust existing walls, doors, windows & lights',exact:true}).click();
 const p=await page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),token=stage.find('.token')[0],p=token.getParent().getAbsoluteTransform().point({x:350,y:270}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};});
 await page.mouse.click(p.x,p.y);await expect(page.getByTestId('delete-map-features')).toHaveText('Delete 1 selected');await page.keyboard.press('Delete');
 await expect.poll(async()=>((await f.snapshot()).map.walls.length)).toBe(1);expect(hasLineOfSight({x:350,y:200},{x:350,y:350},(await f.snapshot()).map.walls)).toBe(false);
});
test('saved original arch artwork fades over a real 3D figure in overhead and tilted views without shader errors',async({page,request},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
 const f=await fixture(page,request);await f.review.getByRole('button',{name:'Apply selected setup',exact:true}).click();await expect(f.review).toBeHidden();
 const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','1',{timeout:60000});await expect(layer).toHaveAttribute('data-arch-art-status','ready');await expect(layer).toHaveAttribute('data-arch-art-active','0');
 const token=(await f.snapshot()).tokens.find((t:any)=>t.kind==='pc');f.socket.emit('token:move',{tokenId:token.id,x:350,y:270});
 await expect(layer).toHaveAttribute('data-arch-art-active','1');await expect.poll(async()=>Number(await layer.getAttribute('data-arch-art-fade'))).toBeGreaterThan(.55);
 await page.screenshot({path:info.outputPath('under-arch-overhead.png')});
 await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect.poll(async()=>Number(await layer.getAttribute('data-arch-art-fade'))).toBeGreaterThan(.75);await page.screenshot({path:info.outputPath('under-arch-tilted.png')});
 f.socket.emit('token:move',{tokenId:token.id,x:350,y:190});await expect(layer).toHaveAttribute('data-arch-art-active','0');await expect.poll(async()=>Number(await layer.getAttribute('data-arch-art-fade'))).toBeLessThan(.01);expect(errors).toEqual([]);
});
test('arch analysis requires DM authentication',async({request})=>{
 expect((await request.post('/api/maps/anything/arch-draft',{data:{}})).status()).toBe(403);
});
test('a joined player can drag through the center but cannot pass through an arch support',async({page,browser,request})=>{
 const f=await fixture(page,request);await f.review.getByRole('button',{name:'Apply selected setup',exact:true}).click();await expect(f.review).toBeHidden();
 const player=await browser.newPage();
 try{
  await player.addInitScript(()=>{const id=crypto.randomUUID();localStorage.setItem('dnd.playerId',id);localStorage.setItem(`dnd.tokenView:${id}`,'2d');});
  await player.goto(`/join?code=${f.code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(player.getByTestId('player-hud')).toBeVisible();
  const token=(await f.snapshot()).tokens.find((t:any)=>t.kind==='pc');
  const position=()=>f.snapshot().then(s=>s.tokens.find((t:any)=>t.id===token.id));
  const point=(x:number,y:number)=>player.evaluate(({id,x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),node=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},{id:token.id,x,y});
  const drag=async(x:number,y:number)=>{const t=await position(),a=await point(t.x,t.y),b=await point(x,y);await player.mouse.move(a.x,a.y);await player.mouse.down();await player.mouse.move(b.x,b.y,{steps:15});await player.mouse.up();};
  await drag(350,190);await expect.poll(async()=>(await position()).y).toBeLessThan(250);
  await player.waitForTimeout(500);await drag(260,190);await expect.poll(async()=>(await position()).x).toBeLessThan(280);
  await player.waitForTimeout(500);await drag(260,360);await player.waitForTimeout(500);expect((await position()).y).toBeLessThan(250);
 }finally{await player.close();}
});
