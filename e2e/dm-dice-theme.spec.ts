import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';
import {writeFileSync} from 'node:fs';

test('monster rolls and general DM rolls keep one purple theme live and after settlement',async({page,request},info)=>{
 test.setTimeout(180000);
 const graphicsErrors:string[]=[];page.on('pageerror',e=>graphicsErrors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))graphicsErrors.push(m.text());});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Uniform DM dice'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined;
 const timings:{roll:string;readyWaitMs:number}[]=[],frames:{id:string;elapsed:number;at:number}[]=[];
 socket.on('dice:frame',f=>frames.push({id:f.id,elapsed:f.elapsed,at:Date.now()}));
 try{
  await snap();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d')!;x.fillStyle='#302b28';x.fillRect(0,0,1000,800);return c.toDataURL('image/png').split(',')[1];});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  const refs:Record<string,string>={};
  for(const [i,disposition] of ['enemy','neutral','friendly'].entries()){
   socket.emit('monster:create',{name:disposition+' guard',modelType:'human-guard',maxHp:30,disposition,stats:{STR:16}});
   const template=(await snap()).monsterTemplates.find((m:any)=>m.name===disposition+' guard');
   socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:200+i*200,y:350});
   refs[disposition]=(await snap()).monsters.find((m:any)=>m.name.startsWith(disposition+' guard')).id;
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/dm?code=${code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect(page.getByRole('group',{name:'Map view controls',exact:true})).toBeVisible();
  if(process.env.DND_DM_GOLD_VIDEO==='1')capture=await startAv1Capture(page,info.outputPath('dm-purple-gold-av1.mp4'));
  for(const disposition of ['enemy','neutral','friendly','general']){
   frames.length=0;
   if(disposition==='general'){
    await page.getByRole('button',{name:'Chat & dice',exact:true}).click();
    await page.getByText('Dice & display options',{exact:true}).click();
    await page.getByPlaceholder('2d6+3',{exact:true}).fill('2d6+3');
    await page.getByPlaceholder('Label (optional)',{exact:true}).fill('General DM roll');
    await page.getByRole('button',{name:'Roll',exact:true}).click();
   }else{
    const token=(await snap()).tokens.find((t:any)=>t.refId===refs[disposition]);
    const point=await page.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').length),n=s.find('.token-hit-region').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsoluteTransform().point({x:0,y:0}),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},token.id);
    await page.mouse.click(point.x,point.y);
    await page.locator('.sb-ability-roll').filter({hasText:'STR'}).first().click();
    await page.getByTitle('Plain STR ability check (no proficiency)',{exact:true}).click();
   }
   const live=page.locator('[data-live-dice="true"]');await expect(live).toBeVisible({timeout:30000});
   await page.evaluate(()=>{(window as any).__dmTrayCanvas=document.querySelector('.dice-tray-canvas');});
   await expect(live.locator('.physics-dice-tray')).toHaveAttribute('data-theme','dm-neutral-roll');
   await expect(live.locator('.physics-dice-tray')).toHaveAttribute('data-material','purple-resin',{timeout:5000});
   await page.waitForTimeout(1500);await page.screenshot({path:info.outputPath(disposition+'-live-purple-gold.png')});
   await expect(live).toHaveCount(0,{timeout:45000});
   const result=page.locator('.roll-reveal');await expect(result).toBeVisible();
   await expect(result).toHaveAttribute('data-dice-theme','dm-neutral-roll');
   await expect(result.locator('canvas.three-die')).toHaveCount(0);
   await expect(result.locator('.physics-dice-tray')).toHaveAttribute('data-theme','dm-neutral-roll');
   await expect(result.locator('.physics-dice-tray')).toHaveAttribute('data-material','purple-resin');
   await expect(result.locator('.tray-die-result')).toHaveCount(disposition==='general'?2:1);
   expect(await page.evaluate(()=>document.querySelector('.dice-tray-canvas')===(window as any).__dmTrayCanvas)).toBe(true);
   await expect(result.locator('.die')).toHaveCount(0);
   await expect(result.locator('.rr-adjustment')).toBeVisible();
   await page.screenshot({path:info.outputPath(disposition+'-modifier-resin.png')});
   await expect(result).toHaveAttribute('data-impact-ready','true',{timeout:30000});
   const first=frames.find(f=>f.elapsed===0),launch=frames.find(f=>f.elapsed>0);
   expect(first).toBeTruthy();expect(launch).toBeTruthy();timings.push({roll:disposition,readyWaitMs:launch!.at-first!.at});
   expect(timings.at(-1)!.readyWaitMs).toBeLessThan(2000);
   await page.screenshot({path:info.outputPath(disposition+'-purple-dice.png')});await page.keyboard.press('Escape');
   await expect(result).toHaveCount(0);
  }
 expect(graphicsErrors).toEqual([]);
 }finally{writeFileSync(info.outputPath('startup-timings.json'),JSON.stringify(timings,null,2));if(capture)writeFileSync(info.outputPath('capture.json'),JSON.stringify(await capture.stop(),null,2));socket.disconnect();}
});
