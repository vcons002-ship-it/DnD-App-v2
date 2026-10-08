import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';

test('character power art scales d20 and damage faces, including maxima and gold critical dice',async({page},info)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1150,height:1000});await page.goto('/dice-power.html');
 const canvas=page.locator('#tray canvas');
 await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 for(const theme of ['fighter','sorcerer','ranger'])for(const sides of [20,6]){
  await page.locator(`button[data-theme="${theme}"]`).click();await page.getByLabel('Die type').selectOption(String(sides));
  await expect(page.locator('#tray')).toHaveAttribute('data-sides',String(sides));
  await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
  await page.waitForTimeout(1500);
  const power=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
  expect(power).toHaveLength(3);expect(power.every((p:any)=>p.known)).toBe(true);
  expect(power[0].maximum).toBe(false);expect(power[2].maximum).toBe(true);
  expect(power[0].strength).toBeLessThan(.05);expect(power[2].strength).toBeGreaterThan(.95);
  if(theme==='ranger'){
   expect(power[0].particles).toBe(0);expect(power[1].particles).toBe(0);
   expect(power[2].particles).toBe(8);
  }
  if(theme==='fighter'){
   expect(power[0].broken).toBe(false);expect(power[2].broken).toBe(true);
   expect(power[2].fragments).toBe(11);expect(power[2].lava).toBe(0);expect(power[2].pools).toBe(1);expect(power[2].particles).toBe(0);
   expect(power[2].preservedSurfaces).toBeGreaterThan(10);
   expect(power[2].physics.collisions).toBeGreaterThan(0);
  }
  if(theme==='ranger'){
   await page.waitForTimeout(250);
   const centered=JSON.parse((await canvas.getAttribute('data-roll-power'))!)[2].mote;
   expect(centered.every((v:number)=>Math.abs(v)<.001)).toBe(true);
   await page.waitForTimeout(200);
   expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!)[2].mote).toEqual(centered);
  }
  await page.screenshot({path:info.outputPath(`${theme}-d${sides}-strength.png`)});
 }
 await page.getByLabel('Gold critical dice').check();await page.getByRole('button',{name:'Replay maximum',exact:true}).click();
 await page.waitForTimeout(500);expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!)[2].maximum).toBe(true);
 await page.screenshot({path:info.outputPath('ranger-critical-max.png')});
 await page.getByLabel('Die type').selectOption('100');await expect(page.locator('#tray')).toHaveAttribute('data-sides','100');
 await page.waitForTimeout(600);const pair=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
 expect(pair).toHaveLength(6);expect(pair.map((p:any)=>p.maximum)).toEqual([false,false,false,false,true,true]);
 expect(errors).toEqual([]);
});

test('Druk shatters every die shape, stays broken during the result hold and resets on replay',async({page})=>{
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.goto('/dice-power.html');const canvas=page.locator('#tray canvas');
 for(const sides of [4,8,10,12,100]){
  await page.getByLabel('Die type').selectOption(String(sides));await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
  await page.waitForTimeout(1500);
  const power=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
  expect(power.filter((p:any)=>p.maximum).every((p:any)=>p.broken&&p.fragments>0)).toBe(true);
  expect(power.filter((p:any)=>!p.maximum).every((p:any)=>!p.broken)).toBe(true);
 }
 await page.getByLabel('Gold critical dice').check();await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 await page.waitForTimeout(3500);
 const held=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
 expect(held.filter((p:any)=>p.maximum).every((p:any)=>p.broken&&p.fragments===0)).toBe(true);
 expect(held.filter((p:any)=>p.maximum).every((p:any)=>p.pools===1&&p.lava===0&&p.physics.bodies===0)).toBe(true);
 await page.getByRole('button',{name:'Replay maximum',exact:true}).click();await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 await page.waitForTimeout(1500);
 expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!).filter((p:any)=>p.maximum).every((p:any)=>p.broken&&p.fragments>0)).toBe(true);
 expect(errors).toEqual([]);
});

