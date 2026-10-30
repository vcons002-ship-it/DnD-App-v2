import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {stopAtWalls,wallCollisionRadiusFt} from '../shared/mapWalls';

test.use({viewport:{width:1500,height:1000},serviceWorkers:'block'});
for(const legacy of [true,false])for(const assisted of [false,true])test(`off-center hallway drag clears an open door, blocks a closed door: legacy=${legacy}, assist=${assisted}`,async({page,request})=>{
 test.setTimeout(60000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Forgiving doorway'}})).json();
 const image=await sharp({create:{width:700,height:500,channels:3,background:'#726753'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Hallway',image:{name:'hall.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>{const r=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Druk');
  admin.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const wall of [{id:'north',ax:0,ay:200,bx:600,by:200},{id:'south',ax:0,ay:226,bx:600,by:226},{id:'partition',kind:'rectangle',ax:290,ay:0,bx:310,by:500}])admin.emit('map:editWalls',{mapId:map.id,add:wall});
  await state();admin.emit('map:editWalls',{mapId:map.id,door:{id:'door',wallId:'partition',ax:300,ay:200,bx:300,by:226}});await state();
  admin.emit('map:setDoor',{mapId:map.id,doorId:'door',open:true});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:150,y:213});
  const saved=await state(),token=saved.tokens.find((t:any)=>t.kind==='pc'),destination={x:450,y:222};
  // The intended drag genuinely clips clearance, despite its center fitting.
  expect(stopAtWalls(token,destination,wallCollisionRadiusFt(token.widthFt)*10,saved.map.walls).x).toBeLessThan(290);
  await page.addInitScript(({legacy,assisted})=>{
   localStorage.setItem('dnd-environment-quality',legacy?'legacy':'low');localStorage.setItem('dnd-server-rendering',assisted?'on':'off');
   const id=crypto.randomUUID();localStorage.setItem('dnd.playerId',id);for(const key of ['tokenView','monsterTokenView'])localStorage.setItem(`dnd.${key}:${id}`,'2d');
  },{legacy,assisted});
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Server managed rendering',exact:true})).toBeChecked({checked:assisted});
  const position=async()=>(await state()).tokens.find((t:any)=>t.id===token.id);
  const point=async(x:number,y:number)=>page.evaluate(({id,x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),node=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},{id:token.id,x,y});
  const settled=async(x:number,y:number)=>expect.poll(()=>page.evaluate(({id,x,y})=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);return n?Math.hypot(n.x()-x,n.y()-y):Infinity;},{id:token.id,x,y})).toBeLessThan(.1);
  const drag=async()=>{const t=await position();await settled(t.x,t.y);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const a=await point(t.x,t.y),b=await point(destination.x,destination.y);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();};
  await drag();await expect.poll(async()=>(await position()).x).toBeGreaterThan(430);
  const accepted=await position();expect(accepted.y).toBeGreaterThan(210);expect(accepted.y).toBeLessThan(216);
  expect(stopAtWalls(token,accepted,wallCollisionRadiusFt(token.widthFt)*10,saved.map.walls)).toMatchObject({x:accepted.x,y:accepted.y});
  await settled(accepted.x,accepted.y);
  admin.emit('token:move',{tokenId:token.id,x:150,y:213});await state();
  admin.emit('map:setDoor',{mapId:map.id,doorId:'door',open:false});await state();
  await settled(150,213);await drag();
  await expect.poll(async()=>(await position()).x).toBeGreaterThan(150);
  expect((await position()).x).toBeLessThan(290);
 }finally{admin.disconnect();}
});

