import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { DM_SECRET, PORT } from './playwright.config';

test('CR previews, cancels, saves and restores the original baseline after reload', async ({page,request},info)=>{
  const {code}=await (await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'CR scaling'}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  try {
    const snapshot=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});return r.snapshot;};
    await snapshot();
    socket.emit('monster:create',{name:'CR Sentinel',level:4,maxHp:60,armorClass:17,modelType:'human-guard',stats:{STR:16},weapons:[{name:'Blade',kind:'melee',damage:'2d6+3',attackBonus:5}]});
    await snapshot();
    await page.setViewportSize({width:1440,height:1000});
    let joined=false;
    const rejoin=async()=>{
      await page.goto(`/dm?code=${code}`);
      if(!joined){await page.locator('input[type=password]').fill(DM_SECRET);
      await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();joined=true;}
      await page.getByRole('button',{name:'Creatures',exact:true}).click();
      await page.getByRole('button',{name:'Edit',exact:true}).click();
    };
    await rejoin();
    const panel=page.locator('.statblock');
    await panel.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('combobox',{name:'CR',exact:true}).selectOption('5');
    await expect(panel.getByLabel('Max',{exact:true})).toHaveValue('67');
    await expect(panel.getByLabel('AC',{exact:true})).toHaveValue('18');
    await expect(panel.getByLabel('Max',{exact:true})).toBeDisabled();
    await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    expect((await snapshot()).monsterTemplates[0].level).toBe(4);
    await panel.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('combobox',{name:'CR',exact:true}).selectOption('5');
    await page.screenshot({path:info.outputPath('cr-preview.png')});
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await expect.poll(async()=>(await snapshot()).monsterTemplates[0].maxHp).toBe(67);
    await rejoin();
    await panel.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('combobox',{name:'CR',exact:true}).selectOption('4');
    await expect(panel.getByLabel('Max',{exact:true})).toHaveValue('60');
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await expect.poll(async()=>(await snapshot()).monsterTemplates[0].maxHp).toBe(60);
    expect((await snapshot()).monsterTemplates[0].weapons[0].damage).toBe('2d6+3');
  } finally {socket.disconnect();}
});
