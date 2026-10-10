import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';
test.use({serviceWorkers:'block'});

test('unavailable lighter assets fall back to original figures and Auto responds to sustained real frame pressure',async({browser,request})=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Model fallback and measured Auto'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const reply=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(reply.ok).toBe(true);return reply.snapshot;};
 const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},serviceWorkers:'block'});
 try{
  const initial=await snap();socket.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries())socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:440+i*120,y:600});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',mist:false,lights:[{id:'lamp',x:400,y:450,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true}]}});await snap();
  const requested:string[]=[];
  await context.route(/\/miniatures\/.*\.glb/,route=>{
   const url=route.request().url();requested.push(url);
   return /-(light|balanced|sharpened-weapons)-/.test(url)?route.abort():route.continue();
  });
  await context.addInitScript(()=>localStorage.setItem('dnd-environment-quality','auto'));
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','3',{timeout:60000});
  await expect(layer).toHaveAttribute('data-miniature-status','ready');
  await expect(layer).toHaveAttribute('data-graphics-quality','high');
  await expect(layer).toHaveAttribute('data-model-quality','light');
  for(const id of ['druk','varis','vanec']){
   expect(requested.some(url=>url.includes(`/miniatures/${id}-`)&&/-(light|sharpened-weapons)-/.test(url))).toBe(true);
   expect(requested.some(url=>new RegExp(`/miniatures/${id}-[a-f0-9]{12}\\.glb`).test(url))).toBe(true);
  }
  await context.unrouteAll({behavior:'wait'});
  await page.evaluate(()=>{localStorage.setItem('dnd-environment-quality','auto');window.dispatchEvent(new Event('dnd-environment-quality-change'));});
  await expect(layer).toHaveAttribute('data-graphics-quality','high');
  await page.waitForTimeout(3500);
  await page.evaluate(()=>{
   (window as any).slowGraphics=true;
   const slow=()=>{if(!(window as any).slowGraphics)return;const end=performance.now()+34;while(performance.now()<end){/* controlled main-thread pressure */}requestAnimationFrame(slow);};
   requestAnimationFrame(slow);
  });
  await expect(layer).toHaveAttribute('data-graphics-quality','balanced',{timeout:20000});
  await page.evaluate(()=>(window as any).slowGraphics=false);
  await expect(layer).toHaveAttribute('data-miniature-count','3');
  await page.evaluate(()=>{localStorage.setItem('dnd-environment-quality','high');window.dispatchEvent(new Event('dnd-environment-quality-change'));});
  await expect(layer).toHaveAttribute('data-graphics-quality','high');expect(errors).toEqual([]);
 }finally{socket.disconnect();await context.close();}
});
