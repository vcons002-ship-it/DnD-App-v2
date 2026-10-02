import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';

test.skip(process.env.DND_DEATH_PREVIEW!=='1','Opt-in screenshot of the existing defeated-token appearance');
test('current 3D death marker in both camera views',async({page,request},info)=>{
  test.setTimeout(120000);
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Death marker visual test'}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  try{
    const initial=await state(),vanec=initial.characters.find((c:any)=>c.name==='Vanec');
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
    socket.emit('damage:apply',{kind:'monster',refId:target.id,amount:20});await state();await page.waitForTimeout(2500);
    await page.screenshot({path:info.outputPath('current-marker-45.png'),clip:{x:450,y:180,width:850,height:640}});
    await page.getByRole('button',{name:'Flat battlefield view',exact:true}).click();await page.waitForTimeout(1400);
    await page.screenshot({path:info.outputPath('current-marker-overhead.png'),clip:{x:450,y:180,width:850,height:640}});
  }finally{socket.disconnect();}
});
