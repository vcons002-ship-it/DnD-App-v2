/** Opt-in, disposable DM party-view recording on real hardware WebGL. */
import {test,expect,chromium} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
import {xy} from './helpers/movementProbe';
test.use({trace:'off'});
test('record Legacy and 3D walking past creatures hidden in darkness',async({request})=>{
 test.skip(!process.env.DARKNESS_VIDEO_OUTPUT,'Set DARKNESS_VIDEO_OUTPUT to record.');test.setTimeout(240000);
 const output=path.resolve(process.env.DARKNESS_VIDEO_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable darkness movement comparison'}})).json();
 const art=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1400"><defs><pattern id="floor" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#80745c"/><path d="M50 0H0V50" fill="none" stroke="#9b8c70" stroke-width="1"/></pattern></defs><rect width="3000" height="1400" fill="url(#floor)"/><rect x="80" y="80" width="2840" height="1240" fill="none" stroke="#32302b" stroke-width="30"/><path d="M300 900H2700" fill="none" stroke="#d9c69c" stroke-width="5" stroke-dasharray="20 22"/><text x="1500" y="200" text-anchor="middle" fill="#e9dcbf" font-size="55">DARK PASSAGE</text><text x="1100" y="520" text-anchor="middle" fill="#403b31" font-size="32">GUARD A</text><text x="1850" y="520" text-anchor="middle" fill="#403b31" font-size="32">GUARD B</text>${[300,700,1100,1500,1900,2300,2700].map((x,i)=>`<circle cx="${x}" cy="900" r="9" fill="#e1cf9e"/><text x="${x}" y="1030" text-anchor="middle" fill="#494235" font-size="28">${i*40} ft</text>`).join('')}</svg>`);
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Dark passage / 240 ft walk',image:{name:'passage.png',mimeType:'image/png',buffer:await sharp(art).png().toBuffer()}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[],report:any={at:new Date().toISOString(),fixture:{visionFeet:60,walkFeet:240,heavyDarkness:true,exploration:'remembered',guards:[[1100,750],[1850,750]],route:[300,700,1100,1500,1900,2300,2700]},runs:[]};
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Druk');admin.emit('map:setActive',{mapId:map.id});
  admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:300,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('fog:setExploration',{mapId:map.id,mode:'remembered'});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:true,mist:false,lights:[]}});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:300,y:900});
  admin.emit('monster:create',{name:'Passage Guard',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Passage Guard');
  for(const x of [1100,1850])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:750});
  const all=await state(),token=all.tokens.find((t:any)=>t.kind==='pc'),enemies=all.tokens.filter((t:any)=>t.kind==='monster');
  admin.emit('token:setLantern',{tokenId:token.id,enabled:true});report.fixture.carriedLantern=true;await state();
  const playerContext=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000}});contexts.push(playerContext);
  await playerContext.addInitScript(()=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','legacy');});
  const player=await playerContext.newPage();await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
  const pages=[];
  for(const mode of ['legacy','3d']){
   const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000},deviceScaleFactor:1,recordVideo:{dir:path.join(output,'raw'),size:{width:1600,height:1000}}});contexts.push(context);
   await context.addInitScript(mode=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-legacy-movement','smooth');localStorage.setItem('dnd.playerId',`dark-${mode}`);localStorage.setItem(`dnd.battlefieldView:dark-${mode}`,mode==='legacy'?'overhead':'tilted');localStorage.setItem(`dnd.tokenView:dark-${mode}`,'3d');localStorage.setItem(`dnd.monsterTokenView:dark-${mode}`,'3d');},mode);
   const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
   await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');
   if(mode==='legacy'){await expect(page.getByRole('checkbox',{name:'Animate Legacy movement',exact:true})).toHaveCount(0);await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-render-source','server-raster');}
   else{await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready',{timeout:90000});await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees','45');await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','1');}
   await page.evaluate(({mode,ids,pc})=>{
    const w=window as any;w.__dark={samples:[],until:Infinity};
    const label=document.createElement('div');label.id='darkness-caption';label.style.cssText='position:fixed;left:16px;bottom:16px;z-index:99999;background:#111e;color:#ffe6ab;border:1px solid #bc9b56;padding:12px 18px;border-radius:6px;font:17px system-ui;pointer-events:none;white-space:pre-line';document.body.append(label);
    w.__dark.label=(text:string)=>label.textContent=`${mode==='legacy'?'LEGACY / 15 fps token animation / prepared mask steps':'3D / Low quality / tilted board'}\nDM viewing player visibility / server assist ON\n${text}`;
    w.__dark.label('Start: both guards are beyond 60 ft and hidden.');
    let previous='';const sample=()=>{const nodes=w.Konva.stages.flatMap((s:any)=>s.find('.token'));const player=nodes.find((n:any)=>n.getAttr('tokenId')===pc);const shown=ids.filter((id:string)=>nodes.some((n:any)=>n.getAttr('tokenId')===id&&n.isVisible()&&n.opacity()>.01));const key=JSON.stringify([Math.round(player?.x()??0),shown]);if(key!==previous){w.__dark.samples.push({at:performance.now(),x:player?.x(),shown,mask:document.querySelector('[data-testid=legacy-vision]')?.getAttribute('data-raster-key')});previous=key;}if(performance.now()<w.__dark.until)requestAnimationFrame(sample);};sample();
   },{mode,ids:enemies.map((t:any)=>t.id),pc:token.id});
   const gpu=mode==='3d'?await page.getByTestId('miniature-layer').evaluate(el=>{const gl=el.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}):null;
   report.runs.push({mode,gpu,errors});pages.push({mode,page,context,video:page.video()!});
  }
  const label=async(text:string)=>Promise.all(pages.map(({page})=>page.evaluate(text=>(window as any).__dark.label(text),text)));
  const x=(page:any)=>page.evaluate((id:string)=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id);
  const walk=async(dest:number)=>{const from=await xy(player,token.id),to=await xy(player,token.id,dest,900);await player.mouse.move(from.x,from.y);await player.mouse.down();await player.mouse.move(to.x,to.y,{steps:8});await player.mouse.up();await player.mouse.move(20,100);};
  report.method='Real player mouse drags in a separate Legacy browser; two DM browsers watch the same accepted movements in player visibility. One DM uses optional Legacy motion, the other Low-quality tilted 3D. Same map, guards, lantern and server. Videos are a visual demonstration, without CPU throttling.';
  await Promise.all(pages.map(async({page},i)=>report.runs[i].comparisonStartMs=await page.evaluate(()=>performance.now())));
  await pages[0].page.waitForTimeout(2500);
  for(const [i,dest] of [700,1100,1500,1900,2300,2700].entries()){
   await label(`Walking east: ${40*(i+1)} / 240 ft. Guards appear when approached, then disappear behind.`);
   await walk(dest);await Promise.all(pages.map(({page})=>expect.poll(async()=>Math.abs(await x(page)-dest),{timeout:30000}).toBeLessThan(4)));await pages[0].page.waitForTimeout(900);
   if(dest===1100||dest===1900||dest===2700)for(const {mode,page} of pages)await page.screenshot({path:path.join(output,`${mode}-${dest}.png`)});
  }
  await label('Far end: both guards are hidden again. Explored floor remains remembered.');await pages[0].page.waitForTimeout(2500);
  for(const dest of [2300,1900,1500,1100,700,300]){
   await label('Walking back: guards reappear on approach and return to darkness after passing.');
   await walk(dest);await Promise.all(pages.map(({page})=>expect.poll(async()=>Math.abs(await x(page)-dest),{timeout:30000}).toBeLessThan(4)));await pages[0].page.waitForTimeout(900);
  }
  await label('Back at start: both guards hidden; visited terrain remains remembered.');await pages[0].page.waitForTimeout(2500);
  await Promise.all(pages.map(async({page},i)=>report.runs[i].comparisonEndMs=await page.evaluate(()=>performance.now())));
  for(const [i,{mode,page,context,video}] of pages.entries()){
   report.runs[i].samples=await page.evaluate(()=>(window as any).__dark.samples);report.runs[i].miniatures=await page.getByTestId('miniature-layer').count();
   const samples=report.runs[i].samples;for(const enemy of enemies){expect(samples.some((s:any)=>s.shown.includes(enemy.id))).toBe(true);expect(samples[0].shown).not.toContain(enemy.id);expect(samples.at(-1).shown).not.toContain(enemy.id);}
   expect(report.runs[i].errors).toEqual([]);await context.close();await video.saveAs(path.join(output,`${mode}-darkness-raw.webm`));
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 }finally{admin.disconnect();await Promise.all(contexts.map(c=>c.close()));await browser.close();}
});
