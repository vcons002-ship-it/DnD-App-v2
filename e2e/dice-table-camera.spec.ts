import {test,expect} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';
import {readFileSync} from 'node:fs';
import {DICE_TABLE_PAN_MS} from '../client/src/lib/diceTableCamera';

test('fixed-zoom camera keeps the table mounted between rolls without an additional toss delay',async({page,request})=>{
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
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Table preview',image:{name:'table.png',mimeType:'image/png',buffer:process.env.DICE_TABLE_MAP?readFileSync(process.env.DICE_TABLE_MAP):Buffer.from(png,'base64')}}})).json();
  dm.emit('map:setActive',{mapId:map.id});dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});await snapshot();
  dm.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});
  for(let i=0;i<party.length;i++)dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:party[i].id,x:500+i*90,y:340});
  const others=new Map<string,Socket>();
  for(const name of ['Varis','Vanec']){const s=await connect('player');s.emit('character:claim',{characterId:party.find((c:any)=>c.name===name).id});others.set(name,s);}
  await snapshot();
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();await page.waitForTimeout(3500);
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();
  await page.locator('.chat-dice-options summary').click();
  await page.evaluate(()=>{
   const samples:any[]=[];(window as any).__tableSamples=samples;(window as any).__tableSampling=true;
   const sample=()=>{const canvas=document.querySelector('.dice-tray-canvas'),card=document.querySelector('.live-dice-card'),backdrop=document.querySelector('.roll-reveal-backdrop');if(canvas&&card){(window as any).__firstTableCanvas??=canvas;const camera=JSON.parse(canvas.getAttribute('data-table-camera')||'{}'),bounds=card.getBoundingClientRect(),view=canvas.getBoundingClientRect(),boxes=[...document.querySelectorAll('.tray-die-result')];samples.push({time:performance.now(),id:backdrop?.getAttribute('data-roll-id'),idle:backdrop?.getAttribute('data-table-idle')==='true',filled:document.querySelector('.physics-dice-tray')?.getAttribute('data-status')==='settled'&&boxes.length>0&&boxes.every(b=>b.getAttribute('data-filled')==='true'),bounds:{x:bounds.x,y:bounds.y,w:bounds.width,h:bounds.height,canvasY:view.y,canvasH:view.height},camera,physics:Number(canvas.getAttribute('data-physics-elapsed')||0),sameCanvas:canvas===(window as any).__firstTableCanvas});}else if((window as any).__firstTableCanvas)samples.push({missing:true});if((window as any).__tableSampling)requestAnimationFrame(sample);};sample();
  });
  if(process.env.DICE_TABLE_VIDEO)capture=await startAv1Capture(page,process.env.DICE_TABLE_VIDEO);
  const turns=[{name:'Druk',expr:'2d6+4',side:'bottom'},{name:'Druk',expr:'1d20+6',side:'bottom'},{name:'Varis',expr:'1d8+3',side:'left'},{name:'Vanec',expr:'2d8',side:'right'},{name:'DM',expr:'1d20+2',side:'top'}];
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
   await expect(page.locator('.roll-reveal-backdrop')).toHaveAttribute('data-table-idle','true',{timeout:20000});
   await page.waitForTimeout(300);
  }
  const samples=await page.evaluate(()=>{(window as any).__tableSampling=false;return (window as any).__tableSamples;});
  for(const turn of turns){
   const id=turn.name==='DM'?'dm':party.find((c:any)=>c.name===turn.name).id;
   const journey=samples.filter((s:any)=>s.camera.to===id);
   if(turn.name!=='Druk'){
    const pan=journey.filter((s:any)=>s.camera.progress>0&&s.camera.progress<1);
    expect(pan.some((s:any)=>s.camera.duration===DICE_TABLE_PAN_MS)).toBe(true);
    expect(new Set(pan.map((s:any)=>s.camera.progress)).size).toBeGreaterThanOrEqual(8);
   }else expect(journey.every((s:any)=>s.camera.duration===0)).toBe(true);
   expect(journey.some((s:any)=>s.camera.done&&s.physics>0)).toBe(true);
   expect(journey.filter((s:any)=>s.physics>0).every((s:any)=>s.camera.done)).toBe(true);
  }
  expect(samples.some((s:any)=>s.missing||!s.sameCanvas)).toBe(false);
  const painted=samples.filter((s:any)=>s.bounds&&s.camera.to);
  for(const property of ['x','y','w','h','canvasY','canvasH']){
   const values=painted.map((s:any)=>s.bounds[property]);
   expect(Math.max(...values)-Math.min(...values),`Stable window / camera ${property}`).toBeLessThan(1.1);
  }
  for(const id of new Set(painted.map((s:any)=>s.id))){
   const frames=painted.filter((s:any)=>s.id===id),filled=frames.find((s:any)=>s.filled),idle=frames.find((s:any)=>s.idle);
   expect(filled).toBeTruthy();expect(idle).toBeTruthy();
   expect(idle.time-filled.time,'No legacy result hold stacked after reading').toBeLessThan(4800);
   expect(idle.time-filled.time,'Keep enough time to read settled dice').toBeGreaterThan(2000);
  }
  await page.getByRole('button',{name:'Close dice table',exact:true}).click();
  await expect(page.locator('.roll-reveal-backdrop')).toHaveCount(0);
  await test.info().attach('table-camera-timing',{body:JSON.stringify(samples),contentType:'application/json'});
 }finally{if(capture)await capture.stop();sockets.forEach(s=>s.disconnect());}
});
