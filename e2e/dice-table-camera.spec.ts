import {test,expect} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';

test('camera visits the local, left, right and far DM trays before each live toss',async({page,request})=>{
 test.setTimeout(180000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Around the dice table'}})).json();
 const sockets:Socket[]=[];let owner:Socket|undefined;
 const connect=async(role:'dm'|'player')=>{
  const s=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(s);
  expect((await s.timeout(5000).emitWithAck('join',{sessionCode:code,role,dmPassphrase:role==='dm'?DM_SECRET:undefined})).ok).toBe(true);
  const seen=new Set<string>();
  s.on('dice:frame',frame=>{
   if(owner!==s||seen.has(frame.id))return;seen.add(frame.id);
   // Simulate this remote roller's ready acknowledgement only after the
   // recorded observer has completed the same camera journey.
   void page.waitForFunction(id=>{
    const tray=document.querySelector('.roll-reveal-backdrop'),canvas=document.querySelector('.dice-tray-canvas');
    return tray?.getAttribute('data-roll-id')===id&&JSON.parse(canvas?.getAttribute('data-table-camera')||'{}').done;
   },frame.id,{timeout:20000}).then(()=>s.emit('dice:ready',{id:frame.id}));
  });return s;
 };
 let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined;
 try{
  const dm=await connect('dm');
  const snapshot=async()=>(await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  const party=(await snapshot()).characters;
  for(const c of party)dm.emit('character:update',{characterId:c.id,className:c.name==='Druk'?'Fighter':c.name==='Varis'?'Ranger':'Sorcerer'});
  dm.emit('session:setHideDmRolls',{hide:false});await snapshot();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=700;const x=c.getContext('2d')!;x.fillStyle='#1e2927';x.fillRect(0,0,1200,700);x.strokeStyle='#52615b';for(let i=0;i<1200;i+=64){x.strokeRect(i,0,64,700);}for(let j=0;j<700;j+=64)x.strokeRect(0,j,1200,64);return c.toDataURL('image/png').split(',')[1];});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Table preview',image:{name:'table.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  dm.emit('map:setActive',{mapId:map.id});dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});await snapshot();
  const others=new Map<string,Socket>();
  for(const name of ['Varis','Vanec']){const s=await connect('player');s.emit('character:claim',{characterId:party.find((c:any)=>c.name===name).id});others.set(name,s);}
  await snapshot();
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();await page.waitForTimeout(3500);
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();
  await page.locator('.chat-dice-options summary').click();
  await page.evaluate(()=>{
   const samples:any[]=[];(window as any).__tableSamples=samples;(window as any).__tableSampling=true;
   const sample=()=>{const canvas=document.querySelector('.dice-tray-canvas');if(canvas){const camera=JSON.parse(canvas.getAttribute('data-table-camera')||'{}');samples.push({time:performance.now(),id:document.querySelector('.roll-reveal-backdrop')?.getAttribute('data-roll-id'),camera,physics:Number(canvas.getAttribute('data-physics-elapsed')||0)});}if((window as any).__tableSampling)requestAnimationFrame(sample);};sample();
  });
  if(process.env.DICE_TABLE_VIDEO)capture=await startAv1Capture(page,process.env.DICE_TABLE_VIDEO);
  const turns=[{name:'Druk',expr:'2d6',side:'bottom'},{name:'Varis',expr:'1d8',side:'left'},{name:'Vanec',expr:'2d8',side:'right'},{name:'DM',expr:'1d20',side:'top'}];
  for(const turn of turns){
   const id=turn.name==='DM'?'dm':party.find((c:any)=>c.name===turn.name).id;
   owner=turn.name==='DM'?dm:others.get(turn.name);
   if(turn.name==='Druk'){
    await page.locator('.chat-dice-options .dice-row input').nth(0).fill(turn.expr);
    await page.locator('.chat-dice-options .dice-row input').nth(1).fill('Druk — Table roll');
    await page.locator('.chat-dice-options').getByRole('button',{name:'Roll',exact:true}).click();
   }
   else owner!.emit('dice:roll',{expr:turn.expr,label:`${turn.name} — Table roll`});
   const tray=page.locator('.dice-tray-canvas');
   await expect(tray).toHaveAttribute('data-table-seat',id,{timeout:30000});await expect(tray).toHaveAttribute('data-table-side',turn.side);
   await page.waitForTimeout(450);await page.screenshot({path:test.info().outputPath(`${turn.name}-camera.png`)});
   await expect(page.locator('.tray-die-result').first()).toHaveAttribute('data-filled','true',{timeout:45000});
   await expect(page.locator('.roll-reveal-backdrop')).toHaveCount(0,{timeout:20000});
   await page.waitForTimeout(300);
  }
  const samples=await page.evaluate(()=>{(window as any).__tableSampling=false;return (window as any).__tableSamples;});
  for(const turn of turns){
   const id=turn.name==='DM'?'dm':party.find((c:any)=>c.name===turn.name).id;
   const journey=samples.filter((s:any)=>s.camera.to===id);
   expect(journey.some((s:any)=>s.camera.progress>0&&s.camera.progress<1)).toBe(true);
   expect(journey.some((s:any)=>s.camera.done&&s.physics>0)).toBe(true);
   expect(journey.filter((s:any)=>s.physics>0).every((s:any)=>s.camera.done)).toBe(true);
  }
  await test.info().attach('table-camera-timing',{body:JSON.stringify(samples),contentType:'application/json'});
 }finally{if(capture)await capture.stop();sockets.forEach(s=>s.disconnect());}
});
