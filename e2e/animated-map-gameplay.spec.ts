import {test,expect,type Page,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './directAv1Recorder';

test.skip(!process.env.DND_ANIMATED_MAP_DEMO,'Opt-in downloaded-map gameplay and performance recording');
test('animated maps with player fog, darkness, combat and a paired static performance comparison',async({browser,request})=>{
 test.setTimeout(900000);
 const root=process.env.DND_ANIMATED_MAP_DEMO!,sources=JSON.parse(readFileSync(root+'/sources.json','utf8'));
 const out=root+'/integration';mkdirSync(out,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Animated maps - fog and combat'}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const snap=async()=>{const r=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await snap(),catalog=(await(await request.get('/api/spells/all')).json()).results;
 for(const c of initial.characters)admin.emit('character:update',{characterId:c.id,className:c.name==='Vanec'?'Sorcerer':c.name==='Varis'?'Ranger':'Fighter',level:5,maxHp:60,curHp:60,armorClass:16,
  stats:{STR:c.name==='Druk'?18:10,DEX:c.name==='Varis'?18:14,CON:14,INT:12,WIS:16,CHA:18},
  weapons:[{name:c.name==='Varis'?'Longbow':'Greatsword',kind:c.name==='Varis'?'ranged':'melee',damage:c.name==='Varis'?'1d8':'2d6',damageType:c.name==='Varis'?'piercing':'slashing',attackBonus:7,range:c.name==='Varis'?150:5}],
  sheetAbilities:c.name==='Vanec'?catalog.filter((a:any)=>['Fireball','Fire Bolt','Lightning Bolt'].includes(a.name)).map((a:any)=>({...a,id:a.name,source:'srd'})):[],spellSlots:{L1:{max:4,used:0},L3:{max:6,used:0}}});
 const maps:any[]=[],positions=[[[980,580],[1040,440],[980,680]],[[650,440],[750,380],[860,250]],[[1370,360],[1440,510],[1350,720]]];
 for(const [index,source]of sources.entries()){
  const response=await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:source.title,image:{name:source.name+'.mp4',mimeType:'video/mp4',buffer:readFileSync(root+'/'+source.name+'-sample.mp4')}}});expect(response.status()).toBe(201);
  const map=await response.json();maps.push(map);admin.emit('map:setGrid',{mapId:map.id,gridSizePx:75,feetPerSquare:5,widthFt:128,locked:false});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',mist:false,shadows:true,sceneTintStrength:0,weather:'none',particles:'none'}});
  for(const[i,name]of['Druk','Varis','Vanec'].entries())admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:positions[index][i][0],y:positions[index][i][1]});
 }
 // A test door closes the actual connecting passage between the temple chambers.
 admin.emit('map:editWalls',{mapId:maps[0].id,add:{id:'chamber-divider',kind:'rectangle',ax:1100,ay:0,bx:1200,by:1080}});await snap();
 admin.emit('map:editWalls',{mapId:maps[0].id,door:{wallId:'chamber-divider',id:'passage-door',ax:1150,ay:475,bx:1150,by:685}});await snap();
 admin.emit('monster:create',{name:'Goblin sentry',modelType:'goblin',maxHp:120,armorClass:12,disposition:'enemy',creatureType:'Small humanoid',stats:{DEX:12,CON:10},weapons:[{name:'Shortbow',kind:'ranged',damage:'1d6',damageType:'piercing',attackBonus:4,range:80}]});
 const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin sentry');
 for(const [x,y]of [[1300,500],[1380,590],[1290,650]])admin.emit('token:spawn',{mapId:maps[0].id,kind:'monster',refId:template.id,x,y});
 admin.emit('session:setManualDamage',{manual:true});admin.emit('session:setHideDmRolls',{hide:false});admin.emit('map:setActive',{mapId:maps[0].id});await snap();
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,baseURL:`http://localhost:${PORT}`}),page=await context.newPage();
 page.setDefaultTimeout(30000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','balanced');localStorage.setItem('dnd-map-animation','on');});
 let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined;
 const chapters:any[]=[],performanceResults:any[]=[];
 const click=async(locator:Locator)=>{const b=await locator.boundingBox();expect(b).toBeTruthy();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:15});await page.waitForTimeout(250);await locator.click();};
 const layer=page.getByTestId('miniature-layer');
 const chapter=async(title:string)=>{chapters.push({title,time:(Date.now()-capture!.startedAt)/1000});await page.evaluate(title=>document.getElementById('animated-caption')!.textContent=title,title);console.log('Chapter: '+title);await page.waitForTimeout(1300);};
 const setEnvironment=async(index:number,lighting:'day'|'dungeon',heavy=false)=>{admin.emit('map:setEnvironment',{mapId:maps[index].id,settings:{enabled:true,lighting,heavyDarkness:heavy,lightLevel:lighting==='day'?1:.7,mist:false,lights:lighting==='day'?[]:[{id:'ritual-light',x:1350,y:600,radiusFt:20,heightFt:9,color:'#6eaaff',intensity:1.2,flicker:true}]}});await snap();};
 const selectMap=async(index:number)=>{admin.emit('map:setActive',{mapId:maps[index].id});await snap();await expect(page.locator('.active-map')).toContainText(sources[index].title);await click(page.getByRole('button',{name:'Fit',exact:true}));await page.waitForTimeout(2000);};
 const point=async(tokenId:string,x?:number,y?:number)=>page.evaluate(({id,x,y})=>{
  const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=x===undefined?n.getAbsolutePosition():n.getParent().getAbsoluteTransform().point({x,y}),r=s.getContent().getBoundingClientRect();
  const q=new DOMPoint(p.x-s.width()/2,p.y-s.height()/2).matrixTransform(new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform));return{x:r.left+s.width()/2+q.x/q.w,y:r.top+s.height()/2+q.y/q.w};
 },{id:tokenId,x,y});
 const actorId=async()=>{const s=await snap();return s.tokens.find((t:any)=>t.mapId===s.map.id&&t.refId===initial.characters.find((c:any)=>c.name==='Vanec').id)!.id;};
 const walk=async(x:number,y:number)=>{const id=await actorId(),a=await point(id),b=await point(id,x,y);await page.mouse.move(a.x,a.y,{steps:12});await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(b.x,b.y,{steps:35});await page.waitForTimeout(400);await page.mouse.up();await page.waitForTimeout(1600);};
 const settleRolls=async()=>{
  const deadline=Date.now()+100000;let quiet=0;
  while(Date.now()<deadline){if(await page.locator('[data-live-dice="true"]').count()){quiet=0;await page.waitForTimeout(250);continue;}
   const reveal=page.locator('.roll-reveal');if(await reveal.isVisible()){quiet=0;if(await reveal.getAttribute('data-impact-ready')==='true'){await page.waitForTimeout(1300);await page.keyboard.press('Escape');}}
   else if(++quiet>=6)break;await page.waitForTimeout(250);
  }
  expect(Date.now()).toBeLessThan(deadline);
 };
 const measure=async(moving:boolean)=>{
  const duration=6000;
  const samples=page.evaluate(async duration=>{
   const host=document.querySelector('[data-testid="miniature-layer"]') as HTMLElement,start=performance.now(),initial=Number(host.dataset.frameCount),deltas:number[]=[];let previous=start;
   const long:number[]=[];let observer:PerformanceObserver|undefined;try{observer=new PerformanceObserver(list=>long.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask',buffered:false});}catch{}
   await new Promise<void>(resolve=>{const frame=(now:number)=>{deltas.push(now-previous);previous=now;if(now-start<duration)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
   observer?.disconnect();const elapsed=performance.now()-start;deltas.sort((a,b)=>a-b);
   const videos=[...document.querySelectorAll<HTMLVideoElement>('[data-testid="animated-map-video"]')].map(v=>({url:v.currentSrc,time:v.currentTime,decoded:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
   return {rafFps:deltas.length*1000/elapsed,renderFps:(Number(host.dataset.frameCount)-initial)*1000/elapsed,medianFrameMs:deltas[Math.floor(deltas.length*.5)],p95FrameMs:deltas[Math.floor(deltas.length*.95)],longTaskMs:long.reduce((a,b)=>a+b,0),gpuMs:host.dataset.gpuMs,videos};
  },duration);
  if(moving){await page.mouse.move(260,350);await page.mouse.down({button:'right'});for(let i=0;i<5;i++){await page.mouse.move(i%2?260:400,350,{steps:30});await page.waitForTimeout(700);}await page.mouse.up({button:'right'});}
  const result=await samples;
  const reset=page.getByRole('button',{name:'Reset battlefield rotation',exact:true});if(await reset.isVisible())await reset.click();
  return result;
 };
 try{
  await page.goto(`/join?code=${code}&benchmark=1`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  await expect(layer).toHaveAttribute('data-miniature-count','3',{timeout:90000});await page.getByRole('button',{name:'Collapse combat',exact:true}).click();
  const gpu=await page.evaluate(()=>{const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);gl.getExtension('WEBGL_lose_context')?.loseContext();return renderer;});
  // No recorder runs during measurements. Alternating order limits warm-up bias.
  if(!process.env.DND_ANIMATED_SKIP_BENCH)for(const[index,lighting,heavy]of [[0,'day',false],[0,'dungeon',false],[0,'dungeon',true],[1,'day',false],[2,'day',false]] as const){
   await selectMap(index);await setEnvironment(index,lighting,heavy);admin.emit('map:setDoor',{mapId:maps[0].id,doorId:'passage-door',open:true});await snap();
   await click(page.getByRole('button',{name:'Tilted battlefield view',exact:true}));
   for(const animate of index%2?[true,false]:[false,true]){
    const button=page.getByRole('button',{name:'Toggle map animation'});if((await button.getAttribute('aria-pressed'))!==String(animate))await button.click();await page.waitForTimeout(2200);
    const idle=await measure(false),camera=await measure(true);performanceResults.push({map:sources[index].title,lighting,heavy,animated:animate,idle,camera});console.log('Benchmark '+sources[index].title+' '+lighting+(heavy?' heavy':'')+' '+(animate?'animated':'static')+' '+idle.rafFps.toFixed(1)+' FPS / orbit '+camera.rafFps.toFixed(1));
   }
  }
  if(!process.env.DND_ANIMATED_SKIP_BENCH)writeFileSync(out+'/performance.json',JSON.stringify({gpu,preset:'balanced',viewport:[1600,1000],dpr:1,recordingDuringMeasurements:false,results:performanceResults},null,2));
  await selectMap(0);await setEnvironment(0,'day');admin.emit('map:setDoor',{mapId:maps[0].id,doorId:'passage-door',open:false});admin.emit('fog:resetExploration',{mapId:maps[0].id});await snap();
  const toggle=page.getByRole('button',{name:'Toggle map animation'});if(await toggle.getAttribute('aria-pressed')==='false')await toggle.click();await click(page.getByRole('button',{name:'Flat battlefield view',exact:true}));
  await page.evaluate(()=>{
   document.title='Animated Maps - Fog and Combat';
   const caption=document.createElement('div');caption.id='animated-caption';caption.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);max-width:650px;z-index:99;background:#10151dec;color:#ecd6a9;border:1px solid #a48a59;border-radius:6px;padding:8px 14px;text-align:center;font:17px Georgia;pointer-events:none';document.body.append(caption);
   const hud=document.createElement('div');hud.style.cssText='position:fixed;right:22px;bottom:18px;z-index:99;background:#10151dec;color:#c8e4cc;padding:6px 9px;font:13px monospace;pointer-events:none';document.body.append(hud);
   setInterval(()=>{const h=document.querySelector('[data-testid="miniature-layer"]') as HTMLElement|null;hud.textContent=`Balanced | ${h?.dataset.renderFps??'--'} render FPS | map ${document.querySelector('[data-testid="animated-map-video"]')?'animated':'still'}`;},500);
  });
  capture=await startAv1Capture(page,out+'/animated-gameplay-av1.mp4',{title:'Animated Maps - Fog and Combat',width:1600,height:1084});
  await chapter('Daylight: the closed passage hides the next chamber');await page.waitForTimeout(2200);
  await chapter('Approach the door, open it, and reveal the animated chamber');await walk(1050,580);
  const open=page.getByTestId('door-controls').getByRole('button',{name:/Open$/});await expect(open).toBeVisible();await click(open);await page.waitForTimeout(2200);await walk(1235,700);
  await chapter('Fog of war: leaving sight preserves a still, grayscale memory');await walk(1030,650);admin.emit('map:setDoor',{mapId:maps[0].id,doorId:'passage-door',open:false});await snap();await page.waitForTimeout(2500);
  await chapter('Regular darkness: darkvision and colored lantern light');await setEnvironment(0,'dungeon');admin.emit('token:setLantern',{tokenId:await actorId(),enabled:true});await snap();await page.waitForTimeout(2800);
  await chapter('Heavy darkness: the same animated map, with darkvision and a lantern');await setEnvironment(0,'dungeon',true);await click(page.getByRole('button',{name:'Tilted battlefield view',exact:true}));await page.waitForTimeout(2800);
  await chapter('Painted fog also masks the moving background');admin.emit('fog:setLayer',{mapId:maps[0].id,layer:'map',enabled:true});admin.emit('fog:cover',{mapId:maps[0].id,layer:'map',mode:'cover'});await snap();await page.waitForTimeout(1800);
  admin.emit('fog:setLayer',{mapId:maps[0].id,layer:'map',enabled:false});admin.emit('map:setDoor',{mapId:maps[0].id,doorId:'passage-door',open:true});await snap();await page.waitForTimeout(1800);
  await chapter('Fireball: choose an area, roll damage and grouped saves, then show impacts');await page.getByRole('button',{name:'Expand combat',exact:true}).click();
  await click(page.locator('.compact-player-combat').getByRole('button',{name:/Fireball/}));
  const area=page.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();const target=await point(await actorId(),1370,590);await page.mouse.move(target.x,target.y,{steps:20});await page.waitForTimeout(1000);await page.mouse.click(target.x,target.y);await page.waitForTimeout(1400);await click(area.getByRole('button',{name:/Confirm area/}));
  await settleRolls();await page.waitForTimeout(5000);
  const damaged=(await snap()).monsters.filter((m:any)=>m.name.startsWith('Goblin sentry'));expect(damaged.every((m:any)=>m.curHp<120)).toBe(true);
  await page.getByRole('button',{name:'Collapse combat',exact:true}).click();
  await chapter('The background can switch to its still image without changing the encounter');await click(toggle);await page.waitForTimeout(1800);await click(toggle);await page.waitForTimeout(1800);
  await selectMap(1);await setEnvironment(1,'dungeon',true);admin.emit('token:setLantern',{tokenId:await actorId(),enabled:true});await snap();
  await chapter('Haunted Forest: animated water beneath heavy darkness and exploration');await walk(1000,330);await page.waitForTimeout(2000);
  await chapter('Forest combat: a ranged spell and live dice over the animated map');
  admin.emit('token:spawn',{mapId:maps[1].id,kind:'monster',refId:template.id,x:1100,y:400});await snap();await page.waitForTimeout(1600);
  await page.getByRole('button',{name:'Expand combat',exact:true}).click();
  const forest=(await snap()).tokens.find((t:any)=>t.mapId===maps[1].id&&t.kind==='monster');
  await page.getByLabel('Attack target',{exact:true}).selectOption(forest.id);
  await click(page.locator('.compact-player-combat').getByRole('button',{name:/Fire Bolt/}));await settleRolls();
  const damageButton=page.locator('.damage-prompt-btn');if(await damageButton.isVisible()){await click(damageButton);await settleRolls();}await page.waitForTimeout(4000);
  await page.getByRole('button',{name:'Collapse combat',exact:true}).click();
  await selectMap(2);await setEnvironment(2,'day');await chapter('Volcano Temple: animation, figures, grid and camera share the map plane');await walk(1300,650);await page.mouse.move(280,360);await page.mouse.down({button:'right'});await page.mouse.move(400,360,{steps:45});await page.mouse.up({button:'right'});await page.waitForTimeout(2400);
  await capture.stop();capture=undefined;
  await page.screenshot({path:out+'/poster.jpg'}); // Stills happen only AFTER live capture ends.
  expect(errors).toEqual([]);writeFileSync(out+'/receipt.json',JSON.stringify({chapters,gpu,errors,scope:'Real animated-map upload, saved state, player fog/darkness/combat; disposable campaign',maps:maps.map((m,i)=>({title:sources[i].title,poster:m.imagePath,video:m.videoPath,source:sources[i].source})),combatDamage:damaged.map((m:any)=>({name:m.name,damage:120-m.curHp}))},null,2));
 }finally{if(capture)await capture.stop();admin.disconnect();await context.close();}
});
