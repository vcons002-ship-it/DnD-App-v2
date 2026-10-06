import {test,expect,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';

test.skip(process.env.DND_PARTY_SPELL_VIDEO!=='1','Opt-in spell-effects recording in a disposable campaign');
test('five repaired spells on 3D miniatures in regular darkness',async({browser,request},info)=>{
 test.setTimeout(480000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Party spells — regular darkness preview'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const state=async():Promise<StateSnapshot>=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await state(),caster=initial.characters.find(c=>c.name==='Vanec')!;
 const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
 const names=['Shield','Misty Step','Hypnotic Pattern','Pass without Trace','Command'];
 const abilities=names.map(name=>({...catalog.find(a=>a.name===name)!,id:name,source:'srd' as const,sourceClass:'sorcerer'}));
 for(const c of initial.characters)socket.emit('character:update',{characterId:c.id,maxHp:100,curHp:100,armorClass:16,conditions:[],...(c.id===caster.id?{className:'Sorcerer',level:6,stats:{CHA:30,DEX:10,WIS:10,INT:10,STR:10,CON:10},sheetAbilities:abilities,spellSlots:{L1:{max:10,used:0},L2:{max:10,used:0},L3:{max:10,used:0}}}:{})});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard after dark',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:80,locked:false});
 for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:false,lightLevel:.7,sceneTintStrength:0,weather:'none',mist:false,shadows:true,lights:[]}});
 const positions:Record<string,[number,number]>={Vanec:[570,560],Druk:[475,620],Varis:[655,640]};
 for(const c of initial.characters){const p=positions[c.name];if(p)socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:p[0],y:p[1]});}
 socket.emit('monster:create',{name:'Goblin guard',modelType:'goblin',maxHp:200,armorClass:12,disposition:'enemy',creatureType:'humanoid',stats:{WIS:1,DEX:10,STR:10,CON:10},weapons:[{name:'Training blade',kind:'melee',damage:'1d6',attackBonus:12,damageType:'slashing'}]});
 const template=(await state()).monsterTemplates.find(m=>m.name==='Goblin guard')!;
 socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:700,y:510});socket.emit('session:setManualDamage',{manual:false});
 const ready=await state(),actor=ready.tokens.find(t=>t.refId===caster.id)!,enemy=ready.tokens.find(t=>t.kind==='monster')!;
 // Combat timing keeps Shield active until the next caster turn, rather than
 // its six-second out-of-combat expiry. The fixture's attacks are real rolls.
 socket.emit('initiative:set',{tokenId:enemy.id,initiative:20});socket.emit('initiative:set',{tokenId:actor.id,initiative:10});socket.emit('initiative:setRound',{round:1});socket.emit('initiative:next');await state();
 const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000}}),page=await context.newPage();
 page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const layer=page.getByTestId('miniature-layer'),combat=page.locator('.compact-player-combat');
 const click=async(l:Locator)=>{await l.scrollIntoViewIfNeeded();const b=await l.boundingBox();expect(b).toBeTruthy();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:16});await page.waitForTimeout(350);await l.click();};
 const point=async(id:string,x:number,y:number)=>page.evaluate(({id,x,y})=>{
   const s=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').some((n:any)=>n.getAttr('tokenId')===id));
   const n=s.find('.token-hit-region').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsoluteTransform().point({x,y}),r=s.container().getBoundingClientRect();
   const v=new DOMPoint(p.x-s.width()/2,p.y-s.height()/2).matrixTransform(new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform));
   return {x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};
 },{id,x,y});
 const settle=async(hold=700)=>{
   const deadline=Date.now()+90000;let quiet=0;
   while(Date.now()<deadline){
     if(await page.locator('[data-live-dice="true"]').count()){quiet=0;await page.waitForTimeout(250);continue;}
     const reveal=page.locator('.roll-reveal');
     if(await reveal.isVisible()){await expect(reveal).toHaveAttribute('data-impact-ready','true',{timeout:45000});await page.waitForTimeout(hold);await page.keyboard.press('Escape');quiet=0;}
     else if(++quiet>=6)break;
     await page.waitForTimeout(250);
   }
   expect(Date.now()).toBeLessThan(deadline);
 };
 let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined,started=0;
 const chapters:{title:string;note:string;time:number}[]=[];
 const chapter=async(title:string,note:string)=>{
   chapters.push({title,note,time:(Date.now()-started)/1000});
   await page.evaluate(({title,note})=>{document.getElementById('effect-caption')!.textContent=title+' · '+note;},{title,note});
   console.log(title);await page.waitForTimeout(1600);
 };
 const clear=async()=>{
   const s=await state();for(const t of s.tokens){const e=t.kind==='pc'?s.characters.find(c=>c.id===t.refId):s.monsters.find(m=>m.id===t.refId);for(const c of e?.conditions??[])socket.emit('condition:clear',{kind:t.kind,refId:t.refId,conditionId:c.id});}
   await state();await page.waitForTimeout(900);
 };
 try{
   await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();await expect(combat).toBeVisible();
   await click(page.getByRole('button',{name:'Tilted battlefield view',exact:true}));await expect(layer).toHaveAttribute('data-miniature-count','4',{timeout:90000});
   await page.getByLabel('Attack target',{exact:true}).selectOption(enemy.id);
   await page.mouse.move(740,585);for(let i=0;i<5;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(150);}
   await page.waitForTimeout(2200);
   await page.evaluate(()=>{
     const caption=document.createElement('div');caption.id='effect-caption';caption.style.cssText='position:fixed;top:48px;left:18px;max-width:900px;background:#091018ed;color:#eedfc3;border:1px solid #806b45;border-radius:6px;padding:10px 14px;font:17px/1.4 system-ui;pointer-events:none;z-index:30000';document.body.append(caption);
     const pointer=document.createElement('div');pointer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:60000';pointer.innerHTML='<svg id="effect-pointer" width="28" height="34" style="position:absolute;left:-50px"><path d="M3 2L3 28L10 21L16 32L21 29L15 20L25 20Z" fill="#fff5cd" stroke="#080b11" stroke-width="2"/></svg><div id="effect-click" style="position:absolute;width:36px;height:36px;border:3px solid #ffe698;border-radius:50%;opacity:0"></div>';document.body.append(pointer);
     document.addEventListener('mousemove',e=>{const p=document.getElementById('effect-pointer')!;p.style.left=e.clientX+'px';p.style.top=e.clientY+'px';});document.addEventListener('pointerdown',e=>{const p=document.getElementById('effect-click')!;p.style.left=e.clientX-20+'px';p.style.top=e.clientY-20+'px';p.animate([{opacity:1,transform:'scale(.6)'},{opacity:0,transform:'scale(1.4)'}],{duration:700});},true);
   });
   capture=await startAv1Capture(page,info.outputPath('party-spells-darkness-av1.mp4'));started=Date.now();
   await chapter('Regular darkness · no placed lights','Vanec, Druk, Varis and a goblin. Spell glow is the only added light.');await page.screenshot({path:info.outputPath('poster.png')});await page.waitForTimeout(2500);
   await chapter('Shield','An incoming hit offers a reaction. Choose Shield to raise a blue barrier.');
   for(let i=0;i<6;i++){socket.emit('combat:attack',{attackerTokenId:enemy.id,targetTokenId:actor.id,weaponIndex:0});await expect.poll(async()=>(await state()).rollLog.filter(r=>r.label==='Attack').length,{timeout:25000}).toBe(i+1);if((await state()).shieldReactions?.length)break;await page.waitForTimeout(700);}
   await settle();
   const shield=page.getByRole('region',{name:'Shield reaction'});await expect(shield).toBeVisible();await click(shield.getByRole('button',{name:'Shield · L1',exact:true}));await settle();await expect(layer).toHaveAttribute('data-spell-impact-kinds',/shield/);await page.screenshot({path:info.outputPath('shield.png')});await page.waitForTimeout(6500);await clear();
   await chapter('Misty Step','Choose a visible destination, then Teleport. Silver wisps fade at the landing point.');
   await click(combat.getByRole('button',{name:/Misty Step/}));const destination=page.getByRole('region',{name:'Misty Step destination'});const q=await point(actor.id,65,-15);await page.mouse.move(q.x,q.y,{steps:18});await page.waitForTimeout(900);await page.mouse.click(q.x,q.y);await click(destination.getByRole('button',{name:'Teleport',exact:true}));await expect(layer).toHaveAttribute('data-spell-impact-kinds',/mist/);await page.screenshot({path:info.outputPath('misty-step.png')});await page.waitForTimeout(2200);
   await chapter('Hypnotic Pattern','Place the cube, confirm, then resolve the Wisdom save. Colored loops remain on the affected goblin.');
   await click(combat.getByRole('button',{name:/Hypnotic Pattern/}));const area=page.getByRole('region',{name:'Place spell area'});const p=await point(enemy.id,0,-180);await page.mouse.move(p.x,p.y,{steps:18});await page.waitForTimeout(700);await page.mouse.click(p.x,p.y);await area.getByRole('slider',{name:'Spell area rotation'}).press('Home');await page.waitForTimeout(700);await page.screenshot({path:info.outputPath('hypnotic-area.png')});await click(area.getByRole('button',{name:/Confirm area/}));await settle();await expect.poll(async()=>(await state()).monsters.find(m=>m.id===enemy.refId)!.conditions.some(c=>c.combatEffect?.spell==='Hypnotic Pattern')).toBe(true);await expect(layer).toHaveAttribute('data-spell-impact-kinds',/pattern/);await page.screenshot({path:info.outputPath('hypnotic-pattern.png')});await page.waitForTimeout(6500);await clear();
   await chapter('Command','Choose Halt and cast. A failed Wisdom save leaves a gold sigil above the target until Command ends.');
   await click(combat.getByRole('button',{name:/Command/}));const choice=page.getByRole('dialog',{name:'Choose Command'});await click(choice.getByRole('button',{name:'Halt',exact:true}));await page.waitForTimeout(900);await click(choice.getByRole('button',{name:'Cast Command',exact:true}));await settle();await expect(layer).toHaveAttribute('data-spell-impact-kinds',/command/);await page.screenshot({path:info.outputPath('command.png')});await page.waitForTimeout(6500);
   await clear();
   const footsteps=()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.footstep')).length);
   const walk=async(dx:number,dy:number)=>{const a=await point(actor.id,0,0),b=await point(actor.id,dx,dy);await page.mouse.move(a.x,a.y,{steps:16});await page.mouse.down();await page.waitForTimeout(250);await page.mouse.move(b.x,b.y,{steps:32});await page.waitForTimeout(800);await page.mouse.up();await page.waitForTimeout(1700);};
   await chapter('Before the stealth spell','Normal movement leaves visible footprints.');
   await walk(110,90);await expect.poll(footsteps).toBeGreaterThan(2);await page.screenshot({path:info.outputPath('footsteps-before.png')});await page.waitForTimeout(2000);
   await expect.poll(footsteps,{timeout:15000}).toBe(0);
   await chapter('Pass without Trace','Choose allies, then confirm. Protected characters gain +10 Stealth and leave no new footprints.');
   await click(combat.getByRole('button',{name:/Pass without Trace/}));await expect(area).toBeVisible();const foeChoice=area.getByRole('checkbox',{name:/Goblin/});if(await foeChoice.count())await foeChoice.uncheck();await page.waitForTimeout(1000);await click(area.getByRole('button',{name:/Confirm area/}));await expect(layer).toHaveAttribute('data-spell-impact-kinds',/veil/);await page.waitForTimeout(2400);await expect(layer).toHaveAttribute('data-spell-light-strength','0');await page.screenshot({path:info.outputPath('pass-without-trace.png')});
   await chapter('Stealth check with the buff','Checks → Stealth. The dice result adds a labeled +10 from Pass without Trace.');
   await click(page.getByRole('button',{name:'Checks',exact:true}));const stealth=page.getByRole('button',{name:/^Roll Stealth check/});await expect(stealth).toContainText('+10');await page.screenshot({path:info.outputPath('stealth-bonus-menu.png')});await click(stealth);await settle(2200);
   const check=(await state()).rollLog.findLast(r=>r.label==='Stealth check')!;expect(check.reveal?.toHit).toContainEqual({label:'Pass without Trace',value:10});
   const drawer=page.getByRole('region',{name:'Quick skill checks'});if(await drawer.isVisible())await click(drawer.getByRole('button',{name:'Close',exact:true}));
   await chapter('No tracks while protected','Vanec moves again, but the spell suppresses new footprints. The veil adds no light.');
   await walk(-110,-90);expect(await footsteps()).toBe(0);await page.screenshot({path:info.outputPath('footsteps-after.png')});await page.waitForTimeout(4500);await clear();
   expect(errors).toEqual([]);
 }finally{
   if(capture)writeFileSync(info.outputPath('capture.json'),JSON.stringify(await capture.stop(),null,2));
   writeFileSync(info.outputPath('scene-debug.json'),JSON.stringify({kinds:await layer.getAttribute('data-spell-impact-kinds'),strength:await layer.getAttribute('data-spell-light-strength')},null,2));writeFileSync(info.outputPath('chapters.json'),JSON.stringify(chapters,null,2));writeFileSync(info.outputPath('evidence.json'),JSON.stringify({errors,snapshot:await state()},null,2));await context.close();socket.disconnect();
 }
});
