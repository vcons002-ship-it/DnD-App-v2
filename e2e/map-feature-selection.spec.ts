import {test,expect} from '@playwright/test';import {io} from 'socket.io-client';import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {projectGround} from '../client/src/canvas/miniatureProjection';

test('DM click, multi-select and box-delete features with undo without deleting tokens or the surrounding wall',async({page,request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Feature selection'}})).json();
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#514735'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Feature room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  let s=await snap();dm.emit('map:setActive',{mapId:map.id});
  dm.emit('map:editWalls',{mapId:map.id,add:{id:'building',kind:'rectangle',ax:20,ay:180,bx:780,by:240}});
  dm.emit('map:editWalls',{mapId:map.id,add:{id:'window',kind:'rectangle',window:true,ax:140,ay:180,bx:170,by:240}});
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{lights:[{id:'l1',x:300,y:210},{id:'l2',x:400,y:300}]}});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:s.characters.find((c:any)=>c.name==='Druk').id,x:400,y:440});s=await snap();
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await page.getByRole('button',{name:'Flat battlefield view'}).click();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.waitForTimeout(500);
  let tilt=0;
  const pos=async(x:number,y:number)=>{const c=await page.evaluate(({x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=stage.find('.token')[0],p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{p,width:stage.width(),height:stage.height(),left:r.left,top:r.top};},{x,y});const p=projectGround(c.p.x,c.p.y,c.width,c.height,tilt);return{x:c.left+p.x,y:c.top+p.y};};
  const click=async(x:number,y:number,modifier?:'Shift'|'Control')=>{const p=await pos(x,y);if(modifier)await page.keyboard.down(modifier);await page.mouse.click(p.x,p.y);if(modifier)await page.keyboard.up(modifier);};
  await click(400,440); // Selected token must survive feature Delete.
  await page.getByRole('button',{name:'Walls',exact:true}).click();await page.getByRole('button',{name:'Select walls, windows, doors & lights',exact:true}).click();
  await click(155,210);await expect(page.getByTestId('delete-map-features')).toHaveText('Delete 1 selected');
  await click(300,210,'Shift');await click(400,300,'Control');await expect(page.getByTestId('delete-map-features')).toHaveText('Delete 3 selected');
  await page.keyboard.press('Delete');await expect.poll(async()=>((await snap()).map.walls.map((w:any)=>w.id))).toEqual(['building']);
  expect((await snap()).map.environment.lights).toHaveLength(0);expect((await snap()).tokens).toHaveLength(s.tokens.length);
  await page.keyboard.press('Control+z');await expect.poll(async()=>((await snap()).map.walls.length)).toBe(2);await expect.poll(async()=>((await snap()).map.environment.lights.length)).toBe(2);
  // Enclosing a window and light selects both but not the connected building.
  const a=await pos(120,160),b=await pos(325,260);await page.keyboard.down('Control');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();await page.keyboard.up('Control');
  await expect(page.getByTestId('delete-map-features')).toHaveText('Delete 2 selected');await page.keyboard.press('Backspace');
  await expect.poll(async()=>((await snap()).map.walls.map((w:any)=>w.id))).toEqual(['building']);expect((await snap()).map.environment.lights.map((l:any)=>l.id)).toEqual(['l2']);
  await page.keyboard.press('Control+z');await expect.poll(async()=>((await snap()).map.walls.length)).toBe(2);
  // Text editing owns Delete even while map features are selected.
  await click(155,210);await page.evaluate(()=>{const input=document.createElement('input');input.id='delete-focus-test';input.value='abc';document.body.append(input);input.focus();});
  await page.keyboard.press('Delete');expect((await snap()).map.walls).toHaveLength(2);await page.evaluate(()=>document.getElementById('delete-focus-test')?.remove());
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Tilted battlefield view'}).click();tilt=45;await page.waitForTimeout(900);
  await click(300,210);await click(400,300,'Control');await expect(page.getByTestId('delete-map-features')).toHaveText('Delete 2 selected');
  await page.getByTestId('delete-map-features').click();await expect.poll(async()=>((await snap()).map.environment.lights.length)).toBe(0);expect((await snap()).map.walls).toHaveLength(2);
 }finally{dm.disconnect();}
});
