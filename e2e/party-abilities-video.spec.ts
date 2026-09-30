import {test,expect,type Page,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {DM_SECRET,PORT} from './playwright.config';

// Opt-in recording; the private, read-only sheet export is never bundled.
test.skip(process.env.DND_PARTY_DEMO!=='1','Manual campaign walkthrough recording');
test.beforeAll(()=>{const require=createRequire(process.cwd()+'/package.json');const encoder=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');const path=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];encoder.executablePath=()=>path;encoder.executablePathOrDie=()=>path;});

for(const actor of ['Varis','Druk','Vanec'])test(`party abilities walkthrough ${actor}`,async({browser,request},info)=>{
 test.setTimeout(1200000);
 const sheets=JSON.parse(readFileSync('artifacts/party-combat-sheets.json','utf8'));
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Party abilities — isolated demonstration'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(8000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const initial=await snap(),people:any={};
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard training encounter',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});
 socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});socket.emit('fog:setLayer',{mapId:map.id,layer:'tokens',enabled:false});socket.emit('map:setActive',{mapId:map.id});socket.emit('session:setManualDamage',{manual:true});
 for(const [name,x,y] of [['Druk',600,540],['Varis',430,640],['Vanec',790,625]] as const){
  const source=sheets.find((s:any)=>s.name===name),c=initial.characters.find((c:any)=>c.name===name);people[name]=c;
  const fresh=(values:any)=>Object.fromEntries(Object.entries(values).map(([k,v]:any)=>[k,{...v,used:0}]));
  socket.emit('character:update',{characterId:c.id,name,race:source.race,className:source.class_name,subclass:source.subclass,level:source.level,maxHp:source.max_hp,curHp:source.cur_hp,armorClass:source.armor_class,speed:source.speed,stats:source.stats,weapons:source.weapons,sheetAbilities:source.sheet_abilities,abilities:source.abilities,actions:source.actions,resources:fresh(source.resources),spellSlots:fresh(source.spell_slots),modifiers:source.modifiers,superiorityDie:source.superiority_die,proficientSkills:source.proficient_skills,saveProficiencies:source.save_proficiencies});
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x,y});
 }
 for(const [name,modelType,x,y] of [['Bugbear guard','bugbear',635,480],['Goblin archer','goblin',690,445],['Skeleton','skeleton',890,445],['Cultist','cultist',940,565]] as const){
  socket.emit('monster:create',{name,modelType,maxHp:160,armorClass:12,disposition:'enemy',stats:{STR:12,DEX:12,CON:12,INT:8,WIS:8,CHA:8},weapons:[{name:'Scimitar',kind:'melee',damage:'1d6+2',damageType:'slashing',attackBonus:3}]});
  const m=(await snap()).monsterTemplates.find((m:any)=>m.name===name);socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:m.id,x,y});
 }
 socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dusk',weather:'none',mist:false,shadows:true,lights:[]}});
 await snap();
 const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000},recordVideo:{dir:info.outputPath('capture'),size:{width:1600,height:1000}}});
 const page=await context.newPage();page.setDefaultTimeout(16000);
 const errors:string[]=[],chapters:any[]=[],evidence:any[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async d=>{evidence.push({dialog:d.message()});await page.waitForTimeout(900);await d.accept();});
 let currentStep='',chapterId=0;
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:actor}).click();
 await expect(page.getByTestId('player-hud')).toBeVisible();await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
 await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','7',{timeout:65000});
 await page.waitForTimeout(1200);
 // Recording aids only: actual pointer events still go to the unmodified app.
 const installOverlay=async(p:Page)=>p.evaluate(()=>{
  const el=document.createElement('div');el.id='walkthrough-overlay';el.setAttribute('popover','manual');el.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;pointer-events:none;overflow:visible;color:white';
  el.innerHTML='<div id="demo-head" style="position:absolute;left:330px;bottom:48px;width:950px;box-sizing:border-box;background:#0a141def;border:1px solid #bfa574;border-radius:8px;padding:10px 18px;font:20px/1.35 Georgia"><strong id="demo-title"></strong><div id="demo-step" style="color:#dbe7ed;font:17px/1.4 system-ui;margin-top:5px"></div></div><div id="demo-code" style="position:absolute;left:212px;top:45px;height:2px;display:flex"></div><svg id="demo-pointer" width="34" height="40" style="position:absolute;left:-80px;top:-80px;filter:drop-shadow(0 1px 3px black)"><path d="M3 2L3 30L10 23L16 36L22 33L15 21L27 21Z" fill="#fff6cf" stroke="#070b0f" stroke-width="2"/></svg><div id="demo-ring" style="position:absolute;left:-80px;top:-80px;width:46px;height:46px;border:4px solid #ffe59b;border-radius:50%;box-shadow:0 0 14px #ffd466;opacity:0"></div>';
  document.body.append(el);el.showPopover();
  document.addEventListener('mousemove',e=>{const c=document.getElementById('demo-pointer')!;c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';});
  document.addEventListener('pointerdown',e=>{const r=document.getElementById('demo-ring')!;r.style.left=(e.clientX-25)+'px';r.style.top=(e.clientY-25)+'px';r.animate([{opacity:1,transform:'scale(.65)'},{opacity:0,transform:'scale(1.35)'}],{duration:850});},true);
 });
 await installOverlay(page);
 const overlay=async()=>page.evaluate(()=>{const el=document.getElementById('walkthrough-overlay')!;el.hidePopover();el.showPopover();});
 const step=async(text:string)=>{currentStep=text;await page.evaluate(text=>{document.getElementById('demo-step')!.textContent=text;},text);await overlay();await page.waitForTimeout(650);};
 const chapter=async(title:string,flow:string,status='automated')=>{
  chapterId++;console.log(actor,chapterId,title);chapters.push({id:chapterId,title,flow,status,started:Date.now()});
  await page.evaluate(({id,title,actor})=>{document.getElementById('demo-title')!.textContent=`${String(id).padStart(2,'0')} · ${actor} — ${title}`;document.getElementById('demo-code')!.innerHTML=Array.from({length:8},(_,bit)=>`<i style="width:8px;height:2px;background:${id&(1<<bit)?'#fff':'#000'}"></i>`).join('');},{id:chapterId,title,actor});await step(flow);
 };
 const click=async(l:Locator,label?:string)=>{if(label)await step(label);await l.scrollIntoViewIfNeeded();await l.evaluate(el=>{if(el.closest('.character-window'))el.scrollIntoView({block:'center'});});await overlay();const b=await l.boundingBox();expect(b).toBeTruthy();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:18});await page.waitForTimeout(350);await l.click();await page.waitForTimeout(500);};
 const choose=async(l:Locator,value:string,label:string)=>{await step(label);await l.scrollIntoViewIfNeeded();await overlay();const b=await l.boundingBox();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:15});await l.click();await page.waitForTimeout(650);await page.keyboard.press('Escape');await l.selectOption(value);await page.waitForTimeout(700);};
 const point=async(id:string,dx=0,dy=0)=>page.evaluate(({id,dx,dy})=>{const K=(window as any).Konva;const s=K.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),scale=n.getAbsoluteScale(),r=s.container().getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform),v=new DOMPoint(p.x+dx*scale.x-s.width()/2,p.y+dy*scale.y-s.height()/2).matrixTransform(m);return{x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};},{id,dx,dy});
 const target=async(name='Bugbear')=>{const s=await snap();return s.tokens.find((t:any)=>t.kind==='monster'&&s.monsters.find((m:any)=>m.id===t.refId)?.name.startsWith(name));};
 const tokenClick=async(t:any,label:string,right=false)=>{await step(label);const p=await point(t.id);await page.mouse.move(p.x,p.y,{steps:24});await page.waitForTimeout(450);await page.mouse.click(p.x,p.y,{button:right?'right':'left'});await page.waitForTimeout(550);};
 const selectTarget=async(name='Bugbear')=>{const t=await target(name);await choose(page.getByLabel('Attack target',{exact:true}),t.id,`Combat panel → Target → ${name}. Distance is shown in the list.`);return t;};
 const roll=async(action:()=>Promise<any>,label='Watch the physical dice, modifiers and result; then close the result.')=>{
  const before=(await snap()).rollLog.map((r:any)=>r.id);await action();
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible({timeout:20000});
  await page.evaluate(text=>{document.getElementById('demo-step')!.textContent=text;},label);
  await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:120000});
  await page.waitForTimeout(350);if(await page.locator('.roll-reveal').isVisible())await expect(page.locator('.roll-reveal')).toHaveAttribute('data-impact-ready','true',{timeout:30000});await page.waitForTimeout(1750);
  if(await page.locator('.roll-reveal').isVisible())await click(page.locator('.roll-reveal'),'Click the completed result to close it and keep any spell targeting active.');
  await page.waitForTimeout(450);evidence.push({chapter:chapterId,rolls:(await snap()).rollLog.filter((r:any)=>!before.includes(r.id))});
 };
 const combat=page.locator('.compact-player-combat');
 const damage=async()=>{if(await page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').isVisible())await roll(()=>click(page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn'),'Hit → Roll damage. HP and the spell effect apply after the dice finish.'));};
 const attack=async(name:string,options:{feature?:string;maneuver?:string;right?:boolean;enemy?:string}={})=>{
  const t=await selectTarget(options.enemy);let hit=false;
  for(let attempt=0;attempt<(options.feature||options.maneuver?5:1);attempt++){
   if(options.right){await tokenClick(t,'Right-click the enemy base → token action menu.',true);await roll(()=>click(page.getByRole('dialog',{name:'Token actions'}).getByRole('button',{name:new RegExp(name)}).first(),`Token menu → ${name}.`));}
   else await roll(()=>click(combat.getByRole('button',{name:new RegExp(name)}).first(),`Combat panel → ${name}. Roll to hit.`));
   hit=await page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').isVisible();if(hit||(!options.feature&&!options.maneuver))break;
   await step('That attack missed. Try another attack to demonstrate the on-hit option.');
  }
  if(hit&&options.feature){await click(page.locator('.damage-prompt').getByRole('button',{name:options.feature,exact:true}),`Hit → ${options.feature}, beside Roll damage.`);await roll(()=>click(page.locator('.damage-prompt').getByRole('button',{name:'L1',exact:true}),'Choose L1: spend the slot and resolve the hit effect.'));}
  else if(hit&&options.maneuver){await click(page.locator('.damage-prompt').getByRole('button',{name:'Maneuver',exact:true}),'Hit → Maneuver.');await roll(()=>click(page.locator('.damage-prompt').getByRole('button',{name:options.maneuver,exact:true}),`Choose ${options.maneuver}: spends a Superiority Die.`));}
  else await damage();
  return hit;
 };
 const openBook=async()=>{await click(page.getByRole('button',{name:'Spellbook',exact:true}).first(),'Left rail → Spellbook.');await expect(page.locator('.character-window')).toBeVisible();await overlay();};
 const entry=(name:string)=>page.locator('.character-window .spell-entry').filter({has:page.locator('.spell-name').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
 const detail=async(name:string)=>{await openBook();await click(entry(name).getByTitle('Show details'),`Spellbook → ${name} → expand its description.`);await page.waitForTimeout(1500);};
 const closeBook=async()=>click(page.getByLabel('Close character window'),'Close the character window to return to combat.');
 const castConcentration=async(name:string,note:string)=>{await chapter(name,`Read ${name}, then use its Cast button.`, 'cast + manual effect');await detail(name);await click(entry(name).getByRole('button',{name:/Cast/}),note);await closeBook();await page.waitForTimeout(1800);};
 const manual=async(name:string,note:string)=>{await chapter(name,'Spellbook → description and available controls.','manual / description');await detail(name);await step(note);await page.waitForTimeout(2200);await closeBook();};
 const resources=async(name:string,spend:number,group='resources')=>{
  await click(page.getByLabel(`Open ${actor}'s character record`),'Character record → Resources.');const dialog=page.locator('.character-window');
  const row=dialog.locator('.res-row').filter({has:page.locator('.res-name').filter({hasText:new RegExp('^'+name+'$')})});
  const c=(await snap()).characters.find((c:any)=>c.id===people[actor].id),key=group==='spellSlots'?name.replace('Lvl ','L'):name,counter=c[group][key];
  const remaining=counter.max-counter.used,next=Math.max(0,remaining-spend);
  const index=next===0?0:next===remaining-1?remaining-1:next-1;
  await click(row.locator('.pip').nth(index),`Click ${name} pips to ${spend>0?'spend':'restore'} ${Math.abs(spend)} use(s); this is manual tracking.`);
  await page.waitForTimeout(500);await closeBook();
 };
 const applyTargets=async(names:string[],saveOnly=false)=>{
  await click(page.getByRole('button',{name:saveOnly?/Roll saving throws/:/Apply spell damage/}).first(),saveOnly?'Spell prompt → Roll saving throws.':'Spell prompt → Apply spell damage.');
  for(const name of names){const t=await target(name);await roll(()=>tokenClick(t,`Click ${name}'s base to resolve this spell on that target.`));}
  const done=page.locator('.spell-prompt').getByRole('button',{name:'Done',exact:true});if(await done.isVisible())await click(done,'Done: leave spell targeting without casting again.');
 };
 const move=async(dx:number,dy:number)=>{const t=(await snap()).tokens.find((t:any)=>t.refId===people[actor].id),a=await point(t.id),b=await point(t.id,dx,dy);await step('Drag your token base. Preview the destination and distance; release to move.');await page.mouse.move(a.x,a.y,{steps:20});await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:40});await page.waitForTimeout(900);await page.mouse.up();await page.waitForTimeout(1800);};
 try{
  await chapter('Campaign loadout',`Level 6 ${sheets.find((s:any)=>s.name===actor).class_name}. Copied sheet; refreshed resources. Original campaign is unchanged.`,'introduction');
  await page.waitForTimeout(2200);await page.screenshot({path:info.outputPath('poster.png')});
  if(process.env.DND_PARTY_PROBE==='1'){await openBook();writeFileSync(info.outputPath('ui.txt'),await page.locator('body').innerText());await page.screenshot({path:info.outputPath('book.png')});return;}
  // Character-specific flows are below; every gameplay action uses visible UI.
  if(actor==='Varis'){
   await chapter('Movement and bow attack','Move on the map, choose a target, attack, then roll damage.');await move(60,-45);await attack('HotGuy Bow',{right:true});
   await chapter('Hunter’s Mark','Choose an enemy → cast the mark → attack that marked enemy.');await selectTarget();await click(combat.getByRole('button',{name:/Hunter.s Mark/}),'Combat panel → Hunter’s Mark. The cast marks the selected enemy.');await page.waitForTimeout(1800);await attack('HotGuy Bow');
   await chapter('Hail of Thorns','A ranged hit offers the spell beside Roll damage.');await attack('HotGuy Bow',{feature:'Hail of Thorns'});
   await step('The 5 ft burst selects targets automatically. Each creature saves; the shared d10 damage applies without more target clicks.');await page.waitForTimeout(2000);
   await chapter('Ensnaring Strike','Hit → Ensnaring Strike → slot level → target saving throw and vines.');await attack('HotGuy Bow',{feature:'Ensnaring Strike'});
   await chapter('Cure Wounds','Select a wounded ally in Heal target, then cast.');const ds=(await snap()).tokens.find((t:any)=>t.refId===people.Druk.id);await choose(combat.locator('.dice-row').filter({hasText:'Heal target'}).locator('select'),ds.id,'Heal target → Druk.');await roll(()=>click(combat.getByRole('button',{name:/Cure Wounds/}),'Cure Wounds → roll healing and apply it to Druk.'));
   await castConcentration('Pass without Trace','Cast starts concentration and spends the slot. The +10 Stealth bonus still needs manual tracking.');
   await chapter('Remaining weapons','Shortsword, off-hand dagger and the saved Gernade attack.');await move(75,-65);await attack('Shortsword');await click(combat.getByRole('button',{name:'Off-hand',exact:true}),'Enable Off-hand for the dagger.');await attack('Dagger');await click(combat.getByRole('button',{name:'Off-hand',exact:true}),'Turn Off-hand off.');await attack('Gernade');
  }
  if(actor==='Druk'){
   await chapter('Great Weapon Master and Halberd','The saved GWM toggle is on; attack with the heavy halberd.');await attack('Halberd',{right:true});
   await chapter('Lunging Attack','Arm before the attack; the next hit includes a Superiority Die.');await click(combat.locator('.combat-toggle-row').filter({hasText:'Lunging Attack'}).getByRole('button'),'Lunging Attack → Off to Armed.');await attack('Halberd');
   await chapter('Pushing Attack','A hit offers Maneuver → Pushing Attack beside Roll damage.');await attack('Halberd',{maneuver:'Pushing Attack'});await applyTargets(['Bugbear'],true);await step('Read the STR save result. The push distance is applied by moving the target manually.');await page.waitForTimeout(1800);
   await chapter('Second Wind','Use the Combat button; healing and the resource counter update.');await roll(()=>click(combat.getByRole('button',{name:/Second Wind/}),'Second Wind → roll 1d10 + fighter level healing.'));
   await chapter('Action Surge','Spend its resource manually, then take another attack.','manual resource');await resources('Action Surge',1);await attack('Spine Club');
   await chapter('Longbow Mastery','Read Slow, then attack with the bow. The saved mastery text requests manual tracking.','manual rider');await detail('Longbow Mastery');await step('Slow: reduce speed by 10 ft after a hit. This saved entry has no automatic effect toggle.');await closeBook();await attack('Longbow');
   await chapter('Handaxe Mastery','Read Vex, attack, then arm advantage for the next attack on that enemy.','manual rider');await detail('Handaxe Mastery');await closeBook();const vexHit=await attack('Handaxe');if(vexHit){await click(combat.getByRole('button',{name:/^.*ADV$/}).first(),'Vex: manually arm Advantage after the successful hit.');await attack('Handaxe');}
   await chapter('Longsword Mastery','Read Sap, then use the versatile sword in two hands.','manual rider');await detail('Longsword Mastery');await closeBook();await click(combat.getByRole('button',{name:'2H',exact:true}),'2H uses the longsword’s d10 damage.');await attack('Longsword');await step('Sap requires disadvantage on the enemy’s next attack; this saved entry describes manual tracking.');await page.waitForTimeout(1500);
   await chapter('Riposte','A missed enemy melee attack opens the temporary reaction prompt.','reaction');
   // The DM attack is recorded in a separate segment; do not fake a reaction offer.
   const dm=await context.newPage();await dm.goto(`/dm?code=${code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await expect(dm.getByTestId('miniature-layer')).toBeVisible();
   await installOverlay(dm);await dm.evaluate(()=>{document.getElementById('demo-title')!.textContent='Druk ? DM setup for Riposte';document.getElementById('demo-step')!.textContent='Select the Bugbear, right-click Druk, then choose Scimitar. A miss offers Druk a reaction.';});
   const dt=(await snap()).tokens.find((t:any)=>t.refId===people.Druk.id),bug=await target();
   // Map the same existing menu through the DM view (no direct combat event injection).
   const dmPoint=async(id:string)=>dm.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},id);
   for(let attempt=0;attempt<8;attempt++){
    const before=(await snap()).rollLog.map((r:any)=>r.id),b=await dmPoint(bug.id),d=await dmPoint(dt.id);
    await dm.mouse.move(b.x,b.y,{steps:20});await dm.waitForTimeout(450);await dm.mouse.click(b.x,b.y);
    await dm.mouse.move(d.x,d.y,{steps:20});await dm.waitForTimeout(450);await dm.mouse.click(d.x,d.y,{button:'right'});
    const button=dm.getByRole('dialog',{name:'Token actions'}).getByRole('button',{name:/Scimitar/});
    const bounds=await button.boundingBox();await dm.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+bounds!.height/2,{steps:20});await dm.waitForTimeout(650);await button.click();
    await expect.poll(async()=>(await snap()).rollLog.some((r:any)=>!before.includes(r.id)&&r.reveal?.kind==='attack'),{timeout:45000}).toBe(true);
    await dm.waitForTimeout(1600);await dm.keyboard.press('Escape');
    if(await page.getByRole('region',{name:'Riposte opportunity'}).isVisible())break;
    if(await dm.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').isVisible()){
      const beforeDamage=(await snap()).rollLog.map((r:any)=>r.id);await dm.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn').click();
      await expect.poll(async()=>(await snap()).rollLog.some((r:any)=>!beforeDamage.includes(r.id)&&r.reveal?.kind==='damage'),{timeout:45000}).toBe(true);
      await dm.waitForTimeout(1400);await dm.keyboard.press('Escape');
    }
   }
   const dmVideo=dm.video()!;await dm.close();writeFileSync(info.outputPath('dm-riposte-video.txt'),await dmVideo.path());
   await page.bringToFront();await roll(()=>click(page.getByRole('region',{name:'Riposte opportunity'}).getByRole('button',{name:/Riposte.*Halberd/}),'Riposte → Halberd. This spends a Superiority Die and your reaction.'));await damage();
   await chapter('Saved traits and custom action','Character → Traits & Feats; Spellbook → Custom actions.','passive / description');await click(page.getByLabel("Open Druk's character record"));await click(page.locator('.character-window').getByText('Traits & Feats',{exact:true}));await step('Defense, Savage Attacker, Orc Resilience and Slasher are saved traits. Review their text and any manual bookkeeping.');await page.waitForTimeout(3500);await closeBook();await openBook();await page.locator('.character-window').getByText('Custom actions',{exact:true}).scrollIntoViewIfNeeded();await step('Tactical Shift is saved as custom text here; it has no roll button.');await page.waitForTimeout(2500);await closeBook();
  }
  if(actor==='Vanec'){
   await chapter('Fire Bolt','Choose an enemy → Fire Bolt → attack roll → Roll damage.');await attack('Fire Bolt',{right:true,enemy:'Goblin'});
   await chapter('Chromatic Orb','Choose damage type and slot level, then cast from the right-click menu.');const g=await target('Goblin');await tokenClick(g,'Right-click Goblin → Chromatic Orb controls.',true);const menu=page.getByRole('dialog',{name:'Token actions'});await choose(menu.getByLabel('Chromatic Orb damage type'),'lightning','Chromatic Orb damage type → Lightning.');await roll(()=>click(menu.getByRole('button',{name:/Chromatic Orb/}),'Cast Chromatic Orb on the selected goblin.'));await damage();
   const orb=page.getByRole('region',{name:'Chromatic Orb'});if(await orb.isVisible()){await click(orb.getByRole('button',{name:'Choose target',exact:true}),'Matching damage dice → Choose target for a free leap.');await tokenClick(await target('Skeleton'),'Click Skeleton’s base; inspect the named confirmation.');await roll(()=>click(orb.getByRole('button',{name:'Confirm target',exact:true}),'Confirm target → roll the leap attack.'));await damage();if(await orb.isVisible())await click(orb.getByRole('button',{name:'End spell',exact:true}),'End spell once the demonstration is complete.');}else{await step('No matching damage dice on this roll, so no leap is offered.');await page.waitForTimeout(1700);}
   await chapter('Shocking Grasp','Move toward the enemy → melee spell attack → lightning damage.');await move(5,-100);await attack('Shocking Grasp',{enemy:'Skeleton'});
   await chapter('Command','Choose target → Command → WIS save. The one-word command is adjudicated manually.');await selectTarget('Cultist');await roll(()=>click(combat.getByRole('button',{name:/Command/}),'Command → force the selected creature’s WIS save.'));
   await chapter('Hold Person','Choose a humanoid → Hold Person → WIS save and concentration.');await roll(()=>click(combat.getByRole('button',{name:/Hold Person/}),'Hold Person → roll its WIS save. Paralyzed still needs manual application on a failure.'));
   await chapter('Hypnotic Pattern','Cast once → Roll saving throws → click each affected target.');await click(combat.getByRole('button',{name:/Hypnotic Pattern/}),'Hypnotic Pattern starts concentration; now choose targets.');await applyTargets(['Goblin','Cultist'],true);await step('On failed saves, Charmed and Incapacitated are applied manually. The template does not select targets automatically.');await page.waitForTimeout(1600);
   await chapter('Fireball','Roll damage once → Apply spell damage → click each affected creature.');await roll(()=>click(combat.getByRole('button',{name:/Fireball/}),'Fireball → roll all eight d6.'));await applyTargets(['Goblin','Skeleton','Cultist']);
   await castConcentration('Detect Magic','Cast starts concentration and spends a slot. Magic detection itself is DM-adjudicated.');
   await castConcentration('Haste','Cast starts concentration. Choose the willing recipient with your DM; the buff is tracked manually.');
   await castConcentration('Alter Self','Cast starts concentration. The selected transformation and its effects are manual.');
   for(const [name,note] of [
    ['Shield','This saved Shield has no Cast button. Spend an L1 slot manually and track +5 AC until the next turn.'],
    ['Misty Step','This saved entry has no teleport control. Spend an L2 slot and have the DM move you to a legal visible space.'],
    ['Mage Hand','This saved Mage Hand has no Summon button. Its hand token must be placed manually by the DM.'],
    ['Prestidigitation','Description-only utility: describe the minor effect to the DM; no dice or slot is needed.'],
    ['Message','Description-only utility: the app does not open a private spell-message flow.'],
    ['Twinned Spell','Description-only metamagic: spend sorcery points and resolve the second target manually.'],
    ['Empowered Spell','Description-only metamagic: spend a sorcery point and reroll the chosen damage dice manually.'],
    ['Metamagic: Quickened Spell','Description-only metamagic: spend 2 sorcery points, then cast the spell using its normal button.'],
   ]){await manual(name,note);if(name==='Shield')await resources('Lvl 1',1,'spellSlots');if(name==='Misty Step')await resources('Lvl 2',1,'spellSlots');if(name==='Twinned Spell'||name==='Empowered Spell')await resources('Sorcery Points',1);if(name==='Metamagic: Quickened Spell')await resources('Sorcery Points',2);}
   await chapter('Font of Magic and custom resources','Character → Traits & Feats and Resources.','manual resource');await click(page.getByLabel("Open Vanec's character record"));await click(page.locator('.character-window').getByText('Traits & Feats',{exact:true}));await step('Font of Magic is saved as text. Convert slots and Sorcery Points manually using the resource pips.');await page.waitForTimeout(2200);await closeBook();
   await chapter('Saved custom actions and staff','Inspect legacy actions and the weapon loadout.','saved-data review');await openBook();await step('Scorching Ray is saved in Custom actions, not as a combat-panel spell. Its three-ray workflow is unavailable from this saved entry.');await page.locator('.character-window-content').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(2600);await closeBook();await selectTarget('Skeleton');await step('The Magical Orc Staff is saved without damage dice. The recording leaves that incomplete definition intact.');await page.waitForTimeout(2200);await attack('Shortsword');await attack('Dagger');
  }
  await chapter('Review complete','Every saved spell and ability was covered. Manual gaps were shown rather than silently automated.','summary');await page.waitForTimeout(2200);
 }catch(error){writeFileSync(info.outputPath('capture-error.txt'),String((error as Error).stack??error));throw error;}finally{
  evidence.push({finalCharacters:(await snap()).characters,errors});writeFileSync(info.outputPath('chapters.json'),JSON.stringify({actor,chapters,evidence},null,2));await page.screenshot({path:info.outputPath('end.png')}).catch(()=>{});
  const video=page.video()!;await context.close();writeFileSync(info.outputPath('video-path.txt'),await video.path());socket.disconnect();
 }
 expect(errors).toEqual([]);
});
