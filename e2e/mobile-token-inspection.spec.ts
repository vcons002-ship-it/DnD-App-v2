import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test.use({hasTouch:true,isMobile:true,viewport:{width:430,height:900},trace:'off'});
test('mobile selection and dragging stay on the map; completed double taps or Inspect open details',async({page,request,context})=>{
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable mobile inspector'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const pc=(await state()).characters.find((c:any)=>c.name==='Druk');
  const buffer=await sharp({create:{width:1000,height:800,channels:3,background:'#565447'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
  dm.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:400,y:400});
  dm.emit('monster:create',{name:'Fallen sentry',maxHp:10,curHp:0,disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Fallen sentry');
  dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:650,y:400});
  const ready=await state(),actor=ready.tokens.find((t:any)=>t.refId===pc.id),dead=ready.tokens.find((t:any)=>t.kind==='monster');
  // Ensure this exercises the separate dead-token selection shortcut as well.
  dm.emit('monster:update',{monsterId:dead.refId,curHp:0});await state();
  await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-dice-rendering','2d');});
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect(page.locator('.konvajs-content').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva?.stages.find((s:any)=>s.find('.token').length)?.find('.token').length??0)).toBe(2);
  const inspector=page.getByRole('complementary',{name:'Token inspector',exact:true}),rail=page.locator('#dm-tool-inspect');
  const point=async(id:string)=>page.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();return {x:r.left+p.x*r.width/stage.width(),y:r.top+p.y*r.height/stage.height()};},id);
  const touch=await context.newCDPSession(page);
  const start=async(p:{x:number;y:number})=>touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
  const end=async()=>touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(rail).toBeDisabled();let p=await point(actor.id);
  await page.touchscreen.tap(p.x,p.y);await expect(rail).toBeEnabled();await expect(inspector).toBeHidden();
  // A second touch immediately after a tap may become a drag, not a double tap.
  await start(p);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+45,y:p.y+25,id:1}]});await end();
  await expect.poll(async()=>(await state()).tokens.find((t:any)=>t.id===actor.id).x).not.toBe(actor.x);
  await expect(inspector).toBeHidden();
  await expect.poll(async()=>(await page.evaluate(()=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);return s.find('.token').some((n:any)=>n.isDragging());}))).toBe(false);
  await page.waitForTimeout(700);p=await point(actor.id);
  await page.touchscreen.tap(p.x,p.y);await start(p);await expect(inspector).toBeHidden();await end();
  await expect(inspector).toBeVisible();
  await page.getByRole('button',{name:'Close token inspector',exact:true}).click();
  p=await point(dead.id);await page.touchscreen.tap(p.x,p.y);await expect(inspector).toBeHidden();
  // An older explicit-open signal must not replay when selection changes.
  await expect(rail).toHaveAttribute('aria-expanded','false');await rail.click();await expect(inspector).toBeVisible();
  await page.getByRole('button',{name:'Close token inspector',exact:true}).click();
  await page.waitForTimeout(400);p=await point(actor.id);await start(p);await page.waitForTimeout(550);await end();
  await expect(page.getByRole('dialog',{name:'Token actions',exact:true})).toBeVisible();await expect(inspector).toBeHidden();
  expect(errors).toEqual([]);
 }finally{dm.disconnect();}
});
