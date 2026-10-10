import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {DM_SECRET,PORT} from './playwright.config';

test('graphics presets change real crowded-board budgets locally, persist and preserve dungeon lighting',async({browser,request},info)=>{
 test.setTimeout(180000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Graphics preset comparison'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const dmContext=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:2});
 const playerContext=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:2});
 try{
  const initial=await snap();
  socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries()){
   const character=initial.characters.find((c:any)=>c.name===name);
   socket.emit('character:update',{characterId:character.id,className:['Fighter','Ranger','Sorcerer'][i]});
   socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:character.id,x:440+i*120,y:600});
  }
  socket.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:12,armorClass:12,disposition:'enemy'});
  const goblin=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');
  for(let i=0;i<24;i++)socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:goblin.id,x:200+i%8*100,y:200+Math.floor(i/8)*100});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',mist:true,mistHeightFt:6,mistOpacity:.5,weather:'rain',weatherIntensity:1,particles:'embers',particleIntensity:1,lights:[
   {id:'left',x:400,y:450,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true},
   {id:'right',x:700,y:450,radiusFt:30,heightFt:9,intensity:1,color:'cool',flicker:true},
   {id:'north',x:500,y:300,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true},
  ]}});
  const saved=(await snap()).map.environment;
  const dm=await dmContext.newPage();await dm.goto(`/dm?code=${code}&benchmark=1`);
  await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await dm.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
  const layer=dm.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','27',{timeout:60000});
  await dm.getByRole('button',{name:'Maps',exact:true}).click();await dm.locator('.map-environment-controls > summary').click();
  const select=dm.getByLabel('Graphics quality',{exact:true});await expect(select).toBeVisible();
  const results=[];
  for(const [quality,ratio,shadowSize,weather,particles] of [['high','2','512','2200','900'],['balanced','1.5','384','770','315'],['low','1','256','396','162']] as const){
   await select.selectOption(quality);
   await expect(layer).toHaveAttribute('data-render-pixel-ratio',ratio);await expect(layer).toHaveAttribute('data-local-shadow-size',shadowSize);
   await expect(layer).toHaveAttribute('data-weather-count',weather);await expect(layer).toHaveAttribute('data-particle-count',particles);
   await expect(layer).toHaveAttribute('data-light-count','3');await expect(layer).toHaveAttribute('data-miniature-count','27');
   await expect(layer).toHaveAttribute('data-local-shadow-lights',quality==='low'?'2':'3');
   await dm.waitForTimeout(4500);
   results.push({quality,data:await layer.evaluate(e=>({...((e as HTMLElement).dataset)}))});
   await dm.screenshot({path:info.outputPath(`${quality}.png`)});
  }
  const player=await playerContext.newPage();await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
  const playerLayer=player.getByTestId('miniature-layer');await expect(playerLayer).toHaveAttribute('data-graphics-quality','balanced',{timeout:60000});
  await expect(playerLayer).toHaveAttribute('data-model-quality','balanced');
  await player.getByRole('button',{name:'Interface settings',exact:true}).click();await player.getByLabel('Graphics quality',{exact:true}).selectOption('balanced');
  await expect(playerLayer).toHaveAttribute('data-render-pixel-ratio','1.5');await expect(layer).toHaveAttribute('data-graphics-quality','low');
  await player.getByLabel('Graphics quality',{exact:true}).selectOption('low');
  await player.getByRole('button',{name:'Close interface settings',exact:true}).click();
  await player.getByRole('button',{name:'Roll a d20',exact:true}).click();
  const tray=player.locator('[data-live-dice="true"] .physics-dice-tray');
  await expect(tray).toHaveAttribute('data-theme','fighter');
  await expect(tray).toHaveAttribute('data-status','settled',{timeout:30000});
  await expect(player.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:15000});
  await player.keyboard.press('Escape');
  await dm.reload();await expect(layer).toHaveAttribute('data-graphics-quality','low',{timeout:60000});
  await dm.getByRole('button',{name:'Maps',exact:true}).click();await dm.locator('.map-environment-controls > summary').click();
  await dm.getByLabel('Graphics quality',{exact:true}).selectOption('off');
  await expect(layer).toHaveAttribute('data-environment','on');await expect(layer).toHaveAttribute('data-light-count','3');await expect(layer).toHaveAttribute('data-mist-visible','false');
  await expect(layer).toHaveAttribute('data-weather-count','0');await expect(layer).toHaveAttribute('data-local-shadow-lights','0');
  expect((await snap()).map.environment).toEqual(saved);
  await dm.getByLabel('Campaign menu',{exact:true}).click();await dm.getByRole('button',{name:/Settings/}).click();
  await expect(dm.getByRole('region',{name:'DM interface settings'}).getByLabel('Graphics quality',{exact:true})).toHaveValue('off');
  await dm.locator('.modal-head button').click();
  await player.setViewportSize({width:390,height:844});await player.getByRole('button',{name:'Interface settings',exact:true}).click();await player.getByLabel('Graphics quality',{exact:true}).selectOption('auto');
  await expect(playerLayer).toHaveAttribute('data-graphics-quality','balanced');
  writeFileSync(info.outputPath('performance-baseline.json'),JSON.stringify({note:'Desktop GPU, DPR 2. Not a phone hardware benchmark.',results},null,2));
 }finally{socket.disconnect();await dmContext.close();await playerContext.close();}
});

test('dice budgets retain theme materials and stable projection without changing during an active roll',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {createTrayRenderer} from './client/src/lib/diceTrayRenderer';
 import {DICE_THEMES} from './shared/diceThemes';
 window.checkDiceBudgets=()=>{
  const results=[];
  for(const quality of ['high','balanced','low']){
   localStorage.setItem('dnd-environment-quality',quality);
   const toss={settleTimes:[],wallHits:0,frames:new Float32Array(14),frameCount:2,step:1,radius:.65,trayScale:1,topFaces:[0],duration:1};
   const tray=createTrayRenderer([{sides:20,value:20,index:0,set:0}],toss,DICE_THEMES.fighter);
   const before=tray.graphicsState(),footprint=tray.trayFootprint();
   localStorage.setItem('dnd-environment-quality','off');
   results.push({quality,before,after:tray.graphicsState(),footprint});tray.dispose();
  }return results;
 };
 `}});
 await page.goto('/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).checkDiceBudgets());
 expect(result.map((r:any)=>r.before.shadowSize)).toEqual([1024,512,256]);
 for(const r of result){expect(r.after).toEqual(r.before);expect(r.footprint).toEqual(result[0].footprint);}
});
