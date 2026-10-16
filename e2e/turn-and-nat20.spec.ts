import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import type {LiveDiceFrame} from '../shared/liveDiceTypes';
import {DM_SECRET,PORT} from './playwright.config';

test('a turn announcement is consumed by the attack and never reappears before damage',async({page,request},info)=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Turn announcement lifetime'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
 let s=await snapshot();const c=s.characters.find((c:any)=>c.name==='Varis');
 dm.emit('character:update',{characterId:c.id,className:'Ranger',weapons:[{name:'Banner longbow',kind:'ranged',damage:'1d8',attackBonus:100,damageType:'piercing'}]});
 dm.emit('session:setManualDamage',{manual:true});
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#343b35'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Banner test',image:{name:'arena.png',mimeType:'image/png',buffer:image}}})).json();
 dm.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:300,y:300});
 dm.emit('monster:create',{name:'Banner goblin',modelType:'goblin',disposition:'enemy',maxHp:100,armorClass:1});
 s=await snapshot();const template=s.monsterTemplates.find((m:any)=>m.name==='Banner goblin');
 dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:450,y:300});s=await snapshot();
 const hero=s.tokens.find((t:any)=>t.refId===c.id),enemy=s.tokens.find((t:any)=>t.kind==='monster');
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Varis'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
 dm.emit('initiative:set',{tokenId:enemy.id,initiative:20});dm.emit('initiative:set',{tokenId:hero.id,initiative:10});dm.emit('initiative:setRound',{round:1});await snapshot();
 for(let i=0;i<3;i++){s=await snapshot();if(s.activeTurnTokenId===hero.id)break;dm.emit('initiative:next');await snapshot();}
 await expect(page.locator('.combat-moment-turn')).toContainText('Your Turn');
 await page.getByLabel('Attack target',{exact:true}).selectOption(enemy.id);
 let hit=false;
 for(let i=0;i<3;i++){
  await page.locator('.compact-player-combat').getByRole('button',{name:/Banner longbow/}).click();
  await expect(page.locator('[data-live-dice=true]')).toBeVisible();
  await expect(page.locator('.combat-moment-turn')).toHaveCount(0);
  await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:45000});
  await page.waitForTimeout(700);await expect(page.locator('.combat-moment-turn')).toHaveCount(0);
  expect((await snapshot()).activeTurnTokenId).toBe(hero.id);
  hit=await page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').isVisible();if(hit)break;
 }
 expect(hit).toBe(true);await page.screenshot({path:info.outputPath('hit-without-repeated-turn.png')});
 const button=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn'),box=await button.boundingBox();
 await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
 await expect(page.locator('[data-live-dice=true]')).toBeVisible();await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:45000});
 await expect(page.locator('.combat-moment-turn')).toHaveCount(0);expect((await snapshot()).activeTurnTokenId).toBe(hero.id);
 // The next actual turn still receives a fresh announcement.
 dm.emit('initiative:next');await snapshot();dm.emit('initiative:next');await snapshot();await expect(page.locator('.combat-moment-turn')).toContainText('Your Turn');
 }finally{dm.disconnect();}
});

test('a natural skill 20 bursts over the tray, ignores discarded twenties, and supports reduced motion',async({page,request},info)=>{
 test.setTimeout(90000);
 let send:(frame:LiveDiceFrame)=>void=()=>{throw Error('Not connected');};
 await page.routeWebSocket(/socket\.io/,ws=>{const upstream=ws.connectToServer();upstream.onMessage(m=>ws.send(m));send=f=>ws.send('42'+JSON.stringify(['dice:frame',f]));});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Natural twenty presentation fixtures'}})).json();
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Varis'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
 await page.emulateMedia({reducedMotion:'no-preference'});
 const make=(id:string,values:number[],extra:Partial<LiveDiceFrame>={}):LiveDiceFrame=>({id,seq:0,label:'Perception',roller:'Varis',className:'Ranger',sides:values.map(()=>20),radius:1,sets:values.map((_,i)=>i),critical:values.map(()=>false),percentile:values.map(()=>null),values,rerolls:values.map(()=>0),poses:values.flatMap((_,i)=>[i*2,0,1,0,0,0,1]),elapsed:4,done:true,...extra});
 send(make('skill-twenty',[20]));
 const popup=page.getByRole('status',{name:'Natural 20 celebration',exact:true});
 await expect(popup).toHaveText('Nat 20!');await expect(popup).toHaveCSS('position','absolute');await expect(popup).toHaveCSS('animation-name','nat20-celebrate');
 await page.waitForTimeout(450);const p=await popup.boundingBox(),tray=await page.locator('.dice-tray-stage').boundingBox();
 expect(p!.y+p!.height/2).toBeGreaterThan(tray!.y);expect(p!.y+p!.height/2).toBeLessThan(tray!.y+tray!.height);
 await expect(page.getByRole('status',{name:'Roll result',exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('nat20-popup.png')});
 await page.evaluate(()=>{(window as any).__nat20=document.querySelector('.nat20-celebration');});
 send(make('skill-twenty',[20],{seq:1,calculation:{kind:'check',attacker:'Varis',title:'Perception',physical:true,d20:20,toHit:[{label:'WIS',value:3}],attackTotal:23,outcome:'none'}}));
 await expect(popup).toHaveCount(1);expect(await page.evaluate(()=>document.querySelector('.nat20-celebration')===(window as any).__nat20)).toBe(true);
 send(make('discarded-twenty',[20,7],{mode:'dis',kept:1}));await expect(popup).toHaveCount(0);
 send(make('ordinary-check',[19]));await expect(popup).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});send(make('mobile-twenty',[20]));
 await expect(popup).toHaveText('Nat 20!');await expect(popup).toHaveCSS('animation-name','none');await expect(popup.locator('.nat20-sparks')).toHaveCSS('display','none');
 const mobile=await popup.boundingBox();expect(mobile!.x).toBeGreaterThanOrEqual(0);expect(mobile!.x+mobile!.width).toBeLessThanOrEqual(390);
 await page.screenshot({path:info.outputPath('nat20-mobile.png')});
});
