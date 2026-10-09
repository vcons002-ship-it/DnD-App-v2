import sharp from 'sharp';
import {test,expect} from '@playwright/test';import {io} from 'socket.io-client';import {DM_SECRET,PORT} from './playwright.config';
test('DM resets explored fog with confirmation; players and other sessions cannot reset it',async({page,request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Reset explored fog'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Reset map',image:{name:'room.png',mimeType:'image/png',buffer:await sharp({create:{width:1000,height:600,channels:3,background:'#333333'}}).png().toBuffer()}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']}),viewer=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});return r.snapshot;};
 const sight=async()=>{const r=await viewer.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'});return r.snapshot;};
 try{
 const c=(await snap()).characters.find((c:any)=>c.name==='Druk');dm.emit('map:setActive',{mapId:map.id});dm.emit('map:editWalls',{mapId:map.id,add:{id:'split',ax:500,ay:-5000,bx:500,by:5000}});dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:800,y:100});await snap();
 const token=(await snap()).tokens.find((t:any)=>t.refId===c.id);await sight();dm.emit('token:move',{tokenId:token.id,x:100,y:100});await snap();const before=(await sight()).exploredTerrain;
 viewer.emit('fog:resetExploration',{mapId:map.id});await sight();expect((await sight()).exploredTerrain).toEqual(before);
 await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await page.getByRole('button',{name:/Fog.*?/}).click();await page.getByRole('button',{name:'Reset explored fog',exact:true}).click();expect((await sight()).exploredTerrain).toEqual(before);
 await page.getByRole('button',{name:'Confirm reset explored fog',exact:true}).click();await expect.poll(async()=>JSON.stringify((await sight()).exploredTerrain)).not.toBe(JSON.stringify(before));await expect(page.getByText('Explored fog reset for this map.',{exact:false})).toBeVisible();
 }finally{dm.disconnect();viewer.disconnect();}
});
