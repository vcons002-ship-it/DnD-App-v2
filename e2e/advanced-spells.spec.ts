import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
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
 const abilities=['Invisibility','Spike Growth','Counterspell','Fire Bolt'].map(name=>({...catalog.find(a=>a.name===name)!,id:name,source:'srd' as const,sourceClass:'sorcerer' as const}));
 socket.emit('character:update',{characterId:caster.id,className:'Sorcerer',level:6,maxHp:100,curHp:100,armorClass:16,conditions:[],stats:{CHA:30,INT:10,DEX:10,WIS:10,CON:10,STR:10},sheetAbilities:abilities,spellSlots:{L1:{max:4,used:0},L2:{max:4,used:0},L3:{max:4,used:0}}});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=600;const ctx=c.getContext('2d')!;ctx.fillStyle='#302a29';ctx.fillRect(0,0,1000,600);return c.toDataURL('image/png').split(',')[1];});
 const map=await (await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Spell arena',image:{name:'arena.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
 socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:caster.id,x:200,y:300});socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:ally.id,x:200,y:400});
 socket.emit('monster:create',{name:'Test sentry',maxHp:100,curHp:100,armorClass:12,creatureType:'humanoid',disposition:'enemy',stats:{WIS:1,DEX:10,STR:10,CON:1,INT:18},weapons:[{name:'Training sword',kind:'melee',damage:'1d6',attackBonus:14,damageType:'slashing'}]});
 const template=(await snapshot()).monsterTemplates.find(m=>m.name==='Test sentry')!;socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:550,y:300});socket.emit('session:setManualDamage',{manual:false});
 const ready=await snapshot(),actor=ready.tokens.find(t=>t.refId===caster.id)!,friend=ready.tokens.find(t=>t.refId===ally.id)!,enemy=ready.tokens.find(t=>t.kind==='monster')!;
 await page.addInitScript(()=>{localStorage.setItem('dnd.rollAnimOff','1');localStorage.setItem('dnd.playerMiniatures','false');});
 await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();await expect(page.getByRole('region',{name:'Combat panel',exact:true})).toBeVisible();
 const mapPoint=async(x:number,y:number)=>page.evaluate(({id,x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token-hit-region').length),shape=stage.find('.token-hit-region').find((s:any)=>s.getAttr('tokenId')===id),rect=stage.container().getBoundingClientRect();const pos=shape.getAbsoluteTransform().point({x,y});return {x:rect.left+pos.x,y:rect.top+pos.y};},{id:actor.id,x:x-actor.x,y:y-actor.y});
 const character=async(id=caster.id)=>(await snapshot()).characters.find(c=>c.id===id)!;
 return {socket,snapshot,character,caster,ally,map,actor,friend,enemy,mapPoint,catalog};
}

test('Invisibility has a touch-target chooser and a translucent 3D party figure',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 await page.getByRole('button',{name:'3D player tokens',exact:true}).click();
 const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-personal-miniature-count','2',{timeout:60000});
 await page.locator('.compact-player-combat').getByRole('button',{name:/Invisibility/}).click();
 const chooser=page.getByRole('region',{name:'Invisibility targets'});await expect(chooser).toContainText('Vanec');
 await chooser.getByRole('button',{name:'Cast Invisibility',exact:true}).click();
 await expect.poll(async()=>(await f.character()).conditions.some(c=>c.label==='Invisible')).toBe(true);
 await expect(layer).toHaveAttribute('data-invisible-miniature-count','1');expect((await f.character()).spellSlots.L2.used).toBe(1);
 await page.screenshot({path:test.info().outputPath('invisibility-3d-ghost.png'),fullPage:true});
 await page.locator('.compact-player-combat').getByRole('button',{name:/Fire Bolt/}).click();
 await expect.poll(async()=>(await f.character()).conditions.some(c=>c.label==='Invisible'),{timeout:45000}).toBe(false);
 await expect(layer).toHaveAttribute('data-invisible-miniature-count','0');
});

test('Spike Growth places a persistent area and rolls damage after travel through it',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Spike Growth/}).click();
 const dock=page.getByRole('region',{name:'Place spell area'});await expect(dock).toBeVisible();
 const point=await f.mapPoint(600,300);await page.mouse.click(point.x,point.y);
 await dock.getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.snapshot()).measurements.some(m=>m.spellName==='Spike Growth')).toBe(true);
 expect((await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)?.curHp).toBe(100);
 f.socket.emit('token:move',{tokenId:f.enemy.id,x:600,y:300});
 await expect.poll(async()=>(await f.snapshot()).rollLog.some(r=>r.label==='Spike Growth damage'),{timeout:60000}).toBe(true);
 const s=await f.snapshot();expect(s.monsters.find(m=>m.id===f.enemy.refId)!.curHp).toBeLessThan(100);
 await page.screenshot({path:test.info().outputPath('spike-growth-movement-damage.png'),fullPage:true});
 const concentration=(await f.character()).conditions.find(c=>c.isConcentration)!;f.socket.emit('condition:clear',{kind:'pc',refId:f.caster.id,conditionId:concentration.id});
 await expect.poll(async()=>(await f.snapshot()).measurements.some(m=>m.spellName==='Spike Growth')).toBe(false);
});

test('an enemy cast offers Counterspell before damage and rolls a labeled CON save',async({page,request})=>{
 test.setTimeout(120000);const f=await setup(request,page);
 const foe=(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)!;
 f.socket.emit('monster:update',{monsterId:foe.id,sheetAbilities:[{...f.catalog.find(a=>a.name==='Fire Bolt')!,id:'enemy-firebolt',source:'srd'}]});await f.snapshot();
 f.socket.emit('ability:roll',{kind:'monster',refId:foe.id,abilityId:'enemy-firebolt',targetTokenId:f.actor.id});
 const prompt=page.getByRole('region',{name:'Counterspell reaction'});await expect(prompt).toBeVisible({timeout:15000});await expect(prompt).toContainText('Fire Bolt');
 expect((await f.character()).curHp).toBe(100);await page.screenshot({path:test.info().outputPath('counterspell-reaction.png'),fullPage:true});
 await prompt.getByRole('button',{name:/Counterspell.*L3/}).click();
 await expect.poll(async()=>(await f.snapshot()).rollLog.some(r=>r.label==='Counterspell'),{timeout:60000}).toBe(true);
 const s=await f.snapshot(),roll=s.rollLog.find(r=>r.label==='Counterspell')!;
 expect(roll.reveal?.title).toBe('Counterspell — CON Saving Throw');expect(roll.reveal?.effectOutcome).toContain('countered');expect((await f.character()).curHp).toBe(100);expect((await f.character()).spellSlots.L3.used).toBe(1);
 await expect(prompt).toHaveCount(0);await page.screenshot({path:test.info().outputPath('counterspell-result.png'),fullPage:true});
});
