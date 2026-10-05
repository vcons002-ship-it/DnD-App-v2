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
 const abilities=['Shield','Misty Step','Hypnotic Pattern','Pass without Trace'].map(name=>({...catalog.find(a=>a.name===name)!,id:name,source:'srd' as const,sourceClass:'sorcerer' as const}));
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
test('Misty Step and Pass without Trace use visible map controls and preserve spell-slot bookkeeping',async({page,request})=>{
 const f=await setup(request,page);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Misty Step/}).click();
 const prompt=page.getByRole('region',{name:'Misty Step destination'});await expect(prompt).toBeVisible();await expect(prompt.getByRole('button',{name:'Teleport',exact:true})).toBeDisabled();
 let point=await f.mapPoint(350,300);await page.mouse.click(point.x,point.y);await expect(prompt.getByRole('button',{name:'Teleport',exact:true})).toBeEnabled();await prompt.getByRole('button',{name:'Teleport',exact:true}).click();
 await expect.poll(async()=>(await f.snapshot()).tokens.find(t=>t.id===f.actor.id)?.x).toBeCloseTo(350,0);expect((await f.character()).spellSlots.L2.used).toBe(1);
 await page.locator('.compact-player-combat').getByRole('button',{name:/Pass without Trace/}).click();
 const aura=page.getByRole('region',{name:'Place spell area'});await expect(aura).toContainText('Choose allies');await expect(aura).toContainText('Varis');await aura.getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.character(f.ally.id)).conditions.some(c=>c.combatEffect?.stealthBonus===10)).toBe(true);expect((await f.character()).spellSlots.L2.used).toBe(2);
 f.socket.emit('token:move',{tokenId:f.friend.id,x:950,y:500});await expect.poll(async()=>(await f.character(f.ally.id)).conditions.some(c=>c.combatEffect?.stealthBonus===10)).toBe(false);
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
 await page.locator('.compact-player-combat').getByRole('button',{name:/Hypnotic Pattern/}).click();const area=page.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();
 const point=await f.mapPoint(600,300);await page.mouse.click(point.x,point.y);await area.getByRole('button',{name:/Confirm area/}).click();
 await expect.poll(async()=>(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)?.conditions.some(c=>c.label==='Hypnotic Pattern'),{timeout:20000}).toBe(true);
 const conditions=(await f.snapshot()).monsters.find(m=>m.id===f.enemy.refId)!.conditions;expect(conditions.map(c=>c.label)).toEqual(expect.arrayContaining(['Charmed','Incapacitated']));
 await page.screenshot({path:test.info().outputPath('hypnotic-pattern-live.png'),fullPage:true});
});