test('Druk warns before exploding then freezes solid shards and keeps the lava pool after they fade',async({page},info)=>{
 await page.goto('/dice-power.html');
 await page.getByLabel('Explosion close-up').check();
 await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')!.getAttribute('data-roll-power')!)[0].age>=.30);
 const warning=JSON.parse((await page.locator('canvas').getAttribute('data-roll-power'))!)[0];
 expect(warning.age).toBeLessThan(.85);expect(warning.broken).toBe(false);expect(warning.pools).toBe(0);expect(warning.shudder).toBeGreaterThan(0);expect(warning.lavaDrop).toBe(false);
 await page.waitForFunction(()=>{const p=JSON.parse(document.querySelector('canvas')!.getAttribute('data-roll-power')!)[0];return p.broken&&p.lavaDrop;});
 const release=JSON.parse((await page.locator('canvas').getAttribute('data-roll-power'))!)[0];
 expect(release.shudder).toBe(0);expect(release.pools).toBe(0);
 await page.waitForTimeout(1900);
 const shards=JSON.parse((await page.locator('canvas').getAttribute('data-roll-power'))!)[0];
 expect(shards.fragments).toBe(11);expect(shards.frozenFragments).toBe(11);expect(shards.melting).toBe(0);expect(shards.pools).toBe(1);expect(shards.lava).toBe(0);expect(shards.physics.bodies).toBe(0);
 await page.screenshot({path:info.outputPath('druk-settled-solid-shards.png')});
 await page.waitForTimeout(1000);
 const held=JSON.parse((await page.locator('canvas').getAttribute('data-roll-power'))!)[0];
 expect(held.fragments).toBe(0);expect(held.pools).toBe(1);
 await page.getByRole('button',{name:'Replay maximum',exact:true}).click();
 await page.waitForFunction(()=>{const p=JSON.parse(document.querySelector('canvas')!.getAttribute('data-roll-power')!)[0];return p.age>=.15&&p.age<.75;});
 const replay=JSON.parse((await page.locator('canvas').getAttribute('data-roll-power'))!)[0];
 expect(replay.broken).toBe(false);expect(replay.pools).toBe(0);
});

test('Druk ordinary high rolls keep visibly hotter cracks than low rolls',async({page})=>{
 await page.goto('/dice-power.html');await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 await page.waitForTimeout(1000);
 const glow=await page.evaluate(()=>{
  const canvas=document.querySelector<HTMLCanvasElement>('#tray canvas')!,ctx=canvas.getContext('2d')!;
  const heat=(x:number)=>{const {data}=ctx.getImageData(canvas.width*x,canvas.height*.35,canvas.width*.18,canvas.height*.3);let count=0;
   for(let i=0;i<data.length;i+=4)if(data[i]>110&&data[i]>data[i+1]*1.9&&data[i+1]>data[i+2]*1.5)count++;
   return count;};
  return {low:heat(.18),high:heat(.41)};
 });
 expect(glow.high).toBeGreaterThan(glow.low*1.5+10);
});

test('DM maximum changes the internal ink to red while ordinary rolls stay purple',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1150,height:1000});await page.goto('/dice-power.html');
 await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 await page.locator('button[data-theme="dm"]').click();await expect(page.locator('#tray')).toHaveAttribute('data-theme','dm');
 await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');await page.waitForTimeout(750);
 const ink=await page.evaluate(()=>{
  const canvas=document.querySelector<HTMLCanvasElement>('#tray canvas')!,ctx=canvas.getContext('2d')!;
  const red=(x:number)=>{const {data}=ctx.getImageData(canvas.width*x,canvas.height*.35,canvas.width*.18,canvas.height*.3);let count=0;
   for(let i=0;i<data.length;i+=4)if(data[i]>55&&data[i]>data[i+1]*1.8&&data[i]>data[i+2]*1.3)count++;
   return count;};
  return {low:red(.18),maximum:red(.60)};
 });
 expect(ink.maximum).toBeGreaterThan(ink.low+100);
 await page.screenshot({path:info.outputPath('dm-purple-and-blood-red-ink.png')});expect(errors).toEqual([]);
});

