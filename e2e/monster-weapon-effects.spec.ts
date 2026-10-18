import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import type {StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {waitForCombatRoll} from './helpers/combatLive';

test('a monster hit and DM damage click produce the physical impact in both map views',async({page,browser,request})=>{
 test.setTimeout(180000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Monster physical feedback'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const snapshot=async():Promise<StateSnapshot>=>(await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const playerContext=await browser.newContext({viewport:{width:1440,height:930}}),player=await playerContext.newPage();
 try{
  const druk=(await snapshot()).characters.find(c=>c.name==='Druk')!;
  socket.emit('character:update',{characterId:druk.id,armorClass:1,maxHp:200,curHp:200});socket.emit('session:setManualDamage',{manual:true});socket.emit('session:setHideDmRolls',{hide:false});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=600;const x=c.getContext('2d')!;x.fillStyle='#354039';x.fillRect(0,0,900,600);return c.toDataURL('image/png').split(',')[1]});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Monster effect map',image:{name:'map.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens']){socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});socket.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:450,y:300});
  socket.emit('monster:create',{name:'Goblin striker',modelType:'goblin',maxHp:100,weapons:[{name:'Scimitar',kind:'melee',damage:'1d6',damageType:'slashing',attackBonus:100}]});
  const template=(await snapshot()).monsterTemplates.find(m=>m.name==='Goblin striker')!;
  socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:400,y:300});const ready=await snapshot(),enemy=ready.tokens.find(t=>t.kind==='monster')!,pc=ready.tokens.find(t=>t.kind==='pc')!;
  for(const p of [page,player])await p.addInitScript(()=>{localStorage.setItem('dnd.rollAnimOff','1');localStorage.setItem('dnd-environment-quality','balanced');});
  await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  for(const p of [page,player]){await p.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','2',{timeout:60000});}
  let hit;
  for(let attempt=0;attempt<5&&!hit;attempt++){
   const previous=new Set((await snapshot()).rollLog.map(r=>r.id));socket.emit('combat:attack',{attackerTokenId:enemy.id,targetTokenId:pc.id,weaponIndex:0});
   const roll=await waitForCombatRoll(snapshot,previous,r=>r.roller==='DM'&&r.label==='Attack');if(roll.pending&&!roll.pending.done)hit=roll;
  }
  expect(hit).toBeTruthy();await expect(page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn')).toBeVisible();
  await page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').click({force:true});
  for(const p of [page,player])await expect.poll(()=>p.getByTestId('miniature-layer').getAttribute('data-spell-impact-kinds'),{timeout:30000,intervals:[30,50,100]}).toContain('weapon-slash');
  expect((await snapshot()).characters.find(c=>c.id===druk.id)!.curHp).toBeLessThan(200);
  for(const p of [page,player])await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-spell-impact-count','0',{timeout:10000});
 }finally{socket.disconnect();await playerContext.close();}
});
