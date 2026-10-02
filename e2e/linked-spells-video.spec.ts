import {test,expect,type Locator} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './av1Recorder';

const groups:Record<string,string[]>={
  control:['Hold Person','Hold Monster','Phantasmal Killer','Mirror Image'],
  repeat:['Vampiric Touch','Witch Bolt','Spiritual Weapon','Flame Blade','Heat Metal','Call Lightning'],
  elemental:['Ice Knife',"Melf's Acid Arrow",'Sorcerous Burst','Ice Storm','Flame Strike','Meteor Swarm'],
  riders:['Guiding Bolt','Ray of Frost','Ray of Sickness','Chill Touch','Shocking Grasp'],
};
test.skip(process.env.DND_LINKED_VIDEO!=='1','Opt-in recording with real dice in a disposable campaign');
test.beforeAll(()=>{
  const require=createRequire(process.cwd()+'/package.json'),encoder=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');
  const path=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];encoder.executablePath=()=>path;encoder.executablePathOrDie=()=>path;
});
for(const [group,allNames] of Object.entries(groups))test(`linked spell animation showcase ${group}`,async({browser,request},info)=>{
  const names=process.env.DND_LINKED_SPELLS?allNames.filter(name=>process.env.DND_LINKED_SPELLS!.split('|').includes(name)):allNames;
  test.skip(!names.length,'No requested spells in this group');
  test.setTimeout(1200000);
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Linked spells — isolated training arena'}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async():Promise<StateSnapshot>=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  const initial=await state(),caster=initial.characters.find(c=>c.name==='Vanec')!;
  const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
  const abilities=names.map((name,i)=>{
    const spell=catalog.find(s=>s.name.replace(/[’‘]/g,"'")===name)!;expect(spell).toBeTruthy();
    return {...spell,name,id:`showcase-${i}`,source:'srd' as const,sourceClass:'wizard',roll:spell.roll?{...spell.roll,attackBonus:30,dc:30}:undefined};
  });
  socket.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:17,maxHp:500,curHp:200,armorClass:12,stats:{STR:10,DEX:10,CON:10,INT:20,WIS:10,CHA:20},conditions:[],sheetAbilities:abilities,
    spellSlots:Object.fromEntries(Array.from({length:9},(_,i)=>[`L${i+1}`,{max:20,used:0}]))});
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Courtyard spell training',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
  socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  socket.emit('session:setManualDamage',{manual:true});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dusk',weather:'none',mist:false,shadows:true,lights:[]}});
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:610,y:575});
  for(const [name,modelType,x,y] of [['Bugbear guard','bugbear',665,535],['Goblin scout','goblin',705,505],['Skeleton','skeleton',755,560]] as const){
    socket.emit('monster:create',{name,modelType,maxHp:5000,armorClass:8,disposition:'enemy',creatureType:'Humanoid',stats:{STR:10,DEX:10,CON:10,INT:10,WIS:1,CHA:10},weapons:[{name:'Practice sword',kind:'melee',damage:'1d6',attackBonus:30}]});
    const template=(await state()).monsterTemplates.find(m=>m.name===name)!;
    socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
  }
  const ready=await state(),foe=ready.tokens.find(t=>t.kind==='monster'&&ready.monsters.find(m=>m.id===t.refId)?.name.startsWith('Bugbear'))!;
  const captureAv1=process.env.DND_PROFILE_NO_VIDEO!=='1'&&process.env.DND_CAPTURE_AV1!=='0';
  const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000},...(process.env.DND_PROFILE_NO_VIDEO==='1'||captureAv1?{}:{recordVideo:{dir:info.outputPath('capture'),size:{width:1600,height:1000}}})});
  const page=await context.newPage(),errors:string[]=[],chapters:{title:string;note:string;time:number}[]=[],evidence:unknown[]=[];page.setDefaultTimeout(20000);
  const gpu=await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo');
  await page.addInitScript(()=>{
    const samples:{ms:number;dice:string|null;material:string|null}[]=[];(window as any).captureFrameSamples=samples;
    let last=performance.now();const sample=(now:number)=>{
      const tray=document.querySelector('[data-live-dice="true"] .physics-dice-tray');
      if(samples.length<40000)samples.push({ms:now-last,dice:tray?.getAttribute('data-theme')??null,material:tray?.getAttribute('data-material')??null});last=now;requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  let started=Date.now(),current='';
  let av1:Awaited<ReturnType<typeof startAv1Capture>>|undefined;
  const chapter=async(title:string,note:string)=>{current=title;chapters.push({title,note,time:(Date.now()-started)/1000});console.log(group,title);await page.waitForTimeout(600);};
  const click=async(locator:Locator)=>{await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();expect(b).toBeTruthy();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:18});await page.waitForTimeout(350);await locator.click();};
  const layer=page.getByTestId('miniature-layer'),combat=page.locator('.compact-player-combat');
  const settle=async()=>{
    // Actual server physics completes before the final result is dismissed. Keep
    // successive save/damage reveals, and let the app release each map impact.
    const deadline=Date.now()+180000;let quiet=0;
    while(Date.now()<deadline){
      if(await page.locator('[data-live-dice="true"]').count()){quiet=0;await page.waitForTimeout(300);continue;}
      const reveal=page.locator('.roll-reveal');
      if(await reveal.isVisible()){
        await expect(reveal).toHaveAttribute('data-impact-ready','true',{timeout:45000});
        await page.waitForTimeout(500);await page.keyboard.press('Escape');quiet=0;
      }else if(++quiet>=6)break;
      await page.waitForTimeout(250);
    }
    expect(Date.now()).toBeLessThan(deadline);
    evidence.push({chapter:current,state:await state()});
  };
  const cast=async(name:string)=>{
    const before=(await state()).rollLog.length;
    await click(combat.getByRole('button',{name:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first());
    await expect.poll(async()=>(await state()).rollLog.length,{timeout:120000}).toBeGreaterThan(before);
    await settle();
    const damage=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn');
    if(await damage.isVisible()){await click(damage);await settle();}
  };
  try{
    await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
    await expect(combat).toBeVisible();await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
    await expect(layer).toHaveAttribute('data-miniature-count','4',{timeout:60000});
    await page.getByLabel('Attack target',{exact:true}).selectOption(foe.id);
    // Zoom at the models, then pan empty map space to keep the effects readable.
    await page.mouse.move(870,620);
    for(let i=0;i<8;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(120);}
    await page.mouse.move(1120,790);await page.mouse.down();await page.mouse.move(1020,635,{steps:25});await page.mouse.up();
    await page.evaluate(()=>{
      const el=document.createElement('div');el.setAttribute('popover','manual');el.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;margin:0;border:0;background:transparent;pointer-events:none';
      el.innerHTML='<svg id="showcase-pointer" width="30" height="36" style="position:absolute;left:-50px"><path d="M3 2L3 28L10 21L16 34L21 31L15 20L26 20Z" fill="#fff5cd" stroke="#080b11" stroke-width="2"/></svg><div id="showcase-click" style="position:absolute;width:40px;height:40px;border:3px solid #ffe698;border-radius:50%;opacity:0"></div>';
      document.body.append(el);el.showPopover();document.addEventListener('mousemove',e=>{const p=document.getElementById('showcase-pointer')!;p.style.left=e.clientX+'px';p.style.top=e.clientY+'px';});
      document.addEventListener('pointerdown',e=>{const p=document.getElementById('showcase-click')!;p.style.left=e.clientX-22+'px';p.style.top=e.clientY-22+'px';p.animate([{opacity:1,transform:'scale(.6)'},{opacity:0,transform:'scale(1.4)'}],{duration:800});},true);
    });
    if(captureAv1){av1=await startAv1Capture(page,info.outputPath('capture-av1.mp4'));started=Date.now();}
    await chapter('Training setup','Disposable campaign. Vanec has the demonstration spell loadout; high attack bonus and save DC keep outcomes readable. Dice are real.');
    await page.waitForTimeout(1800);await page.screenshot({path:info.outputPath('poster.png')});
    for(const name of names){
      // Reset the practice targets between unrelated demonstrations, never a
      // campaign sheet. Concentration cleanup uses the normal condition handler.
      const before=await state();for(const c of before.characters.find(c=>c.id===caster.id)!.conditions)socket.emit('condition:clear',{kind:'pc',refId:caster.id,conditionId:c.id});
      for(const t of before.tokens.filter(t=>t.kind==='monster'))for(const c of before.monsters.find(m=>m.id===t.refId)!.conditions)socket.emit('condition:clear',{kind:'monster',refId:t.refId,conditionId:c.id});
      await state();await page.waitForTimeout(400);
      await chapter(name,`Combat → ${name}${['Hold Person','Hold Monster','Phantasmal Killer'].includes(name)?' → WIS save. The active spell stays visible until it ends.':'. Hit spells offer Roll damage; the map effect follows the completed dice.'}`);
      await cast(name);
      if(name==='Spiritual Weapon'){
        const live=await state(),weapon=live.tokens.find(t=>live.monsters.find(m=>m.id===t.refId)?.modelType==='spiritual-weapon')!;
        expect(weapon).toBeTruthy();await expect(layer).toHaveAttribute('data-miniature-count','5');
        await chapter('Spiritual Weapon: move its force','Summon creates a visible floating weapon. Drag its base; its attack measures 5-foot reach from the weapon, not the caster. Later combat turns allow up to 20 feet before attacking.');
        const points=await page.evaluate(id=>{
          const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));
          const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),r=s.container().getBoundingClientRect();
          const project=(local:any)=>{const p=n.getAbsoluteTransform().point(local),v=new DOMPoint(p.x-s.width()/2,p.y-s.height()/2).matrixTransform(new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform));return {x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};};
          return [project({x:0,y:0}),project({x:64,y:64})];
        },weapon.id);
        await page.mouse.move(points[0].x,points[0].y,{steps:15});await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:30});await page.waitForTimeout(600);await page.mouse.up();
        await expect.poll(async()=>(await state()).tokens.find(t=>t.id===weapon.id)?.x).not.toBe(weapon.x);
        await page.waitForTimeout(1300);await page.screenshot({path:info.outputPath('spiritual-weapon-summon.png')});
      }
      if(['Hold Person','Hold Monster','Phantasmal Killer'].includes(name)){
        await expect(layer).toHaveAttribute('data-spell-impact-kinds',new RegExp(name==='Phantasmal Killer'?'haunt':'chains'));
        await page.waitForTimeout(2500);await page.screenshot({path:info.outputPath(`${name.toLowerCase().replace(/ /g,'-')}-active.png`)});
        // Removing concentration is the same action as the caster's blue chip.
        await chapter(`${name}: end concentration`,'Stop concentrating. The linked condition and its glowing restraint disappear together.');
        const conc=(await state()).characters.find(c=>c.id===caster.id)!.conditions.find(c=>c.isConcentration)!;
        await click(page.getByRole('button',{name:`Concentration: ${name}. Edit conditions`,exact:true}));
        await click(page.locator('.cond-active li').filter({hasText:conc.label}).getByRole('button',{name:'×',exact:true}));
        await click(page.getByRole('dialog',{name:'Conditions',exact:true}).getByRole('button',{name:'Close',exact:true}));await state();
        await expect(layer).not.toHaveAttribute('data-spell-impact-kinds',/chains|haunt/,{timeout:5000});await page.waitForTimeout(1500);
      }
      const actions=combat.getByRole('region',{name:'Active spell actions'}),repeat=actions.getByRole('button',{name:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} ·`)});
      if(await repeat.isVisible()){
        await chapter(`${name}: repeat action`,'Combat → Active spell actions. Reuse the spell with its Magic or Bonus action; no additional slot is spent.');
        const slots=(await state()).characters.find(c=>c.id===caster.id)!.spellSlots;
        await click(repeat);await settle();
        const damage=page.locator('.damage-prompt:not(.spell-prompt) .damage-prompt-btn');if(await damage.isVisible()){await click(damage);await settle();}
        expect((await state()).characters.find(c=>c.id===caster.id)!.spellSlots).toEqual(slots);
      }
      if(name==='Vampiric Touch'){
        await expect(layer).toHaveAttribute('data-spell-impact-kinds',/aura/);await page.waitForTimeout(1500);
        await page.screenshot({path:info.outputPath('vampiric-touch-aura.png')});
      }
      if(['Ice Storm','Flame Strike','Meteor Swarm'].includes(name)){
        await chapter(`${name}: apply to targets`,'Spell prompt → Apply spell damage. Click each affected base once; each creature makes its own DEX saving throw.');
        await click(page.getByRole('button',{name:/Apply spell damage/}).first());
        for(const target of (await state()).tokens.filter(t=>t.kind==='monster')){
          const p=await page.evaluate(id=>{
            const stages=(window as any).Konva.stages,s=stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));
            const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();
            const v=new DOMPoint(p.x-s.width()/2,p.y-s.height()/2).matrixTransform(new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform));
            return {x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};
          },target.id);
          await page.mouse.move(p.x,p.y,{steps:20});await page.waitForTimeout(350);await page.mouse.click(p.x,p.y);await settle();
        }
        const done=page.locator('.spell-prompt').getByRole('button',{name:'Done',exact:true});if(await done.isVisible())await click(done);
      }
      if(name==='Mirror Image'){
        await chapter('Mirror Image: an enemy hits','An opposing practice attack triggers the duplicate check. A 3+ destroys one image instead of damaging Vanec.');
        const actor=(await state()).tokens.find(t=>t.refId===caster.id)!;
        let remaining=3;
        for(let attempt=0;attempt<4&&remaining===3;attempt++){
          const count=(await state()).rollLog.length;
          // Opponent action, viewed from the player window. Uses the normal
          // server combat handler and real dice, not a forced duplicate count.
          socket.emit('combat:attack',{attackerTokenId:foe.id,targetTokenId:actor.id,weaponIndex:0});
          await expect.poll(async()=>(await state()).rollLog.length,{timeout:60000}).toBeGreaterThan(count);
          await settle();
          remaining=(await state()).characters.find(c=>c.id===caster.id)!.conditions.find(c=>c.label==='Mirror Image')?.combatEffect?.duplicates??0;
        }
        expect(remaining).toBe(2);await expect(layer).toHaveAttribute('data-mirror-image-count','2');
        await page.screenshot({path:info.outputPath('mirror-image-after-attack.png')});await page.waitForTimeout(2000);
      }
      await page.waitForTimeout(1300);
    }
    expect(errors).toEqual([]);
  }finally{
    if(av1)writeFileSync(info.outputPath('capture.json'),JSON.stringify(await av1.stop(),null,2));
    const frameSamples=await page.evaluate(()=>(window as any).captureFrameSamples).catch(()=>[]);
    writeFileSync(info.outputPath('performance.json'),JSON.stringify({gpu:gpu.gpu,frameSamples},null,2));
    writeFileSync(info.outputPath('chapters.json'),JSON.stringify(chapters,null,2));writeFileSync(info.outputPath('evidence.json'),JSON.stringify({errors,evidence},null,2));
    await context.close();socket.disconnect();if(page.video())console.log('VIDEO',await page.video()!.path());
  }
});
