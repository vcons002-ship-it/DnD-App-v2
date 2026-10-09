import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test('DM switches between working light, scene light and combined party sight',async({page,request})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Combined party preview'}})).json();
 const image=await sharp({create:{width:1800,height:700,channels:3,background:'#635d4f'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Split dungeon',image:{name:'split.png',mimeType:'image/png',buffer:image}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  let state=await snap();socket.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [name,x] of [['Druk',120],['Varis',850],['Vanec',180]] as const){const c=state.characters.find((c:any)=>c.name===name);socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x,y:300});}
  socket.emit('monster:create',{name:'Goblin',maxHp:10,disposition:'enemy',modelType:'goblin'});
  const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');
  for(const x of [230,950,1650,300])socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:300});
  state=await snap();const enemies=state.tokens.filter((t:any)=>t.kind==='monster'),secret=enemies.find((t:any)=>t.x===300),far=enemies.find((t:any)=>t.x===1650);
  socket.emit('token:setHidden',{tokenId:secret.id,hidden:true});
  socket.emit('map:editWalls',{mapId:map.id,add:{id:'partition',ax:500,ay:-100,bx:500,by:800}});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false,lights:[]}});await snap();
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  const visibility=page.getByRole('combobox',{name:'Battlefield visibility'});
  await expect(visibility).toHaveValue('dm');await expect(page.getByRole('region',{name:'Turn controls'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Reset battlefield rotation'})).toBeHidden();
  await page.getByRole('button',{name:'Initiative',exact:true}).click();await expect(page.getByRole('button',{name:'Start combat',exact:true})).toBeVisible();await page.locator('#dm-panel-initiative').getByRole('button',{name:'Close DM panel',exact:true}).click();
  await page.getByRole('button',{name:'3D player tokens',exact:true}).click();await page.getByRole('button',{name:'3D monster tokens',exact:true}).click();
  const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','7',{timeout:60000});
  await visibility.selectOption('player');await expect(page.getByText('Combined party sight',{exact:true})).toBeVisible();
  await expect(layer).toHaveAttribute('data-miniature-count','5',{timeout:60000});
  const ids=await layer.getAttribute('data-miniature-ids');expect(ids).not.toContain(secret.id);expect(ids).not.toContain(far.id);
  // The DM window reacts to live lighting changes without granting new player claims.
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{lights:[{id:'far-torch',x:1650,y:300,radiusFt:20,heightFt:9,color:'warm',intensity:1,flicker:true}]}});
  await expect(layer).toHaveAttribute('data-miniature-count','6',{timeout:30000});
  await page.screenshot({path:test.info().outputPath('combined-party-sight.png')});
  await visibility.selectOption('scene');await expect(layer).toHaveAttribute('data-miniature-count','7',{timeout:30000});await visibility.selectOption('dm');
  const canvas=page.locator('.konvajs-content').first();const b=(await canvas.boundingBox())!;
  await page.mouse.move(b.x+b.width*.82,b.y+b.height*.85);await page.mouse.down({button:'right'});await page.mouse.move(b.x+b.width*.82+80,b.y+b.height*.85,{steps:10});await page.mouse.up({button:'right'});
  await expect(page.getByRole('button',{name:'Reset battlefield rotation'})).toBeVisible();await page.getByRole('button',{name:'Reset battlefield rotation'}).click();await expect(page.getByRole('button',{name:'Reset battlefield rotation'})).toBeHidden();
  expect((await snap()).characters.every((c:any)=>!c.claimedBy)).toBe(true);expect(errors).toEqual([]);
 }finally{socket.disconnect();}
});
