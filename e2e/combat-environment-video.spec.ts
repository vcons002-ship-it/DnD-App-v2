import {test,expect,type Page} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {DM_SECRET,PORT} from './playwright.config';
test.beforeAll(()=>{const require=createRequire(process.cwd()+'/package.json');const e=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');const f=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];e.executablePath=()=>f;e.executablePathOrDie=()=>f;});

test('combat and environment video',async({browser,request},info)=>{
 test.setTimeout(420000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Courtyard encounter - dice and atmosphere'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await snap();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Castle courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});
 socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});socket.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});socket.emit('map:setActive',{mapId:map.id});socket.emit('session:setManualDamage',{manual:true});
 const people:any={};
 for(const [name,cls,x,y,weapon] of [['Druk','Fighter',460,610,'Greatsword'],['Varis','Ranger',660,640,'Longbow'],['Vanec','Sorcerer',820,630,'Quarterstaff']] as const){
  const c=initial.characters.find((c:any)=>c.name===name);people[name]=c;
  socket.emit('character:update',{characterId:c.id,className:cls,race:name==='Druk'?'Half-Orc':'Half-Elf',level:13,maxHp:110,curHp:110,armorClass:17,stats:{STR:18,DEX:18,CON:16,INT:12,WIS:16,CHA:20},weapons:[{name:weapon,kind:name==='Varis'?'ranged':'melee',damage:name==='Druk'?'2d6':name==='Varis'?'1d8':'1d6',damageType:name==='Varis'?'piercing':'slashing',attackBonus:8}],spellSlots:{L1:{max:4,used:0},L3:{max:3,used:0},L7:{max:1,used:0}},sheetAbilities:name==='Vanec'?[{id:'fireball',name:'Fireball',type:'spell',level:3,description:'Dexterity save for half damage.',roll:{kind:'save',dice:'8d6',scaleDice:'1d6',save:'DEX',saveDamage:'half',damageType:'fire',baseLevel:3}},{id:'bolt',name:'Fire Bolt',type:'spell',level:0,description:'A bolt of fire.',roll:{kind:'attack',dice:'3d10',damageType:'fire',cantripScale:false}}]:[]});
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x,y});
 }
 for(const [name,modelType,x,y] of [['Bugbear','bugbear',560,470],['Goblin','goblin',720,390],['Skeleton','skeleton',900,440]] as const){socket.emit('monster:create',{name,modelType,maxHp:100,armorClass:12,disposition:'enemy',weapons:[{name:'Blade',kind:'melee',damage:'1d6+3',damageType:'slashing',attackBonus:5}]});const m=(await snap()).monsterTemplates.find((m:any)=>m.name===name);socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:m.id,x,y});}
 await snap();
 const chapters:any[]=[];let page:Page;let context:any;
 const caption=async(text:string)=>{await page.evaluate(text=>{let e=document.getElementById('demo-caption');if(!e){e=document.createElement('div');e.id='demo-caption';e.style.cssText='position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:99999;background:#111a24ef;border:1px solid #a48b5a;border-radius:8px;color:#f4e6c6;padding:10px 22px;font:22px Georgia;white-space:nowrap;pointer-events:none';document.body.append(e);}e.textContent=text;},text);await page.waitForTimeout(700);};
 const tokens=async()=> (await snap()).tokens;
 const point=async(id:string,dx=0,dy=0)=>page.evaluate(({id,dx,dy})=>{const K=(window as any).Konva;const s=K.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),scale=n.getAbsoluteScale(),r=s.container().getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform),v=new DOMPoint(p.x+dx*scale.x-s.width()/2,p.y+dy*scale.y-s.height()/2).matrixTransform(m);return{x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};},{id,dx,dy});
 const move=async(name:string,dx:number,dy:number)=>{const t=(await tokens()).find((t:any)=>t.refId===people[name].id),a=await point(t.id),b=await point(t.id,dx,dy);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:30});await page.waitForTimeout(850);await page.mouse.up();await page.waitForTimeout(2200);};
 const roll=async(action:()=>Promise<any>)=>{await action();await expect(page.locator('[data-live-dice="true"]')).toBeVisible({timeout:15000});if(process.env.DND_DRUK_ONLY==='1')await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-theme','fighter');await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:45000});await page.waitForTimeout(2600);await page.keyboard.press('Escape');};
 const selectEnemy=async(name:string)=>{const s=await snap();const t=s.tokens.find((t:any)=>t.kind==='monster'&&s.monsters.find((m:any)=>m.id===t.refId)?.name.startsWith(name));await page.locator('.compact-player-combat select').first().selectOption(t.id);return t;};
 const weapon=async(name:string)=>{await roll(async()=>{await page.locator('.compact-player-combat').getByRole('button',{name:new RegExp(name)}).click();});if(await page.locator('.damage-prompt-btn').count())await roll(()=>page.locator('.damage-prompt-btn').first().click());};
 const begin=async(name:string,text:string)=>{context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:1000},recordVideo:{dir:info.outputPath(name),size:{width:1440,height:1000}}});page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:name}).click();await expect(page.getByTestId('player-hud')).toBeVisible();await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','6',{timeout:60000});await page.waitForTimeout(2500);await caption(text);await page.screenshot({path:info.outputPath(name+'-start.png')});};
 const end=async(name:string)=>{await page.waitForTimeout(1800);await page.screenshot({path:info.outputPath(name+'-end.png')});const video=page.video()!;await context.close();chapters.push({name,video:await video.path(),poster:info.outputPath(name+'-start.png')});};
 try{
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',mist:false,weather:'none',shadows:true}});await snap();
  await begin('Druk','Druk - move into melee, then roll attack and damage');
  await move('Druk',85,-90);await selectEnemy('Bugbear');await weapon('Greatsword');
  await caption('Rain and wind arrive over the courtyard');socket.emit('map:setEnvironment',{mapId:map.id,settings:{lighting:'dusk',weather:'rain',weatherIntensity:.65,windStrength:1.2,mist:true,mistOpacity:.2,mistHeightFt:2}});await snap();await page.waitForTimeout(4500);
  await move('Druk',-55,45);await end('Druk');
  if(process.env.DND_DRUK_ONLY==='1'){writeFileSync(info.outputPath('chapters.json'),JSON.stringify(chapters,null,2));return;}
  await begin('Varis','Varis - ranged attack through rain and mist');await selectEnemy('Skeleton');await weapon('Longbow');
  await caption('Dim dungeon light - a carried lantern lights the path');socket.emit('map:setEnvironment',{mapId:map.id,settings:{lighting:'dungeon',heavyDarkness:false,weather:'none',mistOpacity:.24,lights:[{id:'torch',x:740,y:460,radiusFt:20,heightFt:6,intensity:1,color:'warm',flicker:true,visibleTorch:true}]}});const vt=(await tokens()).find((t:any)=>t.refId===people.Varis.id);socket.emit('token:setLantern',{tokenId:vt.id,enabled:true});await snap();await page.waitForTimeout(4500);await move('Varis',90,-70);await end('Varis');
  await begin('Vanec','Vanec - Fire Bolt: attack roll and spell damage');await selectEnemy('Goblin');await weapon('Fire Bolt');
  await caption('Heavy darkness - lanterns and torches reveal the figures');socket.emit('map:setEnvironment',{mapId:map.id,settings:{heavyDarkness:true,mistOpacity:.3,mistHeightFt:3}});const nt=(await tokens()).find((t:any)=>t.refId===people.Vanec.id);socket.emit('token:setLantern',{tokenId:nt.id,enabled:true});await snap();await page.waitForTimeout(4500);await move('Vanec',-40,-60);
  await caption('Level 7 Fireball - twelve d6 rolled together');await page.locator('.compact-player-combat select').last().selectOption('7');await roll(()=>page.locator('.compact-player-combat').getByRole('button',{name:/Fireball/}).click());
  await caption('Apply Fireball - saving throw and damage on the map');await page.locator('.damage-prompt-btn').first().click();const st=await snap();const enemy=st.tokens.find((t:any)=>t.kind==='monster'&&st.monsters.find((m:any)=>m.id===t.refId)?.name.startsWith('Skeleton'));const ep=await point(enemy.id);await page.mouse.click(ep.x,ep.y);await page.waitForTimeout(6500);await page.keyboard.press('Escape');
  await caption('Back to clear daylight - overhead battlefield');socket.emit('map:setEnvironment',{mapId:map.id,settings:{lighting:'day',heavyDarkness:false,mist:false,weather:'none',lights:[]}});await snap();await page.getByRole('button',{name:'Flat battlefield view',exact:true}).click();await page.waitForTimeout(4000);await end('Vanec');
  writeFileSync(info.outputPath('chapters.json'),JSON.stringify(chapters,null,2));writeFileSync(info.outputPath('rolls.json'),JSON.stringify((await snap()).rollLog,null,2));
 }finally{socket.disconnect();if(context)await context.close();}
});
