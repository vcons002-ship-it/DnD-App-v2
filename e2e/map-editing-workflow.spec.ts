import {openToolbarGroup} from './helpers/mobileToolbar';
import {test,expect,type Page,type APIRequestContext} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

const headers={'x-dm-passphrase':DM_SECRET};
async function login(page:Page,code:string){
 await page.setViewportSize({width:1500,height:1000});
 await page.goto(`/dm?code=${code}`);
 await page.locator('input[type=password]').fill(DM_SECRET);
 await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
}
async function fixture(request:APIRequestContext){
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Map editing regression'}})).json();
 const image=await sharp({create:{width:900,height:600,channels:3,background:'#514735'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>{const r=await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const state=await snapshot();dm.emit('map:setActive',{mapId:map.id});
 dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:state.characters.find((c:any)=>c.name==='Druk').id,x:450,y:300});
 dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true}});
 await snapshot();
 return {code,map,dm,snapshot};
}

test('DM places multiple lights with saved defaults and edits walls while keeping player visibility',async({page,request})=>{
 const f=await fixture(request);
 try{
  await login(page,f.code);
  await openToolbarGroup(page,'View');await page.getByRole('button',{name:'Flat battlefield view'}).click();
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility').selectOption('player');
  await expect(page.getByTestId('player-vision')).toHaveAttribute('data-origin-count','1');
  await page.getByRole('button',{name:'Map features',exact:true}).click();
  await page.getByRole('button',{name:'Lights',exact:true}).click();
  await page.getByLabel('New light color',{exact:true}).selectOption('cool');
  for(const label of ['New light lit radius','New light height','New light strength']){
   await page.getByLabel(label,{exact:true}).focus();await page.keyboard.press('End');
  }
  await page.getByLabel('New light gentle flicker').click();
  await expect(page.getByLabel('New light gentle flicker')).not.toBeChecked();
  await page.getByLabel('New light show 3D fixture').click();
  await expect(page.getByLabel('New light show 3D fixture')).not.toBeChecked();
  await page.getByLabel('New light model').selectOption('lantern');
  await expect.poll(async()=>(await f.snapshot()).map.environment.newLightDefaults).toMatchObject({radiusFt:60,heightFt:30,intensity:2,flicker:false,visibleTorch:false,fixture:'lantern'});
  await page.getByRole('button',{name:'Place light on map',exact:true}).click();
  const position=(x:number,y:number)=>page.evaluate(({x,y})=>{
   const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=stage.find('.token')[0];
   const p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};
  },{x,y});
  const click=async(x:number,y:number)=>{const p=await position(x,y);await page.mouse.click(p.x,p.y);};
  for(const [i,x,y] of [[1,390,250],[2,510,350]]){
   await click(x,y);await expect.poll(async()=>(await f.snapshot()).map.environment.lights.length).toBe(i);
   await expect(page.locator('.environment-placement-hint')).toBeVisible();
  }
  for(const light of (await f.snapshot()).map.environment.lights)expect(light).toMatchObject({radiusFt:60,heightFt:30,intensity:2,flicker:false,color:'cool',fixture:'lantern'});
  await page.keyboard.press('Escape');await expect(page.locator('.environment-placement-hint')).toBeHidden();
  // Changed defaults affect future lights, with old placements retained.
  await page.getByRole('button',{name:'Map features',exact:true}).click();
  await page.getByRole('slider',{name:'New light lit radius',exact:true}).focus();await page.keyboard.press('Home');
  await expect.poll(async()=>(await f.snapshot()).map.environment.newLightDefaults.radiusFt).toBe(3);
  await page.getByRole('button',{name:'Place light on map',exact:true}).click();await click(450,380);
  await expect.poll(async()=>(await f.snapshot()).map.environment.lights.map((l:any)=>l.radiusFt)).toEqual([60,60,3]);
  await page.locator('.environment-placement-hint').getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Map features',exact:true}).click();
  await page.getByRole('button',{name:'Add features',exact:true}).click();
  await page.getByRole('button',{name:'Draw wall rectangles',exact:true}).click();
  const a=await position(350,390),b=await position(550,410);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await f.snapshot()).map.walls.length).toBe(1);
  await openToolbarGroup(page,'View');await expect(page.getByLabel('Battlefield visibility')).toHaveValue('player');
  await expect(page.getByTestId('player-vision')).toHaveAttribute('data-heavy','true');
  await page.keyboard.press('Escape');
  await page.screenshot({path:'test-results/map-editing-player-visibility.png'});
 }finally{f.dm.disconnect();}
});

test('saved DM spell dismissal survives reload, while log actions and new casts remain available',async({page,request})=>{
 test.setTimeout(120000);
 const f=await fixture(request);
 try{
  await page.addInitScript(()=>localStorage.setItem('dnd-environment-quality','legacy'));
  const bundle=await(await request.get(`/api/sessions/${f.code}/export`,{headers})).json();
  bundle.rollLog=[{id:'saved-bone-shards',session_id:bundle.session.id,roller:'DM',label:'Bone Shard Burst',expr:'3d6',total:12,detail:'Saved spell damage',created_at:Date.now(),apply:JSON.stringify({amount:12,damageType:'piercing',save:'DEX',dc:14})}];
  const imported=await request.post('/api/sessions/import',{headers,multipart:{file:{name:'saved-spell.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))}}});
  expect(imported.ok()).toBe(true);const {code}=await imported.json();
  await login(page,code);
  const dock=page.getByRole('region',{name:'Damage action',exact:true});
  await expect(dock).toContainText('Bone Shard Burst');
  await dock.getByRole('button',{name:'Close',exact:true}).click();await expect(dock).toBeHidden();
  const reload=async()=>{await page.reload();await expect(page.getByRole('button',{name:'Chat & dice',exact:true})).toBeVisible();await expect(dock).toBeHidden();};
  const reopen=async()=>{
   await page.getByRole('button',{name:'Chat & dice',exact:true}).click();
   await page.locator('.roll-entry').filter({hasText:'Bone Shard Burst'}).getByRole('button',{name:/Apply damage/}).click();
   await expect(dock).toContainText('Choose targets on the map');
  };
  await reload();await reopen();
  await dock.getByRole('button',{name:'Done',exact:true}).click();await expect(dock).toBeHidden();
  await reload();await reopen();
  await page.keyboard.press('Escape');await expect(dock).toBeHidden();
  await reload();
  // A dismissal belongs to one cast, never all subsequent damage prompts.
  const joined=await f.dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  const pc=joined.snapshot.characters.find((c:any)=>c.name==='Druk');
  f.dm.emit('character:update',{characterId:pc.id,sheetAbilities:[{id:'fresh-burst',name:'Fresh burst',type:'feature',roll:{kind:'save',dice:'1d4',save:'DEX',dc:12,damageType:'piercing'}}]});
  f.dm.emit('ability:roll',{kind:'pc',refId:pc.id,abilityId:'fresh-burst'});
  await expect(dock).toContainText('Fresh burst',{timeout:45000});
  await dock.getByRole('button',{name:'Close',exact:true}).click();await reload();
 }finally{f.dm.disconnect();}
});
