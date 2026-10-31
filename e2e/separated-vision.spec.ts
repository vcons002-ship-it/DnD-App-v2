/** Full-app screenshot parity, independent of the latency measurements. */
import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
for(const navigation of [false,true])for(const mode of ['legacy','local-2d','local-3d'])test(`server mask and local color ${navigation?'after navigation':'initial view'}: ${mode}`,async({page,request})=>{
 const outputPath=process.env[navigation?'SEPARATED_NAV_OUTPUT':'SEPARATED_VISUAL_OUTPUT'];
 test.skip(!outputPath,'Opt-in visual comparison');test.setTimeout(240000);
 const output=path.resolve(outputPath!);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET},image=await fs.readFile('assets/maps/experiments/courtyard-relief-20261002/original.png');
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Separated mask visual parity'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const downloaded=new Map<string,Buffer>();page.on('response',async r=>{if(r.url().includes('/api/render/'))try{downloaded.set(r.url().split('/').at(-1)!,await r.body());}catch{}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
 try{
  const s=await state(),pc=s.characters.find((c:any)=>c.name==='Druk'),other=s.characters.find((c:any)=>c.name==='Vanec');
  admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:16,feetPerSquare:5,widthFt:380,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});admin.emit('fog:setExploration',{mapId:map.id,mode:'remembered'});
  admin.emit('map:editWalls',{mapId:map.id,add:{id:'corner',ax:600,ay:100,bx:600,by:370}});
  const lights=[{id:'lamp',x:440,y:470,radiusFt:18,heightFt:8,color:'warm',intensity:1,flicker:false,visibleTorch:false}];
  const environment=(lighting:string,heavyDarkness:boolean)=>admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting,heavyDarkness,shadows:false,mist:false,lights}});
  environment('dungeon',true);
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:200,y:440});admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:other.id,x:800,y:440});
  const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
  await page.addInitScript(mode=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-server-rendering','on');const id=`parity-${mode}`;localStorage.setItem('dnd.playerId',id);localStorage.setItem(`dnd.battlefieldView:${id}`,mode==='local-3d'?'tilted':'overhead');for(const key of ['tokenView','monsterTokenView'])localStorage.setItem(`dnd.${key}:${id}`,mode==='local-3d'?'3d':'2d');},mode);
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
  const ready=async(separated:boolean)=>{
   if(mode==='legacy')await expect(page.getByTestId('legacy-terrain')).toHaveAttribute('data-grading',separated?'local-color':'server');
   else{await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready');await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-vision-mask-source',separated?'server':'client');}
   await page.waitForTimeout(800);
  };
  await ready(false);
  // Remember a corridor, then return; include another party member's sight.
  admin.emit('token:move',{tokenId:token.id,x:900,y:440});await state();await page.waitForTimeout(1200);
  admin.emit('token:move',{tokenId:token.id,x:200,y:440});await state();await page.waitForTimeout(1200);
  const results=[];
  for(const [name,lighting,heavy] of [['heavy','dungeon',true],['regular','dungeon',false],['daylight','day',false]] as const){
   environment(lighting,heavy);await state();
   const captures:Buffer[]=[];
   for(const separated of [false,true]){
    await page.evaluate(on=>localStorage.setItem('dnd-mask-color-separation',on?'on':'off'),separated);await page.reload();await expect(page.getByTestId('player-hud')).toBeVisible();await ready(separated);
    if(mode!=='legacy'){await fs.writeFile(path.join(output,`${mode}-${name}-${separated}-debug.json`),JSON.stringify(await page.getByTestId('miniature-layer').evaluate(el=>({host:el.outerHTML,vision:document.querySelector('[data-testid=player-vision]')?.outerHTML,memory:(document.querySelector('[data-testid=darkvision-memory-terrain]') as HTMLCanvasElement)?.toDataURL()})).catch(()=>({})),null,2));for(const [key,bytes] of downloaded)await fs.writeFile(path.join(output,`${key}.png`),bytes);}
    if(navigation){
     // Real camera input forces a fresh render and tests mask registration.
     await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(740,520,{steps:5});await page.mouse.up();
     await page.mouse.down();await page.mouse.move(700,500,{steps:5});await page.mouse.up();
     for(const delta of [-120,120]){await page.mouse.wheel(0,delta);await page.waitForTimeout(150);}
     await page.waitForTimeout(500);
    }
    captures.push(await page.locator('.stage-wrap').screenshot({path:path.join(output,`${mode}-${name}-${separated?'after':'before'}.png`)}));
   }
   const a=await sharp(captures[0]).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(captures[1]).removeAlpha().raw().toBuffer();expect(b.length).toBe(a.data.length);
   const delta=Buffer.alloc(b.length);let total=0,changed=0;
   for(let i=0;i<b.length;i+=3){let peak=0;for(let c=0;c<3;c++){const d=Math.abs(a.data[i+c]-b[i+c]);delta[i+c]=d;total+=d;peak=Math.max(peak,d);}if(peak>12)changed++;}
   await sharp(delta,{raw:{width:a.info.width,height:a.info.height,channels:3}}).png().toFile(path.join(output,`${mode}-${name}-difference.png`));
   results.push({name,meanChannelDifference:total/b.length,pixelsOver12Percent:changed/(b.length/3)*100});
  }
  await fs.writeFile(path.join(output,`${mode}.json`),JSON.stringify({mode,results,errors},null,2));expect(errors).toEqual([]);
  console.log(JSON.stringify({mode,navigation,results}));
  for(const r of results){expect.soft(r.meanChannelDifference,`${mode} ${r.name} average RGB difference`).toBeLessThan(1);expect.soft(r.pixelsOver12Percent,`${mode} ${r.name} changed pixels`).toBeLessThan(1);}
 }finally{admin.disconnect();}
});
