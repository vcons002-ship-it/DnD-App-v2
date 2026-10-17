import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import type {StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';

test('DM gets a compact transient notice for every combatant while players keep their personal spotlight',async({page,browser,request},info)=>{
 test.setTimeout(90000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Compact DM turn notices'}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async():Promise<StateSnapshot>=>{
  const reply=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  expect(reply.ok).toBe(true);return reply.snapshot;
 };
 const playerContext=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'no-preference'});
 const player=await playerContext.newPage(),errors:string[]=[];
 for(const p of [page,player])p.on('pageerror',e=>errors.push(e.message));
 try{
  let state=await snapshot();const druk=state.characters.find(c=>c.name==='Druk')!;
  const image=await sharp({create:{width:1000,height:650,channels:3,background:'#313c36'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Turn notice arena',image:{name:'arena.png',mimeType:'image/png',buffer:image}}})).json();
  admin.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'] as const)admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:300,y:350});
  admin.emit('monster:create',{name:'Cave goblin',modelType:'goblin',maxHp:10,disposition:'enemy'});state=await snapshot();
  const template=state.monsterTemplates.find(m=>m.name==='Cave goblin')!;
  admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:500,y:300});
  admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:550,y:400});state=await snapshot();
  const hero=state.tokens.find(t=>t.kind==='pc')!,enemies=state.tokens.filter(t=>t.kind==='monster');
  const enemyName=(index:number)=>state.monsters.find(m=>m.id===enemies[index].refId)!.name;
  await page.setViewportSize({width:1366,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect(page.locator('.dm-fantasy')).toBeVisible();
  await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(player.getByTestId('player-hud')).toBeVisible();
  const dmNotice=page.getByRole('status',{name:'Current turn',exact:true});
  await expect(page.locator('.combat-moment-turn')).toHaveCount(0);
  admin.emit('initiative:set',{tokenId:hero.id,initiative:30});
  for(const [i,token]of enemies.entries())admin.emit('initiative:set',{tokenId:token.id,initiative:20-i*10});
  admin.emit('initiative:setRound',{round:1});await snapshot();admin.emit('initiative:next');await snapshot();
  await expect(dmNotice).toContainText('Druk’s turn');await expect(player.locator('.combat-moment-turn')).toContainText('Your Turn');
  expect(await dmNotice.locator('strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(20);
  expect(await player.locator('.combat-moment-turn strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(60);
  const bounds=(await dmNotice.boundingBox())!,mapBounds=(await page.locator('.dm-fantasy > .body').boundingBox())!;
  expect(bounds.height).toBeLessThan(60);expect(bounds.y).toBeGreaterThanOrEqual(mapBounds.y);expect(bounds.y-mapBounds.y).toBeLessThan(40);
  await page.screenshot({path:info.outputPath('dm-compact-player-turn.png')});
  admin.emit('initiative:next');await snapshot();await expect(dmNotice).toContainText(enemyName(0));
  await expect(player.locator('.combat-moment-turn')).toHaveCount(0);
  admin.emit('initiative:next');await snapshot();await expect(dmNotice).toContainText(enemyName(1));await expect(dmNotice).toHaveCount(1);
  await page.screenshot({path:info.outputPath('dm-compact-monster-turn.png')});
  await expect(dmNotice).toHaveCount(0,{timeout:5000});
  await page.reload();await expect(page.locator('.dm-fantasy')).toBeVisible();await expect(dmNotice).toHaveCount(0);
  await page.setViewportSize({width:430,height:932});await page.emulateMedia({reducedMotion:'reduce'});
  admin.emit('initiative:next');await snapshot();await expect(dmNotice).toContainText('Druk’s turn');await expect(dmNotice).toHaveCSS('animation-name','none');
  const small=(await dmNotice.boundingBox())!,tools=(await page.getByRole('navigation',{name:'DM tools'}).boundingBox())!;
  expect(small.x).toBeGreaterThanOrEqual(0);expect(small.x+small.width).toBeLessThanOrEqual(430);expect(small.y).toBeGreaterThanOrEqual(tools.y+tools.height);
  await page.screenshot({path:info.outputPath('dm-compact-mobile.png')});await dmNotice.getByRole('button',{name:'Dismiss announcement'}).click();await expect(dmNotice).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{admin.disconnect();await playerContext.close();}
});
