import {openToolbarGroup} from './helpers/mobileToolbar';
import {test,expect,type Page} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {projectGround} from '../client/src/canvas/miniatureProjection';

const pixel=(page:Page,x:number,y:number)=>page.evaluate(({x,y})=>{
 const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers()[0];
 const canvas=layer.getCanvas(),pad=layer.getAttr('retainedCanvasOrigin')??{x:0,y:0},p=layer.getAbsoluteTransform().point({x,y});
 return [...canvas._canvas.getContext('2d').getImageData(Math.round((p.x+pad.x)*canvas.pixelRatio),Math.round((p.y+pad.y)*canvas.pixelRatio),1,1).data];
},{x,y});
const fog=(page:Page)=>page.evaluate(()=>{
 const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.manual-map-fog'))[0];return n?{...n.getAttr('fogStats')}:null;
});

for(const mode of ['legacy','standard'])test(`${mode} large manual fog retains images, paints immediately for the DM and preserves player concealment`,async({page:dm,browser,request},info)=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET},errors:string[]=[];
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Cached manual fog regression'}})).json();
 const png=await sharp({create:{width:2000,height:1400,channels:3,background:'#dda47b'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Large room',image:{name:'large.png',mimeType:'image/png',buffer:png}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const peer=await browser.newContext({viewport:{width:1500,height:1000}}),player=await peer.newPage();
 for(const p of [dm,player])p.on('pageerror',e=>errors.push(e.message));
 try{
  const initial=await snapshot(),pc=initial.characters.find((c:any)=>c.name==='Vanec');
  admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:10,feetPerSquare:5,widthFt:1000,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setVision',{mapId:map.id,layer,enabled:false});
  admin.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:true});admin.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:450,y:350});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:false,lighting:'day',mist:false,heavyDarkness:false}});await snapshot();
  for(const p of [dm,player])await p.addInitScript(mode=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd.playerId','fog-case');localStorage.setItem('dnd.tokenView:fog-case','2d');localStorage.setItem('dnd.battlefieldView:fog-case','tilted');},mode);
  await dm.setViewportSize({width:1500,height:1000});await dm.goto(`/dm?code=${code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Vanec'}).click();await expect(player.getByTestId('player-hud')).toBeVisible();
  await expect.poll(()=>fog(dm)).not.toBeNull();await expect.poll(()=>fog(player)).not.toBeNull();
  await expect.poll(()=>pixel(player,1055,705).then(p=>p.slice(0,3))).toEqual([14,15,18]);
  for(const x of [639.5,640.5,1280.5])expect((await pixel(player,x,705)).slice(0,3)).toEqual([14,15,18]);
  const before=await fog(dm);expect(before!.tileBuilds).toBeLessThan(20);
  // Repainting the same viewport does not rebuild masks or inspect every cell.
  await dm.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);for(let i=0;i<20;i++)stage.getLayers()[0].draw();});
  expect((await fog(dm))!.tileBuilds).toBe(before!.tileBuilds);
  const raw=await dm.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers()[0],p=layer.getAbsoluteTransform().point({x:1055,y:705}),r=stage.getContent().getBoundingClientRect();return{...p,left:r.left,top:r.top,width:stage.width(),height:stage.height()};});
  const projected=projectGround(raw.x,raw.y,raw.width,raw.height,mode==='legacy'?0:45,0),point={x:raw.left+projected.x,y:raw.top+projected.y};
  await openToolbarGroup(dm,'Map tools');await dm.getByTitle('Fog of war',{exact:true}).click();await dm.getByRole('button',{name:'Reveal',exact:true}).click();await dm.keyboard.press('Escape');
  // Hold the brush: preview paints before the first 250 ms persistence batch.
  await dm.mouse.move(point.x,point.y);await dm.mouse.down();
  await expect.poll(()=>fog(dm).then(s=>s!.coveredCells),{intervals:[10]}).toBeLessThan(28000);
  await dm.mouse.up();
  await expect.poll(async()=>(await snapshot()).map.mapFogRevealed.includes('105,70')).toBe(true);
  await expect.poll(()=>pixel(player,1055,705).then(p=>p[0])).toBeGreaterThan(100);
  // Re-cover exactly that cell; the player must not keep stale revealed pixels.
  admin.emit('fog:paint',{mapId:map.id,layer:'map',cells:['105,70'],reveal:false});await snapshot();
  await expect.poll(()=>pixel(player,1055,705).then(p=>p.slice(0,3))).toEqual([14,15,18]);
  const all=Array.from({length:28000},(_,i)=>`${i%200},${Math.floor(i/200)}`);
  admin.emit('fog:paint',{mapId:map.id,layer:'map',cells:all,reveal:true});await snapshot();
  await expect.poll(()=>fog(player).then(s=>s!.coveredCells)).toBe(0);
  const revealed=await fog(player);
  await player.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);for(let i=0;i<20;i++)stage.getLayers()[0].draw();});
  expect((await fog(player))!.tilesDrawn).toBe(revealed!.tilesDrawn);
  // Automatic fog may stay enabled on an unobstructed daylight board without
  // mounting a visibility layer. Darkness must bring it back immediately.
  for(const layer of ['map','tokens'])admin.emit('fog:setVision',{mapId:map.id,layer,enabled:true});await snapshot();
  await expect(player.getByTestId('player-vision')).toHaveCount(0);await expect(player.getByTestId('legacy-vision')).toHaveCount(0);
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false}});await snapshot();
  await expect(player.getByTestId(mode==='legacy'?'legacy-vision':'player-vision')).toBeVisible();
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',heavyDarkness:false,mist:false}});await snapshot();
  await expect(player.getByTestId('player-vision')).toHaveCount(0);await expect(player.getByTestId('legacy-vision')).toHaveCount(0);
  await dm.screenshot({path:info.outputPath('dm-revealed.png')});await player.screenshot({path:info.outputPath('player-revealed.png')});expect(errors).toEqual([]);
 }finally{admin.disconnect();await peer.close();}
});
