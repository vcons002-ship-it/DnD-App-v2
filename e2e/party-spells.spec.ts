import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import sharp from 'sharp';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
const sockets:Socket[]=[];
test.afterEach(()=>sockets.splice(0).forEach(s=>s.disconnect()));
async function setup(request:APIRequestContext,page:Page){
 const {code}=await (await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Party spell live controls'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(socket);
 const snapshot=async():Promise<StateSnapshot>=>{const result=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(result.ok).toBe(true);return result.snapshot;};
 const first=await snapshot(),caster=first.characters.find(c=>c.name==='Vanec')!,ally=first.characters.find(c=>c.name==='Varis')!;
 const catalog=(await (await request.get('/api/spells/all')).json()).results as SheetAbility[];
 const abilities=['Shield','Misty Step','Hypnotic Pattern','Pass without Trace','Command'].map(name=>({...catalog.find(a=>a.name===name)!,id:name,source:'srd' as const,sourceClass:'sorcerer' as const}));
 socket.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:6,maxHp:100,curHp:100,armorClass:16,conditions:[],stats:{CHA:30,INT:10,DEX:10,WIS:10,CON:10,STR:10},sheetAbilities:abilities,spellSlots:{L1:{max:4,used:0},L2:{max:4,used:0},L3:{max:4,used:0}}});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=600;const ctx=c.getContext('2d')!;ctx.fillStyle='#302a29';ctx.fillRect(0,0,1000,600);return c.toDataURL('image/png').split(',')[1];});
 const map=await (await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Spell arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
 socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:200,y:300});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:ally.id,x:200,y:400});
 socket.emit('monster:create',{name:'Test sentry',maxHp:100,curHp:100,armorClass:12,creatureType:'humanoid',disposition:'enemy',stats:{WIS:1,DEX:10,STR:10,CON:10},weapons:[{name:'Training sword',kind:'melee',damage:'1d6',attackBonus:14,damageType:'slashing'}]});
 const template=(await snapshot()).monsterTemplates.find(m=>m.name==='Test sentry')!;socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:550,y:300});socket.emit('session:setManualDamage',{manual:false});
 const ready=await snapshot(),actor=ready.tokens.find(t=>t.refId===caster.id)!,friend=ready.tokens.find(t=>t.refId===ally.id)!,enemy=ready.tokens.find(t=>t.kind==='monster')!;
 await page.addInitScript(()=>{localStorage.setItem('dnd.rollAnimOff','1');localStorage.setItem('dnd.playerMiniatures','false');});
 await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();await expect(page.getByRole('region',{name:'Combat panel',exact:true})).toBeVisible();
 const mapPoint=async(x:number,y:number)=>page.evaluate(({id,x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').length),shape=stage.find('.token-hit-region').find((s:any)=>s.getAttr('tokenId')===id),rect=stage.container().getBoundingClientRect();const pos=shape.getAbsoluteTransform().point({x,y});return {x:rect.left+pos.x,y:rect.top+pos.y};},{id:actor.id,x:x-actor.x,y:y-actor.y});
 const character=async(id=caster.id)=>(await snapshot()).characters.find(c=>c.id===id)!;
 return {socket,snapshot,character,caster,ally,map,actor,friend,enemy,mapPoint};
}
test('a successful Shield reaction displays Blocked! and dismisses automatically',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 // Raise the defender's base AC to just below an actual noncritical attack.
 // The real Shield reaction must then change that hit into a block.
 let hit:any;
 for(let i=0;i<8;i++){
  f.socket.emit('combat:attack',{attackerTokenId:f.enemy.id,targetTokenId:f.actor.id,weaponIndex:0});
  await expect.poll(async()=>(await f.snapshot()).rollLog.filter(r=>r.label==='Attack').length,{timeout:25000}).toBe(i+1);
  const s=await f.snapshot(),offer=s.shieldReactions?.[0];
  const attack=s.rollLog.find(r=>r.id===offer?.rollId);
  if(attack?.reveal?.d20!==20&&attack?.reveal?.attackTotal){hit=attack;break;}
  if(offer)f.socket.emit('spell:shield',{rollId:offer.rollId,pass:true});
 }
 expect(hit).toBeTruthy();
 f.socket.emit('character:update',{characterId:f.caster.id,armorClass:hit.reveal.attackTotal-2});await f.snapshot();
 const prompt=page.getByRole('region',{name:'Shield reaction'});await expect(prompt).toBeVisible({timeout:30000});
 await prompt.getByRole('button',{name:/^Shield.*L1$/}).click();
 const popup=page.locator('.shield-blocked-popup');await expect(popup).toHaveText('Blocked!');
 await expect(popup).toBeVisible();await expect(prompt).toHaveCount(0);
 await page.waitForTimeout(400);await page.screenshot({path:test.info().outputPath('shield-blocked-popup.png'),fullPage:true});
 expect((await f.snapshot()).rollLog.find(r=>r.id===hit.id)?.pending?.amount).toBe(0);
 await expect(popup).toHaveCount(0,{timeout:6000});
});

test('footprints remain visible above regular-darkness terrain and Pass without Trace suppresses them',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 f.socket.emit('map:setEnvironment',{mapId:f.map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:false,lightLevel:.7,sceneTintStrength:0,weather:'none',mist:false,lights:[]}});await f.snapshot();
 await page.getByRole('button',{name:'3D player tokens',exact:true}).click();
 const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-personal-miniature-count','2',{timeout:60000});
 await expect(layer).toHaveAttribute('data-ground-ready','true');await page.waitForTimeout(1000);
 const p=await f.mapPoint(325,300),clip={x:Math.round(p.x)-40,y:Math.round(p.y)-20,width:80,height:40};
 const pixels=async()=>sharp(await page.screenshot({clip})).removeAlpha().raw().toBuffer();
 const before=await pixels();f.socket.emit('token:move',{tokenId:f.actor.id,x:450,y:300});await f.snapshot();
 await expect.poll(async()=>Number(await layer.getAttribute('data-footprint-count'))).toBeGreaterThan(2);await page.waitForTimeout(1000);
 const after=await pixels();let brighter=0;for(let i=0;i<after.length;i+=3)if(after[i]>before[i]+30&&after[i+1]>before[i+1]+30)brighter++;
 expect(brighter).toBeGreaterThan(20);await page.screenshot({path:test.info().outputPath('visible-darkness-footprints.png')});
 await expect.poll(async()=>Number(await layer.getAttribute('data-footprint-count')),{timeout:15000}).toBe(0);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Pass without Trace/}).click();
 await page.getByRole('region',{name:'Place spell area'}).getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.character()).conditions.some(c=>c.combatEffect?.stealthBonus===10)).toBe(true);
 f.socket.emit('token:move',{tokenId:f.actor.id,x:200,y:300});await f.snapshot();await page.waitForTimeout(1000);
 await expect(layer).toHaveAttribute('data-footprint-count','0');
});