test('Druk warning visibly grows from cracks to a mostly incandescent shell before the shard burst',async({page},info)=>{
 await page.goto('/dice-power.html');await expect(page.locator('#tray')).toHaveAttribute('data-state','ready');
 const samples=await page.evaluate(()=>new Promise<{early:number;late:number;highDark:number;highHot:number}>((resolve,reject)=>{
  const canvas=document.querySelector<HTMLCanvasElement>('#tray canvas')!,ctx=canvas.getContext('2d')!;
  let early:number|undefined;const started=performance.now();
  const orange=()=>{const {data}=ctx.getImageData(canvas.width*.6,canvas.height*.35,canvas.width*.2,canvas.height*.3);let count=0;
   for(let i=0;i<data.length;i+=4)if(data[i]>125&&data[i]>data[i+1]*1.15&&data[i+1]>data[i+2]*1.5)count++;
   return count;};
  const frame=()=>{
   const p=JSON.parse(canvas.dataset.rollPower??'[]')[2];
   if(p?.age<.15&&early===undefined)early=orange();
   if(p?.age>=.72&&p.age<.85&&early!==undefined){
    // The ordinary high die in the center must stay predominantly obsidian,
    // even when the maximum beside it reaches its incandescent warning.
    const {data}=ctx.getImageData(canvas.width*.46,canvas.height*.43,canvas.width*.08,canvas.height*.12);
    let highDark=0,highHot=0;
    for(let i=0;i<data.length;i+=4){
     if(data[i]<75&&data[i+1]<75&&data[i+2]<75)highDark++;
     if(data[i]>125&&data[i]>data[i+1]*1.15&&data[i+1]>data[i+2]*1.5)highHot++;
    }
    resolve({early,late:orange(),highDark,highHot});return;
   }
   if(performance.now()-started>10000){reject(new Error('Missed warning sample'));return;}
   requestAnimationFrame(frame);
  };
  document.querySelector<HTMLButtonElement>('#replay')!.click();requestAnimationFrame(frame);
 }));
 expect(samples.late).toBeGreaterThan(samples.early*1.1+20);
 expect(samples.highDark).toBeGreaterThan(samples.highHot*2);
 await page.screenshot({path:info.outputPath('druk-warning-growth.png')});
});

for(const [name,className,theme] of [['Druk','Fighter','fighter'],['Varis','Ranger','ranger'],['Vanec','Sorcerer','sorcerer']])
test(`${name} powers live gameplay dice only after server face confirmation`,async({page,request})=>{
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:`${name} power test`}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 try{
  const initial=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  const pc=initial.snapshot.characters.find((c:any)=>c.name===name);socket.emit('character:update',{characterId:pc.id,className});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Power test',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:name}).click();
  await page.getByRole('button',{name:'Roll a d20',exact:true}).click();
  const tray=page.locator('.physics-dice-tray');await expect(tray).toHaveAttribute('data-theme',theme);
  const canvas=tray.locator('.dice-tray-canvas');await expect(canvas).toHaveAttribute('data-roll-power',/"known":false/);
  await expect(tray).toHaveAttribute('data-status','settled',{timeout:30000});
  await page.waitForTimeout(650);
  const value=Number(await tray.locator('.tray-die-result').getAttribute('data-value'));
  const power=JSON.parse((await canvas.getAttribute('data-roll-power'))!)[0];
  expect(power.known).toBe(true);expect(power.strength).toBeCloseTo((value-1)/19,1);expect(power.maximum).toBe(value===20);
  expect(errors).toEqual([]);
 }finally{socket.disconnect();}
});

test('reduced-motion art keeps readable strength without erupting particles or rays',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/dice-power.html');await page.waitForTimeout(600);
 const canvas=page.locator('#tray canvas');
 const power=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
 expect(power[2].maximum).toBe(true);expect(power[2].particles).toBe(0);
 expect(power[2].broken).toBe(false);expect(power[2].fragments).toBe(0);
 await page.locator('button[data-theme="ranger"]').click();await page.waitForTimeout(600);
 expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!)[2].particles).toBe(0);
});
