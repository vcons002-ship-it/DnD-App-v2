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
  await page.waitForTimeout(550);
  const power=JSON.parse((await canvas.getAttribute('data-roll-power'))!);
  expect(power).toHaveLength(3);expect(power.every((p:any)=>p.known)).toBe(true);
  expect(power[0].maximum).toBe(false);expect(power[2].maximum).toBe(true);
  expect(power[0].strength).toBeLessThan(.05);expect(power[2].strength).toBeGreaterThan(.95);
  if(theme!=='sorcerer')expect(power[2].particles).toBeGreaterThan(0);
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
 await page.locator('button[data-theme="ranger"]').click();await page.waitForTimeout(600);
 expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!)[2].particles).toBe(0);
});