test('Misty Step and Pass without Trace use visible map controls and preserve spell-slot bookkeeping',async({page,request})=>{
 const f=await setup(request,page);
 const layer=page.getByTestId('miniature-layer');
 await page.getByRole('button',{name:'2D player tokens',exact:true}).click();
 await page.locator('.compact-player-combat').getByRole('button',{name:/Misty Step/}).click();
 const prompt=page.getByRole('region',{name:'Misty Step destination'});await expect(prompt).toBeVisible();await expect(prompt.getByRole('button',{name:'Teleport',exact:true})).toBeDisabled();
 let point=await f.mapPoint(350,300);await page.mouse.click(point.x,point.y);await expect(prompt.getByRole('button',{name:'Teleport',exact:true})).toBeEnabled();await prompt.getByRole('button',{name:'Teleport',exact:true}).click();
 await expect.poll(async()=>(await f.snapshot()).tokens.find(t=>t.id===f.actor.id)?.x).toBeCloseTo(350,0);expect((await f.character()).spellSlots.L2.used).toBe(1);
 await expect(layer).toHaveAttribute('data-spell-impact-kinds',/mist/);
 await page.screenshot({path:test.info().outputPath('misty-step-effect.png'),fullPage:true});
 await page.locator('.compact-player-combat').getByRole('button',{name:/Pass without Trace/}).click();
 const aura=page.getByRole('region',{name:'Place spell area'});await expect(aura).toContainText('Choose allies');await expect(aura).toContainText('Varis');await aura.getByRole('checkbox',{name:/Test sentry/}).uncheck();await aura.getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.character(f.ally.id)).conditions.some(c=>c.combatEffect?.stealthBonus===10)).toBe(true);expect((await f.character()).spellSlots.L2.used).toBe(2);
 await expect(layer).toHaveAttribute('data-spell-impact-kinds',/veil/);
 await page.waitForTimeout(2100);await expect(layer).toHaveAttribute('data-spell-impact-kinds','veil,veil');
 await expect(layer).toHaveAttribute('data-spell-light-strength','0');
 await page.screenshot({path:test.info().outputPath('pass-without-trace-effect.png'),fullPage:true});
 f.socket.emit('token:move',{tokenId:f.friend.id,x:950,y:500});await expect.poll(async()=>(await f.character(f.ally.id)).conditions.some(c=>c.combatEffect?.stealthBonus===10)).toBe(false);
 await expect(layer).toHaveAttribute('data-spell-impact-kinds','veil');
 const concentration=(await f.character()).conditions.find(c=>c.isConcentration)!;
 f.socket.emit('condition:clear',{kind:'pc',refId:f.caster.id,conditionId:concentration.id});await f.snapshot();
 await expect(layer).toHaveAttribute('data-spell-impact-count','0');
 await page.screenshot({path:test.info().outputPath('party-spells-controls.png'),fullPage:true});
});
test('a real attack offers Shield to its defender and grouped Hypnotic Pattern saves attach linked conditions',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 for(let i=0;i<3;i++){
  f.socket.emit('combat:attack',{attackerTokenId:f.enemy.id,targetTokenId:f.actor.id,weaponIndex:0});
  await expect.poll(async()=>(await f.snapshot()).rollLog.filter(e=>e.label==='Attack').length,{timeout:20000}).toBe(i+1);
  if((await f.snapshot()).shieldReactions?.length)break;
 }
 const prompt=page.getByRole('region',{name:'Shield reaction'});await expect(prompt).toBeVisible();await prompt.getByRole('button',{name:'Shield · L1',exact:true}).click();
 await expect.poll(async()=>(await f.character()).spellSlots.L1.used,{timeout:20000}).toBe(1);await expect(page.getByLabel('Armor Class 21',{exact:true})).toBeVisible();await expect(prompt).toHaveCount(0);
 const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-spell-impact-kinds',/shield/);
 await page.screenshot({path:test.info().outputPath('shield-effect.png'),fullPage:true});
 await page.locator('.compact-player-combat').getByRole('button',{name:/Hypnotic Pattern/}).click();const area=page.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();
 const point=await f.mapPoint(600,300);await page.mouse.click(point.x,point.y);await area.getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)?.conditions.some(c=>c.label==='Hypnotic Pattern'),{timeout:20000}).toBe(true);
 await expect(layer).toHaveAttribute('data-spell-impact-kinds',/pattern/);
 const conditions=(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)!.conditions;expect(conditions.map(c=>c.label)).toEqual(expect.arrayContaining(['Charmed','Incapacitated']));
 await page.screenshot({path:test.info().outputPath('hypnotic-pattern-live.png'),fullPage:true});
 await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect(layer).toHaveAttribute('data-tilt-degrees','45');
 await page.screenshot({path:test.info().outputPath('hypnotic-pattern-45.png'),fullPage:true});
});

