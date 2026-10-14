import {test,expect} from '@playwright/test';import {io} from 'socket.io-client';import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({serviceWorkers:'block'}); // Make the artificial cold-network delay observable.
test('private door preview highlights before release, and opening reveals a preloaded creature',async({page,request})=>{
 test.setTimeout(90000);
 // A cold, slow model response must complete while the enemy is concealed,
 // rather than putting this network wait on the Open button.
 const modelRequests:string[]=[];
 await page.route(/\/miniatures\/monsters\/goblin.*\.glb$/,async route=>{modelRequests.push(route.request().url());await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
 const headers={'x-dm-passphrase':DM_SECRET};const {code}=await (await request.post('/api/sessions',{headers,data:{name:'Door footprint test'}})).json();
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#514735'}}).png().toBuffer();
 const map=await (await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Door test',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});const snap=async()=>{const r=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
 let s=await snap();const c=s.characters.find((c:any)=>c.name==='Druk');dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:80,locked:false});
 dm.emit('map:editWalls',{mapId:map.id,add:{id:'wall',kind:'rectangle',ax:0,ay:200,bx:800,by:220}});await snap();
 dm.emit('map:editWalls',{mapId:map.id,door:{wallId:'wall',id:'door',ax:300,ay:210,bx:500,by:210}});dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:400,y:390});s=await snap();const t=s.tokens.find((t:any)=>t.refId===c.id),d=s.map.walls.find((w:any)=>w.id==='door'),obj=s.monsters.find((m:any)=>m.id===s.tokens.find((t:any)=>t.id===d.tokenId).refId);
 dm.emit('monster:create',{name:'Concealed goblin',maxHp:20,modelType:'goblin'});const goblin=(await snap()).monsterTemplates.find((m:any)=>m.name==='Concealed goblin');dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:goblin.id,x:400,y:100});await snap();
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','1',{timeout:60000});await page.getByRole('button',{name:'Flat battlefield view'}).click();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.waitForTimeout(800);
 // Project through the claimed PC layer, rather than the first door/object token.
 const position=async(x:number,y:number)=>page.evaluate(({x,y,id})=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=node.getParent().getAbsoluteTransform().point({x,y}),r=s.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},{x,y,id:t.id});
 await expect(page.getByTestId('door-controls')).toBeHidden();const a=await position(400,390),b=await position(400,335);await page.mouse.move(a.x,a.y);await page.mouse.down();for(let i=1;i<=12;i++){await page.mouse.move(a.x+(b.x-a.x)*i/12,a.y+(b.y-a.y)*i/12);await page.waitForTimeout(50);}await expect(page.getByTestId('door-preview-hint')).toHaveText(/Release to interact/);await expect(page.getByTestId('door-controls')).toBeHidden();
 expect((await snap()).tokens.find((x:any)=>x.id===t.id).y).toBe(390);
 expect(await page.evaluate(()=>!!(window as any).Konva.stages[0].find('.wall-door-marker').find((n:any)=>n.getAttr('doorId')==='door')?.getAttr('doorPreview'))).toBe(true);
 const layer=page.getByTestId('miniature-layer');
 await expect.poll(async()=>JSON.parse(await layer.getAttribute('data-preloaded-model-urls')??'[]').filter((u:string)=>/goblin/.test(u)).length,{timeout:60000}).toBe(3);
 expect(modelRequests).toHaveLength(3);
 await expect(layer).toHaveAttribute('data-miniature-count','1');
 await layer.evaluate(node=>{
   const timeline={start:0,ready:0};(window as any).doorRevealTimeline=timeline;
   const observer=new MutationObserver(()=>{
     if(!timeline.start&&JSON.parse((node as HTMLElement).dataset.modelUrls??'[]').some((url:string)=>/goblin/.test(url)))timeline.start=performance.now();
     if(timeline.start&&(node as HTMLElement).dataset.miniatureCount==='2'){timeline.ready=performance.now();observer.disconnect();}
   });observer.observe(node,{attributes:true});
 });
 await page.mouse.up();await expect(page.getByTestId('door-preview-hint')).toBeHidden();await expect(page.getByTestId('door-controls').getByRole('button',{name:/Open$/})).toBeVisible();await page.getByTestId('door-controls').getByRole('button',{name:/Open$/}).click();await expect.poll(async()=>((await snap()).map.walls.find((w:any)=>w.id==='door').open)).toBe(true);
 await expect(layer).toHaveAttribute('data-miniature-count','2');
 expect(modelRequests).toHaveLength(3);
 const timeline=await page.evaluate(()=>(window as any).doorRevealTimeline);
 expect(timeline.start).toBeGreaterThan(0);expect(timeline.ready-timeline.start).toBeLessThan(250);
 console.log(`Preloaded door reveal: ${(timeline.ready-timeline.start).toFixed(1)} ms; no reveal-time model downloads`);
 dm.emit('map:setDoor',{mapId:map.id,doorId:d.id,open:false});dm.emit('condition:set',{kind:'monster',refId:obj.id,condition:{label:'Locked',aura:'red',isConcentration:false}});await snap();
 await expect(page.getByTestId('door-controls').getByRole('button',{name:/Pick lock$/})).toBeVisible();expect((await snap()).map.walls.find((w:any)=>w.id==='door').open).toBe(false);
 }finally{dm.disconnect();}
});
