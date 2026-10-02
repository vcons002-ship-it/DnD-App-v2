import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';

test('3D skull replaces only confirmed-dead creatures, opens info and filters targets',async({page,browser,request},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Death marker visual test'}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  let dm:import('@playwright/test').Page|undefined;
  const state=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  try{
    const initial=await state(),vanec=initial.characters.find((c:any)=>c.name==='Vanec');
    socket.emit('character:update',{characterId:vanec.id,maxHp:20,curHp:20,weapons:[{name:'Staff',kind:'melee',damage:'1d6',attackBonus:5}]});
    const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Marker comparison',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
    socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
    socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:vanec.id,x:560,y:575});
    for(const [name,x] of [['Goblin defeated',710],['Goblin alive',870]] as const){
      socket.emit('monster:create',{name,modelType:'goblin',maxHp:20,curHp:20,armorClass:12,disposition:'enemy',creatureType:'Humanoid'});
      const m=(await state()).monsterTemplates.find((m:any)=>m.name===name);
      socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:m.id,x,y:540});
    }
    await state();await page.setViewportSize({width:1600,height:1000});await page.addInitScript(()=>localStorage.setItem('dnd.rollAnimOff','1'));
    await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Vanec'}).click();
    const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','3',{timeout:60000});
    await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
    await page.mouse.move(950,620);for(let i=0;i<8;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(120);}
    await page.mouse.move(1100,790);await page.mouse.down();await page.mouse.move(920,620,{steps:25});await page.mouse.up();
    const target=(await state()).monsters.find((m:any)=>m.name.startsWith('Goblin defeated'));
    const publicName=target.name.replace(/\s+\d+$/,'');
    const deadToken=(await state()).tokens.find((t:any)=>t.refId===target.id);
    socket.emit('damage:apply',{kind:'monster',refId:target.id,amount:20});await state();
    await expect(layer).toHaveAttribute('data-death-skull-count','1');await page.waitForTimeout(1400);
    const names=()=>page.evaluate(()=> (window as any).Konva.stages.flatMap((s:any)=>s.find('.token-label').map((n:any)=>n.text())));
    expect(await names()).not.toContain(publicName);
    const attack=page.getByLabel('Attack target',{exact:true}),show=page.getByRole('checkbox',{name:'Show Dead',exact:true});
    await expect(attack.locator(`option[value="${deadToken.id}"]`)).toHaveCount(0);
    await show.check();await expect(attack.locator(`option[value="${deadToken.id}"]`)).toHaveCount(1);
    await attack.selectOption(deadToken.id);await show.uncheck();await expect(attack).not.toHaveValue(deadToken.id);
    await page.screenshot({path:info.outputPath('skull-45.png'),clip:{x:450,y:180,width:850,height:640}});
    await page.getByRole('button',{name:'Flat battlefield view',exact:true}).click();await page.waitForTimeout(1400);
    await page.screenshot({path:info.outputPath('skull-overhead.png'),clip:{x:450,y:180,width:850,height:640}});
    const point=await page.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},deadToken.id);
    await page.mouse.click(point.x,point.y);await expect(page.getByRole('heading',{name:publicName,exact:true})).toBeVisible();
    socket.emit('damage:apply',{kind:'pc',refId:vanec.id,amount:20});await state();await page.waitForTimeout(600);
    await expect(layer).toHaveAttribute('data-death-skull-count','1');expect(await names()).toContain('Vanec');
    socket.emit('condition:set',{kind:'pc',refId:vanec.id,condition:{label:'Dead',aura:'red',isConcentration:false}});await state();
    await expect(layer).toHaveAttribute('data-death-skull-count','2');expect(await names()).not.toContain('Vanec');
    socket.emit('damage:apply',{kind:'monster',refId:target.id,amount:-20});await state();
    await expect(layer).toHaveAttribute('data-death-skull-count','1');await expect.poll(names).toContain(publicName);
    dm=await browser.newPage({viewport:{width:1600,height:1000}});
    await dm.goto(`/dm?code=${code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-death-skull-count','1',{timeout:60000});
    socket.emit('damage:apply',{kind:'monster',refId:target.id,amount:20});await state();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-death-skull-count','2');
    await dm.getByRole('button',{name:'Flat battlefield view',exact:true}).click();await dm.waitForTimeout(800);
    const dmPoint=await dm.evaluate(id=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id));const n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},deadToken.id);
    await dm.mouse.click(dmPoint.x,dmPoint.y);await expect(dm.getByRole('heading',{name:target.name,exact:true,level:3})).toBeVisible();expect(errors).toEqual([]);
  }finally{await dm?.close();socket.disconnect();}
});
