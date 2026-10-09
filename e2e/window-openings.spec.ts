import {test,expect} from '@playwright/test';import {io} from 'socket.io-client';import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {hasLineOfSight,type MapWall} from '../shared/mapWalls';
test('DM removes one generated window without removing its solid wall',async({page,request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await (await request.post('/api/sessions',{headers,data:{name:'Window removal regression'}})).json();
 const image=await sharp({create:{width:400,height:300,channels:3,background:'#574d41'}}).png().toBuffer();
 const map=await (await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Window room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  await snap();socket.emit('map:setActive',{mapId:map.id});
  const wall:MapWall={id:'solid',kind:'rectangle',ax:190,ay:0,bx:210,by:300};
  const window:MapWall={id:'generated-window',window:true,kind:'rectangle',ax:189,ay:120,bx:211,by:160};
  socket.emit('map:editWalls',{mapId:map.id,add:wall});socket.emit('map:editWalls',{mapId:map.id,add:window});await snap();
  const a={x:100,y:140},b={x:300,y:140};expect(hasLineOfSight(a,b,(await snap()).map.walls)).toBe(true);
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await page.getByRole('button',{name:'Walls',exact:true}).click();await page.getByRole('button',{name:'Edit tools',exact:true}).click();await page.locator('.wall-menu-list > summary').filter({hasText:'Remove windows'}).click();await page.getByRole('button',{name:'Remove window 1',exact:true}).click();
  await expect.poll(async()=>((await snap()).map.walls??[]).length).toBe(1);
  expect((await snap()).map.walls).toEqual([wall]);expect(hasLineOfSight(a,b,(await snap()).map.walls)).toBe(false);
  expect((await request.post(`/api/maps/${map.id}/window-draft`,{data:{}})).status()).toBe(403);
 }finally{socket.disconnect();}
});
