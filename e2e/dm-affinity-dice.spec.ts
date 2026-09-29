import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {DM_SECRET,PORT} from './playwright.config';
test('DM affinity dice showcase',async({browser,request},info)=>{
 test.setTimeout(180000);
 const require=createRequire(process.cwd()+'/package.json');const encoder=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');const ff=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];encoder.executablePath=()=>ff;encoder.executablePathOrDie=()=>ff;
 const ctx=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:1000},recordVideo:{dir:info.outputPath('video'),size:{width:1440,height:1000}}});
 const page=await ctx.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'DM dice - creature affinities'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});return r.snapshot;};await snap();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 const ids:any={};for(const [i,disposition] of ['enemy','neutral','friendly'].entries()){
 socket.emit('monster:create',{name:disposition+' guard',modelType:'human-guard',maxHp:30,disposition,stats:{STR:16,DEX:12,CON:14,INT:10,WIS:12,CHA:10}});const t=(await snap()).monsterTemplates.find((m:any)=>m.name===disposition+' guard');socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:t.id,x:400+i*150,y:500});ids[disposition]=(await snap()).monsters.find((m:any)=>m.name.startsWith(disposition+' guard')).id;
 }
 await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await page.waitForTimeout(1800);
 const frames:any[]=[];socket.on('dice:frame',f=>frames.push(f));const chapters:any[]=[];
 try{for(const disposition of ['enemy','neutral','friendly']){
 await page.evaluate(text=>{let e=document.getElementById('demo-caption');if(!e){e=document.createElement('div');e.id='demo-caption';e.style.cssText='position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:99999;background:#111a24ef;border:1px solid #a48b5a;border-radius:8px;color:#f4e6c6;padding:10px 22px;font:22px Georgia;white-space:nowrap';document.body.append(e);}e.textContent=text;},'DM tray - '+disposition+' creature - Strength check');
 await page.waitForTimeout(700);await page.screenshot({path:info.outputPath(disposition+'-caption.png')});
 socket.emit('check:roll',{kind:'monster',refId:ids[disposition],ability:'STR'});
 const live=page.locator('[data-live-dice="true"]');await expect(live).toBeVisible();await expect(live.locator('.physics-dice-tray')).toHaveAttribute('data-theme','dm-'+disposition);
 await page.waitForTimeout(2200);await page.screenshot({path:info.outputPath(disposition+'-dice.png')});
 await expect(live).toHaveCount(0,{timeout:30000});expect(frames.at(-1).dmDice).toBe(true);expect(frames.at(-1).affinity).toBe(disposition);writeFileSync(info.outputPath(disposition+'-roll.json'),JSON.stringify((await snap()).rollLog));await page.waitForTimeout(800);await page.screenshot({path:info.outputPath(disposition+'-result.png')});await expect(page.locator('.rr-adjustment').first()).toBeVisible();await page.waitForTimeout(2200);await page.keyboard.press('Escape');chapters.push(disposition);
 }}finally{socket.disconnect();await ctx.close();writeFileSync(info.outputPath('chapters.json'),JSON.stringify({chapters,video:await page.video()!.path(),errors}));}expect(errors).toEqual([]);
});
