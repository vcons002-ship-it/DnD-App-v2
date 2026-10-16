import {test,expect}from'@playwright/test';import{io}from'socket.io-client';import fs from'node:fs';import{DM_SECRET,PORT}from'./playwright.config';
test('grouped saves render the saving player class dice alongside purple creature dice',async({page,request:req},info)=>{test.setTimeout(120000);
const base=`http://localhost:${PORT}`,secret=DM_SECRET;
const {code}=await(await req.post(base+'/api/sessions',{headers:{'x-dm-passphrase':secret},data:{name:'Mixed player dice art saves'}})).json();
const dm=io(base,{transports:['websocket']}),sockets=[dm];const snap=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:secret})).snapshot;
try{let s=await snap();const [druk,varis,vanec]=['Druk','Varis','Vanec'].map(n=>s.characters.find(c=>c.name===n));
const catalog=(await(await req.get(base+'/api/spells/all')).json()).results,spell={...catalog.find(a=>a.name==='Fireball'),id:'group-fireball'};
for(const c of [druk,varis,vanec])dm.emit('character:update',{characterId:c.id,className:c.id===druk.id?'Fighter':c.id===varis.id?'Ranger':'Sorcerer',maxHp:200,curHp:200,level:5,stats:{STR:14,DEX:14,CON:14,INT:18,WIS:14,CHA:18},...(c.id===vanec.id?{sheetAbilities:[spell],spellSlots:{L3:{max:5,used:0}}}:{})});
for(const c of [druk,varis]){const p=io(base,{transports:['websocket'],forceNew:true});sockets.push(p);await p.timeout(10000).emitWithAck('join',{sessionCode:code,role:'player',name:c.name});p.emit('character:claim',{characterId:c.id});await p.timeout(10000).emitWithAck('join',{sessionCode:code,role:'player'});}
const map=await(await req.post(base+`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':secret},multipart:{name:'Mixed-save courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:fs.readFileSync('assets/environment-preview/courtyard.png')}}})).json();
dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
for(const [c,x,y]of [[druk,700,500],[varis,800,500],[vanec,420,700]])dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x,y});
dm.emit('monster:create',{name:'Goblin',modelType:'goblin',disposition:'enemy',maxHp:200,armorClass:13,stats:{STR:10,DEX:14,CON:14,INT:8,WIS:10,CHA:8}});s=await snap();const template=s.monsterTemplates.find(m=>m.name==='Goblin');dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:750,y:600});await snap();
await page.goto(base+'/dm?code='+code);await page.locator('input[type=password]').fill(secret);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await expect(page.getByLabel('Battlefield visibility')).toBeVisible();
dm.emit('session:setHideDmRolls',{hide:false});await snap();
const frames:any[]=[];dm.on('dice:frame',f=>frames.push(f));
dm.emit('ability:roll',{kind:'pc',refId:vanec.id,abilityId:spell.id,castLevel:3,area:{mapId:map.id,points:[{x:750,y:550}],angle:0}});
await expect.poll(()=>frames.some(f=>f.saveDice?.length>=3),{timeout:90000}).toBe(true);
await expect(page.locator('.tray-die-result').first()).toHaveAttribute('data-theme','fighter');
await expect.poll(()=>frames.at(-1)?.done&&frames.at(-1)?.saveDice?.length===3,{timeout:60000}).toBe(true);
await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-status','settled',{timeout:60000});await expect(page.locator('.tray-save-outcome[data-bonus-phase=complete]')).toHaveCount(3,{timeout:10000});await page.screenshot({path:info.outputPath('mixed-save.png')});
const arts=await page.locator('.tray-die-result').evaluateAll(es=>es.map(e=>({theme:e.getAttribute('data-theme'),text:e.textContent})));expect(arts.every(a=>/PASS|FAIL/.test(a.text??''))).toBe(true);expect(arts.map(a=>a.theme).sort()).toEqual(['fighter','ranger','dm-neutral-roll'].sort());
expect(frames.find(f=>f.saveDice?.length>=3).diceArt).toEqual([{className:'Fighter',dmDice:false},{className:'Ranger',dmDice:false},{className:'',dmDice:true}]);
}finally{for(const socket of sockets)socket.disconnect();}
});
