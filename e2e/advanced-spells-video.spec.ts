import {test,expect,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';

test.skip(process.env.DND_ADVANCED_SPELL_VIDEO!=='1','Opt-in spell-effects recording in a disposable campaign');
test('four advanced spells on 3D miniatures in regular darkness',async({browser,request},info)=>{
 test.setTimeout(480000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Party spells — regular darkness preview'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const state=async():Promise<StateSnapshot>=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await state(),caster=initial.characters.find(c=>c.name==='Vanec')!;
 const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
 const names=['Invisibility','Spike Growth','Counterspell','Dispel Magic','Fire Bolt','Haste'];
 const abilities=names.map(name=>({...catalog.find(a=>a.name===name)!,id:name,source:'srd' as const,sourceClass:'sorcerer'}));
 for(const c of initial.characters)socket.emit('character:update',{characterId:c.id,maxHp:100,curHp:100,armorClass:16,conditions:[],...(c.id===caster.id?{className:'Sorcerer',level:8,stats:{CHA:30,DEX:10,WIS:10,INT:10,STR:10,CON:10},sheetAbilities:abilities,spellSlots:{L1:{max:10,used:0},L2:{max:10,used:0},L3:{max:10,used:0},L4:{max:10,used:0}}}:{})});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard after dark',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:80,locked:false});
 for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:false,lightLevel:.7,sceneTintStrength:0,weather:'none',mist:false,shadows:true,lights:[]}});
 const positions:Record<string,[number,number]>={Vanec:[570,560],Druk:[515,600],Varis:[655,640]};
 for(const c of initial.characters){const p=positions[c.name];if(p)socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:p[0],y:p[1]});}
 socket.emit('monster:create',{name:'Goblin guard',modelType:'goblin',maxHp:200,armorClass:12,disposition:'enemy',creatureType:'humanoid',stats:{WIS:1,DEX:10,STR:10,CON:1},weapons:[{name:'Training blade',kind:'melee',damage:'1d6',attackBonus:12,damageType:'slashing'}]});
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
     if(await reveal.isVisible()){quiet=0;if(await reveal.getAttribute('data-impact-ready')==='true'){await page.waitForTimeout(hold);if(await reveal.isVisible())await page.keyboard.press('Escape');}}
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
   capture=await startAv1Capture(page,info.outputPath('advanced-spells-av1.mp4'));started=Date.now();
   await chapter('Regular darkness · no placed lights','Vanec, Druk, Varis and a goblin. Spell glow is the only added light.');await page.screenshot({path:info.outputPath('poster.png')});await page.waitForTimeout(2500);
   await chapter('Invisibility','Combat > Invisibility > choose Vanec > Cast. A shimmer leaves a translucent figure for the party.');
   await click(combat.getByRole('button',{name:/Invisibility/}));
   const invis=page.getByRole('region',{name:'Invisibility targets'});await click(invis.getByRole('button',{name:'Cast Invisibility',exact:true}));
   await expect(layer).toHaveAttribute('data-spell-impact-kinds',/shimmer/);await page.waitForTimeout(400);await page.screenshot({path:info.outputPath('invisibility.png')});
   await expect(layer).toHaveAttribute('data-invisible-miniature-count','1');await page.waitForTimeout(4200);
   await chapter('An attack ends Invisibility','Cast Fire Bolt at the goblin. The attack roll makes Vanec visible again.');
   await click(combat.getByRole('button',{name:/Fire Bolt/}));await settle(1600);await expect(layer).toHaveAttribute('data-invisible-miniature-count','0');await page.waitForTimeout(2000);
   await chapter('Spike Growth','Place the 20 ft radius near the goblin and confirm. Thorns rise across the full area; placement causes no damage.');
   await click(combat.getByRole('button',{name:/Spike Growth/}));const area=page.getByRole('region',{name:'Place spell area'});
   const center=await point(enemy.id,65,-35);await page.mouse.move(center.x,center.y,{steps:20});await page.waitForTimeout(700);await page.mouse.click(center.x,center.y);await click(area.getByRole('button',{name:/Confirm area/}));
   await expect(layer).toHaveAttribute('data-spell-impact-kinds',/thorns/);await page.waitForTimeout(1800);await page.screenshot({path:info.outputPath('spike-growth.png')});await page.waitForTimeout(3000);
   await chapter('Movement through thorns','The DM moves the goblin 10 ft through the area. Piercing damage rolls from the accepted movement.');
   socket.emit('token:move',{tokenId:enemy.id,x:820,y:510});await settle(1600);await page.waitForTimeout(2500);
   await chapter('Dispel Magic on terrain','Combat > Dispel Magic > Spike Growth area > Cast. Its lower-level magic ends without a check.');
   await click(combat.getByRole('button',{name:/Dispel Magic/}));const dispel=page.getByRole('region',{name:'Dispel Magic target'});
   const measurement=(await state()).measurements.find(m=>m.spellName==='Spike Growth')!;expect(measurement).toBeTruthy();
   await dispel.getByLabel('Dispel target',{exact:true}).selectOption(`effect:${measurement.id}`);await page.waitForTimeout(800);await click(dispel.getByRole('button',{name:'Cast Dispel Magic',exact:true}));
   await expect(layer).toHaveAttribute('data-spell-impact-kinds',/dispel/);await page.waitForTimeout(500);await page.screenshot({path:info.outputPath('dispel-area.png')});
   await expect.poll(async()=>(await state()).measurements.some(m=>m.spellName==='Spike Growth')).toBe(false);await page.waitForTimeout(3500);
   await clear();socket.emit('token:move',{tokenId:enemy.id,x:700,y:510});await state();await page.waitForTimeout(1000);
   await chapter('Counterspell reaction','The goblin starts Fire Bolt. Vanec gets a reaction before the spell resolves; Counterspell forces a CON save.');
   const foe=(await state()).monsters.find(m=>m.id===enemy.refId)!;socket.emit('monster:update',{monsterId:foe.id,sheetAbilities:[{...catalog.find(a=>a.name==='Fire Bolt')!,id:'enemy-firebolt',source:'srd'}]});await state();
   socket.emit('ability:roll',{kind:'monster',refId:foe.id,abilityId:'enemy-firebolt',targetTokenId:actor.id});
   const counter=page.getByRole('region',{name:'Counterspell reaction'});await expect(counter).toBeVisible();await page.waitForTimeout(2300);await page.screenshot({path:info.outputPath('counterspell-choice.png')});
   await click(counter.getByRole('button',{name:/Counterspell.*L3/}));await settle(2400);
   expect((await state()).rollLog.some(r=>r.label==='Counterspell')).toBe(true);await page.waitForTimeout(1500);
   await clear();
   await chapter('Dispel Magic on an upcast spell','Vanec grants Druk level-4 Invisibility, then uses level-3 Dispel Magic. This requires a CHA spellcasting check.');
   const druk=(await state()).tokens.find(t=>t.kind==='pc'&&initial.characters.find(c=>c.id===t.refId)?.name==='Druk')!;
   await combat.locator('.combat-ability-row').filter({hasText:'Invisibility'}).locator('select.spell-level').selectOption('4');
   await click(combat.getByRole('button',{name:/Invisibility/}));await invis.getByRole('checkbox',{name:'Vanec',exact:true}).uncheck();await invis.getByRole('checkbox',{name:'Druk',exact:true}).check();await click(invis.getByRole('button',{name:'Cast Invisibility',exact:true}));
   await expect(layer).toHaveAttribute('data-invisible-miniature-count','1');await page.waitForTimeout(3000);
   await click(combat.getByRole('button',{name:/Dispel Magic/}));await dispel.getByLabel('Dispel target',{exact:true}).selectOption(druk.id);await page.waitForTimeout(1000);await click(dispel.getByRole('button',{name:'Cast Dispel Magic',exact:true}));await settle(2400);
   expect((await state()).rollLog.some(r=>r.label==='Dispel Magic check'&&r.reveal?.title?.includes('CHA'))).toBe(true);await page.screenshot({path:info.outputPath('dispel-check.png')});await page.waitForTimeout(2500);
   await chapter('Four distinct effects','Invisibility shimmers; thorns persist; Counterspell collapses casting energy; Dispel Magic clears tracked spell effects.');await page.waitForTimeout(3500);
   expect(errors).toEqual([]);
 }finally{
   if(capture)writeFileSync(info.outputPath('capture.json'),JSON.stringify(await capture.stop(),null,2));
   writeFileSync(info.outputPath('scene-debug.json'),JSON.stringify({kinds:await layer.getAttribute('data-spell-impact-kinds'),strength:await layer.getAttribute('data-spell-light-strength')},null,2));writeFileSync(info.outputPath('chapters.json'),JSON.stringify(chapters,null,2));writeFileSync(info.outputPath('evidence.json'),JSON.stringify({errors,snapshot:await state()},null,2));await context.close();socket.disconnect();
 }
});
