import {test,expect} from '@playwright/test';import {io} from 'socket.io-client';import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test('private door preview highlights before release, then footprint reach enables player controls',async({page,request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};const {code}=await (await request.post('/api/sessions',{headers,data:{name:'Door footprint test'}})).json();
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#514735'}}).png().toBuffer();
 const map=await (await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Door test',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});const snap=async()=>{const r=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
 let s=await snap();const c=s.characters.find((c:any)=>c.name==='Druk');dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:80,locked:false});
 dm.emit('map:editWalls',{mapId:map.id,add:{id:'wall',kind:'rectangle',ax:0,ay:200,bx:800,by:220}});await snap();
 dm.emit('map:editWalls',{mapId:map.id,door:{wallId:'wall',id:'door',ax:300,ay:210,bx:500,by:210}});dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:400,y:340});s=await snap();const t=s.tokens.find((t:any)=>t.refId===c.id),d=s.map.walls.find((w:any)=>w.id==='door'),obj=s.monsters.find((m:any)=>m.id===s.tokens.find((t:any)=>t.id===d.tokenId).refId);
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();await page.getByRole('button',{name:'Flat battlefield view'}).click();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.waitForTimeout(800);
 const position=async(x:number,y:number)=>page.evaluate(({x,y})=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=s.find('.token')[0],p=node.getParent().getAbsoluteTransform().point({x,y}),r=s.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},{x,y});
 await expect(page.getByTestId('door-controls')).toBeHidden();const a=await position(400,340),b=await position(400,290);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:25});await expect(page.getByTestId('door-preview-hint')).toHaveText(/Release to interact/);await expect(page.getByTestId('door-controls')).toBeHidden();
 expect((await snap()).tokens.find((x:any)=>x.id===t.id).y).toBe(340);
 expect(await page.evaluate(()=>!!(window as any).Konva.stages[0].find('.wall-door-marker').find((n:any)=>n.getAttr('doorId')==='door')?.getAttr('doorPreview'))).toBe(true);
 await page.mouse.up();await expect(page.getByTestId('door-preview-hint')).toBeHidden();await expect(page.getByTestId('door-controls').getByRole('button',{name:/Open$/})).toBeVisible();await page.getByTestId('door-controls').getByRole('button',{name:/Open$/}).click();await expect.poll(async()=>((await snap()).map.walls.find((w:any)=>w.id==='door').open)).toBe(true);
 dm.emit('map:setDoor',{mapId:map.id,doorId:d.id,open:false});dm.emit('condition:set',{kind:'monster',refId:obj.id,condition:{label:'Locked',aura:'red',isConcentration:false}});await snap();
 await expect(page.getByTestId('door-controls').getByRole('button',{name:/Pick lock$/})).toBeVisible();expect((await snap()).map.walls.find((w:any)=>w.id==='door').open).toBe(false);
 }finally{dm.disconnect();}
});