test('Command offers the five words, spends once, and shows a next-turn instruction with DM-gated custom words',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 await page.getByLabel('Attack target',{exact:true}).selectOption(f.enemy.id);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Command/}).click();
 const choice=page.getByRole('dialog',{name:'Choose Command'});await expect(choice).toBeVisible();
 for(const word of ['Approach','Drop','Flee','Grovel','Halt'])await expect(choice.getByRole('button',{name:word,exact:true})).toBeVisible();
 await expect(choice.getByRole('button',{name:'Custom word',exact:true})).toHaveCount(0);
 await choice.getByRole('button',{name:'Halt',exact:true}).click();await page.screenshot({path:test.info().outputPath('command-choices.png'),fullPage:true});
 await choice.getByRole('button',{name:'Cast Command',exact:true}).click();
 await expect.poll(async()=>(await f.character()).spellSlots.L1.used,{timeout:20000}).toBe(1);
 await expect.poll(async()=>(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)?.conditions.some(c=>c.label==='Command: Halt')).toBe(true);
 const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-spell-impact-kinds',/command/);
 await page.screenshot({path:test.info().outputPath('command-effect.png'),fullPage:true});
 await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect(layer).toHaveAttribute('data-tilt-degrees','45');
 await page.screenshot({path:test.info().outputPath('command-effect-45.png'),fullPage:true});
 f.socket.emit('token:setHidden',{tokenId:f.enemy.id,hidden:true});await f.snapshot();await expect(layer).not.toHaveAttribute('data-spell-impact-kinds',/command/);
 f.socket.emit('token:setHidden',{tokenId:f.enemy.id,hidden:false});await f.snapshot();await expect(layer).toHaveAttribute('data-spell-impact-kinds',/command/);
 f.socket.emit('session:setCommandCustomWords',{enabled:true});await expect.poll(async()=>(await f.snapshot()).commandCustomWords).toBe(true);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Command/}).click();await choice.getByRole('button',{name:'Custom word',exact:true}).click();await choice.getByLabel('Custom Command word').fill('Dance away');await expect(choice.getByRole('button',{name:'Cast Command',exact:true})).toBeDisabled();await choice.getByLabel('Custom Command word').fill('Dance');await choice.getByRole('button',{name:'Cancel',exact:true}).click();expect((await f.character()).spellSlots.L1.used).toBe(1);
 // A real creature casting Command on the PC exercises the owner-facing reminder.
 f.socket.emit('ability:set',{kind:'monster',refId:f.enemy.refId,ability:{id:'command-npc',name:'Command',type:'spell',source:'srd',level:1,description:'Command',roll:{kind:'save',save:'WIS',saveDamage:'none',dc:30}}});
 f.socket.emit('initiative:set',{tokenId:f.enemy.id,initiative:20});f.socket.emit('initiative:set',{tokenId:f.actor.id,initiative:10});f.socket.emit('initiative:setRound',{round:1});f.socket.emit('initiative:next');
 await expect.poll(async()=>(await f.snapshot()).activeTurnTokenId).toBe(f.enemy.id);
 // Halt consumes this creature's turn; it cannot cast back until that turn ends.
 f.socket.emit('initiative:next');await expect.poll(async()=>(await f.snapshot()).activeTurnTokenId).toBe(f.actor.id);
 f.socket.emit('initiative:next');await expect.poll(async()=>(await f.snapshot()).activeTurnTokenId).toBe(f.enemy.id);
 f.socket.emit('ability:roll',{kind:'monster',refId:f.enemy.refId,abilityId:'command-npc',commandWord:'Grovel',targetTokenId:f.actor.id});
 await expect.poll(async()=>(await f.character()).conditions.some(c=>c.label==='Command: Grovel'),{timeout:20000}).toBe(true);
 f.socket.emit('initiative:next');await expect.poll(async()=>(await f.snapshot()).activeTurnTokenId).toBe(f.actor.id);
 const reminder=page.getByRole('region',{name:'Command turn reminder'});await expect(reminder).toContainText('Grovel');await expect(reminder).toContainText('Prone');await page.screenshot({path:test.info().outputPath('command-next-turn.png'),fullPage:true});await reminder.getByRole('button',{name:'Mark command resolved'}).click();await expect(reminder).toHaveCount(0);
 f.socket.emit('initiative:next');await expect.poll(async()=>(await f.character()).conditions.some(c=>c.combatEffect?.spell==='Command')).toBe(false);expect((await f.character()).conditions.some(c=>c.label==='Prone')).toBe(true);
 await expect(layer).not.toHaveAttribute('data-spell-impact-kinds',/command/);
});
