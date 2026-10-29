import {test,expect,type Page} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {projectGround} from '../client/src/canvas/miniatureProjection';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off'});
// Read existing hit pixels without calling draw()/drawHit(): a forced repaint
// would repair the stale hit map and hide this regression.
async function tokenHits(page:Page){return page.evaluate(()=>{
 const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
 if(!stage)return [];
 return stage.find('.token').map((n:any)=>{
  const point=n.getAbsolutePosition(),hit=stage.getIntersection(point);
  return {id:n.getAttr('tokenId'),hit:hit?.findAncestor('.token')?.getAttr('tokenId')??null,point,layer:n.getLayer().name()};
 });
});}
async function tokenPoint(page:Page,id:string,tilt:number,rotation:number){
 const p=await page.evaluate(id=>{
  const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();
  return {...p,left:r.left,top:r.top,width:stage.width(),height:stage.height(),sx:r.width/stage.width(),sy:r.height/stage.height()};
 },id);
 const projected=projectGround(p.x,p.y,p.width,p.height,tilt,rotation);
 return {x:p.left+projected.x*p.sx,y:p.top+projected.y*p.sy};
}
for(const mode of ['legacy','2d','3d'] as const)for(const assisted of [false,true])test(`${mode} token bases remain clickable after real camera drags with assistance ${assisted}`,async({page,request})=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET},errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable camera hit regression'}})).json();
 const buffer=await sharp({create:{width:1800,height:1200,channels:3,background:'#57554d'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const initial=await state();admin.emit('map:setActive',{mapId:map.id});
  admin.emit('map:setGrid',{mapId:map.id,gridSizePx:60,feetPerSquare:5,widthFt:150,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name==='Druk').id,x:650,y:550});
  admin.emit('monster:create',{name:'Camera goblin',modelType:'goblin',icon:'G',maxHp:20,disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Camera goblin');
  for(const [x,y] of [[900,550],[1100,700]])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
  const tokens=(await state()).tokens;
  await page.addInitScript(({mode,assisted})=>{
   localStorage.setItem('dnd.playerId','camera-hit-regression');
   localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');
   localStorage.setItem('dnd-server-rendering',assisted?'on':'off');
   localStorage.setItem('dnd.tokenView:camera-hit-regression','2d');
   localStorage.setItem('dnd.monsterTokenView:camera-hit-regression',mode==='3d'?'3d':'2d');
   localStorage.setItem('dnd.battlefieldView:camera-hit-regression','tilted');
  },{mode,assisted});
  await page.setViewportSize({width:1500,height:1000});
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect.poll(()=>tokenHits(page).then(h=>h.length)).toBe(3);
  if(mode==='3d')await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','2',{timeout:60000});
  await page.waitForTimeout(1000);
  const check=async()=>{const hits=await tokenHits(page);expect(hits.map(h=>({id:h.id,hit:h.hit}))).toEqual(hits.map(h=>({id:h.id,hit:h.id})));};
  await check();
  await page.evaluate(()=>{
   const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
   (window as any).__cameraDragged=[];
   stage.on('dragstart.cameraHitRegression',(e:any)=>{(window as any).__cameraDragged.push({kind:e.target.getClassName(),layer:e.target.name()});});
  });
  const pan=async(dx:number,dy:number)=>{
   const r=(await page.locator('.konvajs-content').boundingBox())!;
   // Empty upper-center map area, away from token bases and toolbar overlays.
   await page.mouse.move(r.x+r.width*.5,r.y+r.height*.2);await page.mouse.down();
   await page.mouse.move(r.x+r.width*.5+dx,r.y+r.height*.2+dy,{steps:8});await page.mouse.up();
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   await check();
  };
  await pan(145,85);await pan(-85,-55);await pan(60,-30);
  expect(await page.evaluate(()=>(window as any).__cameraDragged)).toHaveLength(3);
  const tilt=mode==='legacy'?0:45;
  let point=await tokenPoint(page,tokens[1].id,tilt,0);
  await page.mouse.click(point.x,point.y,{button:'right'});await expect(page.getByRole('dialog',{name:'Token actions',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close token actions',exact:true}).click();
  await page.getByRole('button',{name:'+',exact:true}).click();await page.waitForTimeout(100);await check();
  point=await tokenPoint(page,tokens[1].id,tilt,0);
  if(mode!=='legacy'){
   await page.getByRole('button',{name:'Rotate map right',exact:true}).click();await page.waitForTimeout(550);await check();
   await pan(-40,30);point=await tokenPoint(page,tokens[1].id,tilt,15);
   await page.mouse.click(point.x,point.y,{button:'right'});await expect(page.getByRole('dialog',{name:'Token actions',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close token actions',exact:true}).click();
  }
  await page.mouse.click(point.x,point.y);await expect(page.getByRole('complementary',{name:'Token inspector',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{admin.disconnect();}
});
