import {test,expect,type Page} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
// Compare retained native pixels against Konva's ordinary full paint into an
// independent export canvas. This catches trails, clipped labels and occlusion.
async function pixels(page:Page){return page.evaluate(()=>{
 const stages=(window as any).Konva.stages;
 return stages.flatMap((s:any)=>s.getLayers().filter((l:any)=>l.getAttr('retainedStats')).map((l:any)=>{
  l.draw();const canvas=l.getNativeCanvasElement(),copy=l.toCanvas({x:0,y:0,width:s.width(),height:s.height(),pixelRatio:1});
  const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,b=copy.getContext('2d').getImageData(0,0,copy.width,copy.height).data;
  // Compare visible premultiplied color. Canvas readback can report different
  // unpremultiplied RGB at alpha 8/255 after repeated partial clears, despite
  // only a one-value difference when composited. Keep the same 8/255 tolerance.
  let wrong=0,max=0;const examples:any[]=[];for(let i=0;i<a.length;i+=4){let delta=Math.abs(a[i+3]-b[i+3]);for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(a[i+c]*a[i+3]-b[i+c]*b[i+3])/255);if(delta>8){wrong++;if(examples.length<8)examples.push({x:i/4%canvas.width,y:Math.floor(i/4/canvas.width),actual:[...a.slice(i,i+4)],expected:[...b.slice(i,i+4)]});}max=Math.max(max,delta);}
  return {wrong,max,examples,stats:{...l.getAttr('retainedStats')}};
 }));
});}
const stats=(page:Page)=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().filter((l:any)=>l.getAttr('retainedStats')).map((l:any)=>({...l.getAttr('retainedStats')}))));
test('retained tokens match full canvas paints after movement, overlap, appearance, deletion and camera changes',async({page,request})=>{
 test.setTimeout(180000);
 const headers={'x-dm-passphrase':DM_SECRET},errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Retained rendering pixels'}})).json();
 const buffer=await sharp({create:{width:1400,height:1000,channels:3,background:'#5b5749'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const initial=await state();admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:60,feetPerSquare:5,widthFt:1400/12,locked:true});
  for(let i=0;i<20;i++)admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters[i%initial.characters.length].id,x:300+i%5*120,y:250+Math.floor(i/5)*120});
  const spawned=await state(),token=spawned.tokens[0],other=spawned.tokens[1];
  await page.addInitScript(()=>localStorage.setItem('dnd-environment-quality','legacy'));
  await page.setViewportSize({width:1500,height:1000});await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-retained-rendering','true');
  await expect.poll(()=>stats(page).then(a=>a.length)).toBe(2);
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-body')).length)).toBe(20);await page.waitForTimeout(800);
  const check=async()=>{try{await expect.poll(()=>pixels(page).then(a=>a.reduce((sum:number,l:any)=>sum+l.wrong,0)),{timeout:10000}).toBe(0);}catch(error){await fs.mkdir('artifacts/retained-pixel-regression-20261028',{recursive:true});await fs.writeFile('artifacts/retained-pixel-regression-20261028/failure.json',JSON.stringify(await pixels(page),null,2));throw error;}};
  await check();
  const before=await stats(page);admin.emit('chat:send',{text:'Feed-only retained canvas check'});await state();await page.waitForTimeout(800);
  const after=await stats(page);expect(after.map((s:any)=>s.sceneNodes)).toEqual(before.map((s:any)=>s.sceneNodes));
  const moves=[[other.x+15,other.y+15],[650,700],[token.x,token.y]];
  for(const [x,y] of moves){admin.emit('token:move',{tokenId:token.id,x,y});const accepted=(await state()).tokens.find((t:any)=>t.id===token.id);await expect.poll(()=>page.evaluate(id=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id)).toBe(accepted.x);await check();}
  const moved=await stats(page);expect(moved.reduce((s:number,l:any)=>s+l.partialScene,0)).toBeGreaterThan(0);
  admin.emit('token:setHidden',{tokenId:token.id,hidden:true});await state();await page.waitForTimeout(650);await check();
  admin.emit('token:setHidden',{tokenId:token.id,hidden:false});admin.emit('token:delete',{tokenId:other.id});await state();await page.waitForTimeout(650);await check();
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:token.refId,x:900,y:700});await state();await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-body')).length)).toBe(20);await page.waitForTimeout(650);await check();
  // Actual input uses the retained hit map; the context menu must still work.
  const point=await page.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},token.id);
  await page.mouse.click(point.x,point.y,{button:'right'});await expect(page.locator('.floating-menu')).toBeVisible();await page.keyboard.press('Escape');await check();
  await page.mouse.click(point.x,point.y);await check();
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+70,point.y+40,{steps:6});await page.mouse.up();await page.mouse.move(1400,110);await page.waitForTimeout(1000);await check();
  // Repaint the complete viewport after pan/zoom, then resume partial updates.
  const empty=await page.locator('.konvajs-content').boundingBox();expect(empty).not.toBeNull();
  await page.mouse.move(empty!.x+8,empty!.y+8);await page.mouse.down();await page.mouse.move(empty!.x+58,empty!.y+38,{steps:5});await page.mouse.up();await check();
  await page.getByRole('button',{name:'+',exact:true}).click();await check();
  admin.emit('rendering:policy',{mapId:map.id,value:'off'});await state();await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-body')).length)).toBe(0);await check();
  admin.emit('rendering:policy',{mapId:map.id,value:'inherit'});await state();await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-body')).length)).toBe(20);await check();
  await page.setViewportSize({width:1300,height:850});await page.getByRole('button',{name:'Fit',exact:true}).click();await check();
  await page.getByRole('checkbox',{name:'Legacy mode',exact:true}).uncheck();await expect(page.locator('.stage-wrap')).toHaveAttribute('data-retained-rendering','true');
  await page.getByRole('checkbox',{name:'Legacy mode',exact:true}).check();await expect.poll(()=>stats(page).then(a=>a.length)).toBe(2);await check();expect(errors).toEqual([]);
 }finally{admin.disconnect();}
});
