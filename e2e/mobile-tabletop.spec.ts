import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import type {StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';

test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
async function fixture(request:APIRequestContext){
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Mobile adventure'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async():Promise<StateSnapshot>=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 let s=await snapshot();const c=s.characters.find(c=>c.name==='Druk')!;
 dm.emit('character:update',{characterId:c.id,race:'Half-Orc',className:'Fighter',level:5,armorClass:16,stats:{STR:18,DEX:14,CON:16,INT:10,WIS:12,CHA:10},weapons:[{name:'Mobile greatsword',kind:'melee',damage:'2d6',damageType:'slashing',attackBonus:100}]});
 dm.emit('session:setManualDamage',{manual:true});
 const image=await sharp({create:{width:1000,height:700,channels:3,background:'#3b443f'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Practice courtyard',image:{name:'court.png',mimeType:'image/png',buffer:image}}})).json();
 dm.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'] as const)dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:350,y:400});
 dm.emit('monster:create',{name:'Mobile goblin',modelType:'goblin',maxHp:200,armorClass:1,disposition:'enemy'});s=await snapshot();
 dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:s.monsterTemplates.find(m=>m.name==='Mobile goblin')!.id,x:650,y:400});s=await snapshot();
 return {code,dm,snapshot,hero:s.tokens.find(t=>t.kind==='pc')!,enemy:s.tokens.find(t=>t.kind==='monster')!};
}
async function enter(page:Page,code:string,role:'dm'|'player'){
 await page.goto(`/${role==='dm'?'dm':'join'}?code=${code}`);
 if(role==='dm'){await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).tap();}
 else{await page.getByRole('button',{name:'Join',exact:true}).tap();await page.locator('.claim-row').filter({hasText:'Druk'}).tap();}
 await expect(page.locator('.layout')).toBeVisible();
}
async function withinScreen(page:Page,selector:string){
 const r=await page.locator(selector).boundingBox(),v=page.viewportSize()!;expect(r).toBeTruthy();
 expect(r!.x).toBeGreaterThanOrEqual(-1);expect(r!.y).toBeGreaterThanOrEqual(-1);expect(r!.x+r!.width).toBeLessThanOrEqual(v.width+1);expect(r!.y+r!.height).toBeLessThanOrEqual(v.height+1);
}
async function touchDrag(page:Page,start:{x:number;y:number},end:{x:number;y:number}){
 const c=await page.context().newCDPSession(page);
 try{await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
  for(let i=1;i<=12;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12,id:1}]});await page.waitForTimeout(16);}
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await c.detach();}
}

