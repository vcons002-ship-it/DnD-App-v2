import {test,expect,Page} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
const connections:Socket[]=[];
test.afterEach(()=>connections.splice(0).forEach(s=>s.disconnect()));
import fs from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';

test('only covered name pixels fade through a foreground miniature',async({page:dm,request},info)=>{
 test.setTimeout(120000);dm.setDefaultTimeout(12000);
 const dir=info.outputPath('name-mask');fs.mkdirSync(dir,{recursive:true});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Courtyard ambush - demonstration'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});connections.push(socket);
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});return r.snapshot;};
 const initial=await snap();
 for(const [i,name] of ['Druk','Varis','Vanec'].entries()){
  const c=initial.characters.find((c:any)=>c.name===name);
  socket.emit('character:update',{characterId:c.id,race:['Half-Orc','Half-Elf','Tiefling'][i],className:['Fighter','Ranger','Sorcerer'][i],level:5,maxHp:[48,38,32][i],curHp:[48,38,32][i],armorClass:[18,15,14][i],stats:{STR:i===0?18:10,DEX:16,CON:14,INT:12,WIS:14,CHA:i===2?18:10},proficientSkills:['Perception','Stealth'],weapons:[{name:i===0?'Greatsword':i===1?'Longbow':'Quarterstaff',kind:i===1?'ranged':'melee',damage:i===0?'2d6':i===1?'1d8':'1d6',damageType:i===1?'piercing':'slashing',attackBonus:7,range:i===1?'150/600':undefined}],spellSlots:{L1:{max:4,used:0},L2:{max:3,used:0},L3:{max:2,used:0}},sheetAbilities:i===2?[{id:'bolt',name:'Fire Bolt',type:'spell',level:0,description:'Hurl fire at an enemy.',roll:{kind:'attack',dice:'1d10',scaleDice:'1d10',baseLevel:0,damageType:'fire'}},{id:'orb',name:'Chromatic Orb',type:'spell',level:1,description:'Choose elemental damage.',roll:{kind:'attack',dice:'3d8',scaleDice:'1d8',baseLevel:1}}]:[]});
 }
 socket.emit('session:setManualDamage',{manual:true});
 const png=await dm.evaluate(()=>{const c=document.createElement('canvas');c.width=1216;c.height=832;const x=c.getContext('2d')!;x.fillStyle='#273128';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Castle courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
 socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
 socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});socket.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});await snap();
 async function record(_page:Page,_title:string,action:()=>Promise<void>){await action();}
 async function point(p:Page,x:number,y:number){return p.evaluate(({x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.getLayers().length);const layer=stage.getLayers()[0];const pos=layer.getAbsoluteTransform().point({x,y});const rect=stage.container().getBoundingClientRect(),canvas=layer.getNativeCanvasElement(),m=new DOMMatrix(getComputedStyle(canvas).transform),w=stage.width(),h=stage.height(),q=new DOMPoint(pos.x-w/2,pos.y-h/2).matrixTransform(m);return{x:rect.left+w/2+q.x/q.w,y:rect.top+h/2+q.y/q.w};},{x,y});}

 const vanec=(await snap()).characters.find((c:any)=>c.name==='Druk');
 socket.emit('character:update',{characterId:vanec.id,level:17,spellSlots:{L3:{max:2,used:0}},sheetAbilities:[{id:'fireball',name:'Fireball',type:'spell',level:3,description:'A burst of flame. Dexterity save for half damage.',roll:{kind:'save',dice:'8d6',scaleDice:'1d6',save:'DEX',saveDamage:'half',damageType:'fire',baseLevel:3}}]});
 socket.emit('map:setActive',{mapId:map.id});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:vanec.id,x:640,y:480});
 socket.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:100,armorClass:1,disposition:'enemy'});
 const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:640,y:416});await snap();
 await dm.setViewportSize({width:1440,height:900});await dm.goto(`/join?code=${code}`);await dm.getByRole('button',{name:'Join',exact:true}).click();await dm.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(dm.getByTestId('player-hud')).toBeVisible();await dm.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await dm.waitForTimeout(1500);
 // A real weapon hit waits for the player's damage button, then commits once.
 socket.emit('character:update',{characterId:vanec.id,weapons:[{name:'Greatsword',kind:'melee',damage:'2d6',damageType:'bludgeoning',attackBonus:100}]});await snap();
 const target=(await snap()).tokens.find((t:any)=>t.kind==='monster');socket.emit('condition:set',{kind:'monster',refId:target.refId,condition:{label:'Paralyzed',aura:'blue',isConcentration:false}});await snap();
 await dm.keyboard.press('Escape');
 expect(await dm.evaluate(()=>{const stages=(window as any).Konva.stages;return stages.flatMap((stage:any)=>stage.find('.miniature-hud-layer').flatMap((layer:any)=>layer.find('.token-combat-role'))).length;})).toBe(0);

 await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','2',{timeout:20000});
 const focus=await point(dm,640,450);await dm.mouse.move(focus.x,focus.y);for(let i=0;i<8;i++){await dm.mouse.wheel(0,-180);await dm.waitForTimeout(90);}await dm.waitForTimeout(1200);
 await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-name-rendering','per-pixel');
 await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-name-count','2');
 const labelClip=async()=>dm.evaluate(id=>{
  const stage=(window as any).Konva.stages.find((s:any)=>s.getLayers().length);
  const token=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),layer=token.getLayer();
  const rect=stage.container().getBoundingClientRect(),canvas=layer.getNativeCanvasElement();
  const m=new DOMMatrix(getComputedStyle(canvas).transform),w=stage.width(),h=stage.height();
  const points=token.find('.token-label, .token-tracking-tag').flatMap((n:any)=>{
   const b=n.getClientRect({skipTransform:true}),mat=n.getAbsoluteTransform();
   return [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>{
    const p=mat.point({x,y}),q=new DOMPoint(p.x-w/2,p.y-h/2).matrixTransform(m);
    return {x:rect.left+w/2+q.x/q.w,y:rect.top+h/2+q.y/q.w};
   });
  });
  const x=Math.floor(Math.min(...points.map((p:any)=>p.x)))-2,y=Math.floor(Math.min(...points.map((p:any)=>p.y)))-2;
  return {x,y,width:Math.ceil(Math.max(...points.map((p:any)=>p.x)))-x+2,height:Math.ceil(Math.max(...points.map((p:any)=>p.y)))-y+2};
 },target.id);
 await dm.mouse.move(100,70);await dm.waitForTimeout(500);
 const clip=await labelClip();
 const partial=await dm.screenshot({clip,path:dir+'/partial-name.png'});
 await record(dm,'Only covered parts fade; uncovered letters stay bright',async()=>{await dm.waitForTimeout(1200);});
 let full:Buffer;
 await record(dm,'Hover to show the complete name and reveal tag',async()=>{
  const p=await point(dm,640,416);await dm.mouse.move(p.x,p.y);await dm.waitForTimeout(800);
  full=await dm.screenshot({clip,path:dir+'/full-name.png'});await dm.waitForTimeout(700);
 });
 const evidence=await dm.evaluate(async({partial,full})=>{
  async function pixels(b64:string){const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);return {w:im.width,h:im.height,p:ctx.getImageData(0,0,im.width,im.height).data};}
  const a=await pixels(partial),b=await pixels(full);let bright=0,faded=0,unchanged=0;
  const columns=new Set<number>(),fadedColumns=new Set<number>();
  for(let i=0;i<b.p.length;i+=4){
   if(b.p[i]<225||b.p[i+1]<225||b.p[i+2]<225)continue;
   bright++;const drop=(b.p[i]+b.p[i+1]+b.p[i+2]-a.p[i]-a.p[i+1]-a.p[i+2])/3;
   if(drop>45){faded++;fadedColumns.add((i/4)%b.w);}
   if(Math.abs(drop)<12){unchanged++;columns.add((i/4)%b.w);}
  }
  return {bright,faded,unchanged,brightColumns:columns.size,fadedColumns:fadedColumns.size};
 },{partial:partial.toString('base64'),full:full!.toString('base64')});
 fs.writeFileSync(dir+'/pixel-evidence.json',JSON.stringify(evidence,null,2));
 expect(evidence.faded).toBeGreaterThan(8);expect(evidence.unchanged).toBeGreaterThan(8);
 expect(evidence.brightColumns).toBeGreaterThan(5);expect(evidence.fadedColumns).toBeGreaterThan(5);
 await dm.mouse.move(100,70);
 await record(dm,'Moving the goblin reveals each letter as it clears Druk',async()=>{
  for(let i=1;i<=28;i++){socket.emit('token:move',{tokenId:target.id,x:640+i*3.4,y:416});await snap();await dm.waitForTimeout(45);}
 });
 await dm.getByRole('button',{name:'Flat battlefield view',exact:true}).click();
 await record(dm,'Overhead view uses the same silhouette masking',async()=>{await dm.waitForTimeout(1000);});
 await dm.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await dm.waitForTimeout(700);
 await record(dm,'The mask follows the view as you rotate',async()=>{
  await dm.mouse.move(990,720);await dm.mouse.down({button:'right'});
  for(let i=1;i<=20;i++){await dm.mouse.move(990+i*6,720);await dm.waitForTimeout(35);}
  await dm.mouse.up({button:'right'});await dm.waitForTimeout(700);
  await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-name-count','2');
 });
 // The 2D toggle must restore Konva names, including when WebGL unmounts.
 await dm.getByRole('button',{name:'2D monster tokens',exact:true}).click();
 await expect.poll(()=>dm.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.getLayers().length);return stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id)?.findOne('.token-label')?.opacity();},target.id)).toBe(1);
 socket.disconnect();
});
