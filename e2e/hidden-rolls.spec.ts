import {readFileSync} from 'node:fs';
import {test,expect} from './helpers/test';
import {io,type Socket} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import type {StateSnapshot} from '../shared/types';

// The DM's private rolls wait in the approval tray; players receive no dice,
// no review and no HP change until the DM applies a result. Results are
// entered by hand here so the test checks the approval contract, not the
// physics presentation. The server-side transaction is covered in
// server/src/hiddenRollApproval.test.ts.
test('hidden DM rolls wait for approval; players see only applied outcomes',async({page,browser,request})=>{
 test.setTimeout(240000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Private DM approval'}})).json();
 const sockets:Socket[]=[];
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(dm);
 const observer=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(observer);
 const snapshot=async():Promise<StateSnapshot>=>(await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const playerView=async()=>(await observer.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'})).snapshot as StateSnapshot;
 const playerContext=await browser.newContext({viewport:{width:1600,height:1000}}),player=await playerContext.newPage();
 try{
  const druk=(await snapshot()).characters.find(c=>c.name==='Druk')!;
  dm.emit('character:update',{characterId:druk.id,className:'Fighter',level:3,armorClass:12,maxHp:40,curHp:40,stats:{STR:18,DEX:12,CON:14,INT:10,WIS:10,CHA:10}});
  dm.emit('session:setManualDamage',{manual:true});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
  dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});
  for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:600,y:540});
  dm.emit('monster:create',{name:'Goblin',modelType:'goblin',disposition:'enemy',maxHp:40,armorClass:12,stats:{STR:12,DEX:14,CON:10,INT:8,WIS:10,CHA:8},weapons:[{name:'Scimitar',kind:'melee',damage:'1d6+2',damageType:'slashing',attackBonus:5}]});
  const template=(await snapshot()).monsterTemplates.find(m=>m.name==='Goblin')!;
  dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:635,y:480});
  const setup=await snapshot(),pc=setup.tokens.find(t=>t.kind==='pc')!,enemy=setup.tokens.find(t=>t.kind==='monster')!;
  const hp=()=>snapshot().then(s=>s.characters.find(c=>c.id===druk.id)!.curHp);
  const playerFrames:unknown[]=[],playerReviews:unknown[]=[],playerHp:unknown[]=[];
  observer.on('dice:frame',f=>playerFrames.push(f));observer.on('dice:hiddenReview',r=>playerReviews.push(r));observer.on('fx:hp',e=>playerHp.push(e));
  await playerView();
  await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
  await page.setViewportSize({width:1600,height:1000});await page.goto(`/dm?code=${code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await page.getByRole('button',{name:'Chat & dice',exact:true}).click();await page.locator('.chat-dice-options > summary').click();
  await page.getByRole('button',{name:/DM rolls shown/}).click();
  await expect.poll(async()=>(await snapshot()).hideDmRolls).toBe(true);
  await page.getByRole('button',{name:'Close DM panel',exact:true}).click();
  // Both tokens have a hit region on the stage before the DM clicks them.
  await expect.poll(()=>page.evaluate(ids=>(window as any).Konva?.stages.some((s:any)=>ids.every((id:string)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id))),[pc.id,enemy.id]),{timeout:30000}).toBe(true);
  const point=(id:string)=>page.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},id);
  const review=page.getByRole('region',{name:'Approve hidden result'});

  // 1. The goblin's hidden attack on Druk: nothing is logged or sent to players.
  const b=await point(enemy.id),p=await point(pc.id);
  await page.mouse.click(b.x,b.y);await page.mouse.click(p.x,p.y,{button:'right'});
  await page.getByRole('dialog',{name:'Token actions'}).getByRole('button',{name:/Scimitar/}).click();
  await expect(review).toBeVisible({timeout:30000});
  await expect(review.getByRole('button',{name:'Cancel attack',exact:true})).toBeVisible();
  expect((await snapshot()).rollLog).toHaveLength(0);expect(await hp()).toBe(40);
  expect(playerFrames).toHaveLength(0);expect(playerReviews).toHaveLength(0);expect(playerHp).toHaveLength(0);
  await expect(player.locator('.roll-reveal-backdrop')).toHaveCount(0);
  // Rejecting rerolls privately; the log stays empty.
  const firstReview=await review.getAttribute('data-review-id');
  await review.getByRole('button',{name:'Reject & reroll',exact:true}).click();
  await expect(review).not.toHaveAttribute('data-review-id',firstReview!,{timeout:30000});
  expect((await snapshot()).rollLog).toHaveLength(0);
  // An entered total is reviewed, then applied: one log entry with pending damage.
  await review.getByRole('button',{name:'Enter result',exact:true}).click();
  await review.getByLabel('Final total (includes modifiers)',{exact:true}).fill('17');
  await review.getByRole('button',{name:'Review entered result',exact:true}).click();
  await expect(review.locator('[data-outcome=hit]')).toHaveText('Hit');
  expect((await playerView()).rollLog).toEqual([]);
  await review.getByRole('button',{name:'Apply result',exact:true}).click();
  await expect(review).toHaveCount(0);
  await expect.poll(async()=>(await snapshot()).rollLog.length).toBe(1);
  const attack=(await snapshot()).rollLog[0];expect(attack.pending).toBeTruthy();expect(await hp()).toBe(40);

  // 2. The damage roll waits the same way; applying it changes HP exactly once.
  const damageButton=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn');
  await expect(damageButton).toBeVisible({timeout:30000});
  const box=(await damageButton.boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(review).toBeVisible({timeout:30000});
  await expect(review.getByRole('button',{name:'Cancel damage roll',exact:true})).toBeVisible();
  expect(await hp()).toBe(40);expect(playerHp).toHaveLength(0);
  await review.getByRole('button',{name:'Enter result',exact:true}).click();
  await review.locator('input[type=number]').fill('4');
  await review.getByRole('button',{name:'Review entered result',exact:true}).click();
  await expect(review).toContainText('DM-entered result');expect(await hp()).toBe(40);
  await review.getByRole('button',{name:'Apply result',exact:true}).click();
  await expect.poll(hp,{timeout:30000}).toBeLessThan(40);
  await expect(review).toHaveCount(0);
  const resolved=(await snapshot()).rollLog.find(r=>r.id===attack.id)!;
  expect(40-(await hp())).toBe(resolved.pending!.amount);
  await expect.poll(()=>playerHp.length).toBeGreaterThan(0);
  expect(playerFrames).toHaveLength(0);expect(playerReviews).toHaveLength(0);
  await expect(player.locator('.roll-reveal-backdrop')).toHaveCount(0);

  // 3. A cancelled private roll leaves no trace; players only ever get outcomes.
  await page.getByRole('button',{name:'Chat & dice',exact:true}).click();
  if(!await page.locator('.dice-row input[placeholder="2d6+3"]').isVisible())await page.locator('.chat-dice-options > summary').click();
  const beforeDiscard=(await snapshot()).rollLog.length;
  await page.locator('.dice-row input[placeholder="2d6+3"]').fill('1d20+7');
  await page.locator('.dice-row').getByRole('button',{name:'Roll',exact:true}).click();
  await expect(review).toBeVisible({timeout:30000});
  await review.getByRole('button',{name:'Cancel roll'}).click();await expect(review).toHaveCount(0);
  expect((await snapshot()).rollLog).toHaveLength(beforeDiscard);
  const visible=(await playerView()).rollLog;
  expect(visible.length).toBeGreaterThan(0);
  expect(visible.every(r=>r.outcomeOnly&&r.hideTotal&&!r.reveal&&!r.expr&&!r.description&&!r.pending&&!r.apply)).toBe(true);
 }finally{sockets.forEach(s=>s.disconnect());await playerContext.close();}
});