test('phone touch movement, compact menus, character records and combat work in portrait and landscape',async({page,request},info)=>{
 test.setTimeout(180000);const f=await fixture(request),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await enter(page,f.code,'player');await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(page.getByRole('button',{name:'Expand combat',exact:true})).toBeVisible();
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','2',{timeout:60000});
  expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThan(120);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await openToolbarGroup(page,'View');const view=page.getByRole('dialog',{name:'View',exact:true});
  await view.getByRole('button',{name:'Tilted battlefield view',exact:true}).tap();await expect(view.getByRole('button',{name:'Tilted battlefield view',exact:true})).toHaveAttribute('aria-pressed','true');
  await view.getByRole('button',{name:'Rotate map right',exact:true}).tap();await expect(view.getByRole('button',{name:'Reset battlefield rotation',exact:true})).toBeVisible();
  const rotation=()=>page.evaluate(()=>Number(localStorage.getItem(`dnd.battlefieldRotation:${localStorage.getItem('dnd.playerId')}`)));
  await expect.poll(rotation,{timeout:20000}).toBe(15);
  await view.getByRole('button',{name:'Reset battlefield rotation',exact:true}).tap();await expect.poll(rotation,{timeout:20000}).toBe(0);
  await view.getByRole('button',{name:'Flat battlefield view',exact:true}).tap();
  await page.getByRole('button',{name:'View',exact:true}).tap();await expect(view).toHaveCount(0);
  // The overhead button changes its pressed state before the 450 ms camera
  // transition completes. Wait for the real projection before locating a base.
  await expect.poll(()=>page.locator('.konvajs-content canvas').evaluateAll(canvases=>canvases.every(e=>new DOMMatrix(getComputedStyle(e).transform).isIdentity)),{timeout:20000}).toBe(true);
  // Actual touch events through the same Konva hit region as the 3D base.
  await expect.poll(async()=>page.evaluate(id=>(window as any).Konva.stages.some((s:any)=>s.find('.token').some((t:any)=>t.getAttr('tokenId')===id)),f.hero.id)).toBe(true);
  const point=await page.evaluate(id=>{for(const s of (window as any).Konva.stages){const n=s.find('.token').find((t:any)=>t.getAttr('tokenId')===id);if(n){const p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};}}throw Error('No token');},f.hero.id);
  await touchDrag(page,point,{x:point.x+35,y:point.y-25});
  await expect.poll(async()=>{const t=(await f.snapshot()).tokens.find(t=>t.id===f.hero.id)!;return Math.hypot(t.x-f.hero.x,t.y-f.hero.y);}).toBeGreaterThan(10);
  const moved=(await f.snapshot()).tokens.find(t=>t.id===f.hero.id)!;
  if(await page.getByRole('button',{name:'Collapse combat',exact:true}).isVisible())await page.getByRole('button',{name:'Collapse combat',exact:true}).tap();
  const canvas=(await page.locator('.konvajs-content').first().boundingBox())!;
  await touchDrag(page,{x:300,y:canvas.y+120},{x:260,y:canvas.y+150});
  expect((await f.snapshot()).tokens.find(t=>t.id===f.hero.id)!.x).toBe(moved.x);
  const previousZoom=await page.locator('.zoom-label').textContent(),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:canvas.y+170,id:1},{x:240,y:canvas.y+170,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:canvas.y+170,id:1},{x:270,y:canvas.y+170,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await expect(page.locator('.zoom-label')).not.toHaveText(previousZoom!);
  await page.getByRole('button',{name:'Fit',exact:true}).tap();
  await page.getByRole('button',{name:'Character',exact:true}).tap();await withinScreen(page,'dialog.character-window');
  await page.getByRole('button',{name:'Inventory',exact:true}).tap();await page.getByRole('button',{name:'Spellbook',exact:true}).tap();await page.getByRole('button',{name:'Close character window',exact:true}).tap();
  await page.getByRole('button',{name:'Expand combat',exact:true}).tap();await page.getByLabel('Attack target',{exact:true}).selectOption(f.enemy.id);
  for(let attempt=0;attempt<3;attempt++){
   await page.locator('.compact-player-combat').getByRole('button',{name:/Mobile greatsword/}).tap();
   await expect(page.locator('[data-live-dice=true]')).toBeVisible({timeout:30000});await withinScreen(page,'[data-dice-presentation]>.roll-reveal');
   await page.screenshot({path:info.outputPath('phone-real-attack-dice.png')});
   await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:45000});
   const damage=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn');if(await damage.isVisible()){await damage.tap();await expect(page.locator('[data-live-dice=true]')).toBeVisible();await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:45000});break;}
  }
  expect((await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)!.curHp).toBeLessThan(200);
  await page.setViewportSize({width:844,height:390});await page.getByRole('button',{name:'Character',exact:true}).tap();await withinScreen(page,'dialog.character-window');
  await page.getByRole('button',{name:'Checks & saves',exact:true}).tap();await page.locator('.ability-roll-cell').first().getByRole('button',{name:/^Save/}).tap();
  await expect(page.locator('[data-live-dice=true]')).toBeVisible({timeout:30000});await withinScreen(page,'[data-dice-presentation]>.roll-reveal');
  await expect.poll(async()=>(await page.locator('.dice-tray-stage').boundingBox())?.height??0).toBeGreaterThan(120);
  await page.screenshot({path:info.outputPath('phone-landscape-real-save.png')});await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:45000});
  await page.setViewportSize({width:768,height:1024});await expect(page.getByRole('button',{name:'View',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Tilted battlefield view',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{f.dm.disconnect();}
});

test('phone DM can reach map, lighting, fog, creature and settings tools without offscreen controls',async({page,request},info)=>{
 test.setTimeout(90000);const f=await fixture(request);
 try{
  await enter(page,f.code,'dm');expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThan(120);
  await openToolbarGroup(page,'Map tools');await page.getByRole('button',{name:'Walls',exact:true}).tap();
  await expect(page.locator('.wall-menu')).toBeVisible();await page.locator('.wall-menu').getByRole('button',{name:'Lights',exact:true}).tap();await withinScreen(page,'.wall-menu');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Maps',exact:true}).tap();await withinScreen(page,'#dm-panel-maps');
  await page.locator('#dm-panel-maps').getByRole('button',{name:'Close DM panel',exact:true}).tap();
  await page.getByRole('button',{name:'Creatures',exact:true}).tap();await withinScreen(page,'#dm-panel-spawn');
  await page.locator('#dm-panel-spawn').getByRole('button',{name:'Close DM panel',exact:true}).tap();
  await page.getByLabel('Campaign menu',{exact:true}).tap();await page.getByRole('button',{name:/Settings/}).tap();await withinScreen(page,'.modal');
  await page.locator('.modal').getByRole('button',{name:'Close',exact:true}).tap();await page.screenshot({path:info.outputPath('phone-dm-map-tools.png')});
  await page.setViewportSize({width:844,height:390});await openToolbarGroup(page,'View');await withinScreen(page,'.compact-toolbar-menu');
  await page.getByRole('button',{name:'View',exact:true}).tap();await page.getByRole('button',{name:'Maps',exact:true}).tap();await withinScreen(page,'#dm-panel-maps');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{f.dm.disconnect();}
});

test('phone character creator fits, scrolls and exposes its steps without hiding navigation',async({page,request},info)=>{
 const f=await fixture(request);
 try{
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).tap();await page.locator('.creator-launch').tap();
  const dialog=page.getByRole('dialog',{name:'Bring your hero to life'});await expect(dialog).toBeVisible();await withinScreen(page,'dialog.character-creator');
  await dialog.getByLabel('Character name',{exact:true}).fill('Phone paladin');await dialog.getByRole('button',{name:/Paladin.*Stand for your oath/}).tap();
  await dialog.getByRole('button',{name:/^Next/}).tap();await withinScreen(page,'.creator-footer');await page.screenshot({path:info.outputPath('phone-character-creator.png')});
  await dialog.getByRole('button',{name:/^Next/}).tap();await withinScreen(page,'.creator-footer');
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }finally{f.dm.disconnect();}
});

for(const [width,height]of [[360,800],[430,932],[768,1024],[1024,768]])test(`touch layout fits ${width} by ${height} without changing desktop-sized panels`,async({page,request})=>{
 const f=await fixture(request);
 try{
  await page.setViewportSize({width,height});await enter(page,f.code,'player');await expect(page.getByTestId('player-hud')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width<=600){
   await expect(page.getByRole('button',{name:'Expand combat',exact:true})).toBeVisible();
   expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThan(120);
   await openToolbarGroup(page,'View');await withinScreen(page,'.compact-toolbar-menu');
  }else{
   await expect(page.getByRole('button',{name:'Collapse combat',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'View',exact:true})).toHaveCount(0);await withinScreen(page,'.player-combat');
  }
 }finally{f.dm.disconnect();}
});
