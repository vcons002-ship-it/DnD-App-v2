import {test,expect,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './directAv1Recorder';

test('Ice Knife shows damage before saves and never reopens completed trays',async({browser,request})=>{
 test.setTimeout(180000);const out=process.env.ICE_KNIFE_CAPTURE??test.info().outputPath('evidence');mkdirSync(out,{recursive:true});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Refined area spells'}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true}),frames:any[]=[],fx:any[]=[];
 admin.on('dice:frame',f=>{if(f.done)frames.push({id:f.id,label:f.label,sides:f.sides,values:f.values,saveDice:f.saveDice,calculation:f.calculation});});admin.on('fx:hp',e=>fx.push(e));
 const state=async():Promise<StateSnapshot>=>{const r=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const first=await state(),caster=first.characters.find(c=>c.name==='Vanec')!,names=['Ice Knife'];
 const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
 admin.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:17,maxHp:5000,curHp:5000,armorClass:14,stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:18},conditions:[],sheetAbilities:names.map((name,i)=>({...catalog.find(a=>a.name===name)!,id:'demo-'+i,source:'srd',sourceClass:'sorcerer',roll:catalog.find(a=>a.name===name)!.roll?{...catalog.find(a=>a.name===name)!.roll,dc:15}:undefined})),spellSlots:{L1:{max:8,used:0},L2:{max:8,used:0},L5:{max:8,used:0},L9:{max:8,used:0}}});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Open courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
 for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 admin.emit('session:setManualDamage',{manual:false});admin.emit('session:setHideDmRolls',{hide:false});
 admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dusk',lightLevel:.78,weather:'none',particles:'none',mist:false,mapShadows:false,shadows:false,lights:[]}});
 admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:420,y:650});
 for(const [name,modelType,x,y] of [['Bugbear','bugbear',550,610],['Goblin','goblin',620,588],['Skeleton','skeleton',850,720]] as const){
  admin.emit('monster:create',{name,modelType,maxHp:5000,curHp:5000,armorClass:12,creatureType:name==='Bugbear'?'Medium humanoid':'Medium humanoid',disposition:'enemy',stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:10}});
  const template=(await state()).monsterTemplates.find(m=>m.name===name)!;admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
 }
 const ready=await state(),actor=ready.tokens.find(t=>t.refId===caster.id)!,foes=ready.tokens.filter(t=>t.kind==='monster');
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1}),page=await context.newPage(),errors:string[]=[],chapters:any[]=[],evidence:any[]=[];
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','high');});
 let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined,start=0;
 const click=async(l:Locator)=>{const b=await l.boundingBox();expect(b).toBeTruthy();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:18});await page.waitForTimeout(450);await l.click();};
 try{
  await page.goto(`http://localhost:${PORT}/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','4',{timeout:90000});await click(page.getByRole('button',{name:'Tilted battlefield view',exact:true}));
  await click(page.getByRole('button',{name:'Fit',exact:true}));await page.waitForTimeout(1600);
  await page.evaluate(()=>{
   document.title='Ice Knife Corrected Order';const el=document.createElement('div');el.setAttribute('popover','manual');el.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;margin:0;border:0;background:transparent;pointer-events:none';
   el.innerHTML='<svg id="demo-pointer" width="30" height="36" style="position:absolute;left:-50px"><path d="M3 2L3 28L10 21L16 34L21 31L15 20L26 20Z" fill="#fff5cd" stroke="#080b11" stroke-width="2"/></svg><div id="demo-click" style="position:absolute;width:40px;height:40px;border:3px solid #ffe698;border-radius:50%;opacity:0"></div>';
   document.body.append(el);el.showPopover();document.addEventListener('mousemove',e=>{const p=document.getElementById('demo-pointer')!;p.style.left=e.clientX+'px';p.style.top=e.clientY+'px';});document.addEventListener('pointerdown',e=>{const p=document.getElementById('demo-click')!;p.style.left=e.clientX-22+'px';p.style.top=e.clientY-22+'px';p.animate([{opacity:1,transform:'scale(.6)'},{opacity:0,transform:'scale(1.4)'}],{duration:700});},true);
  });
  if(process.env.ICE_KNIFE_CAPTURE)capture=await startAv1Capture(page,out+'/combat-av1.mp4',{title:'Ice Knife Corrected Order',width:1600,height:1084});start=capture?.startedAt??Date.now();
  await page.waitForTimeout(1500);await page.screenshot({path:out+'/poster.png'});
  const combat=page.locator('.compact-player-combat');
  for(const name of names){
   chapters.push({title:name,time:(Date.now()-start)/1000});console.log('SHOWCASE',name);
   const before=await state(),hp=Object.fromEntries(before.monsters.map(m=>[m.id,m.curHp]));
   await click(combat.getByRole('button',{name:new RegExp(name)}).first());
   const targetsText='Target: Bugbear';
   await page.mouse.move(260,160,{steps:15});
   const deadline=Date.now()+120000;let committed:StateSnapshot|undefined;
   while(Date.now()<deadline){
    const current=await state();if(current.rollLog.length>before.rollLog.length&&current.monsters.some(m=>m.curHp<hp[m.id])){committed=current;break;}await page.waitForTimeout(180);
   }
   expect(committed,name+' resolves damage through the live workflow').toBeTruthy();
   await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-spell-impact-kinds',/ice-splash/,{timeout:45000});await page.waitForTimeout(400);await page.screenshot({path:out+'/ice-knife-effect.png'});await page.waitForTimeout(5500);
   await expect(page.locator('.roll-reveal-backdrop')).toHaveCount(0);
   const rolls=committed!.rollLog.slice(before.rollLog.length);
   expect(rolls.filter(r=>r.reveal&&!r.reveal.presentedLive)).toEqual([]);
   const stages=[...new Map(frames.map(f=>[f.id,f])).values()];
   expect(stages.at(-1).label).toContain('DEX Saving Throws');
   const attack=stages[0].values[0];
   expect(stages.map(s=>s.sides)).toEqual(attack===1?[[20],[6,6],[20,20]]:attack===20?[[20],[10,10],[6,6],[20,20]]:[[20],[10],[6,6],[20,20]]);
   if(attack!==1)expect(stages[1].calculation.title).toBe('Ice Knife — Damage Roll');
   evidence.push({name,targetsText,before:hp,after:Object.fromEntries(committed!.monsters.map(m=>[m.id,m.curHp])),rolls:committed!.rollLog.slice(before.rollLog.length)});

  }
  expect(errors).toEqual([]);
 }finally{
  if(capture)writeFileSync(out+'/capture.json',JSON.stringify(await capture.stop(),null,2));writeFileSync(out+'/chapters.json',JSON.stringify(chapters,null,2));writeFileSync(out+'/evidence.json',JSON.stringify({sourceCommit:'Full area spell feature branch',errors,evidence,frames,fx},null,2));await context.close();admin.disconnect();
 }
});



