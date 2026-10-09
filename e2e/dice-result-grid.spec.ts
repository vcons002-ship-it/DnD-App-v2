import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';

test('forty live dice result boxes fit desktop and phone screens without scrolling',async({page,request})=>{
 test.setTimeout(90000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Large result grid'}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 try{
  await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  dm.emit('dice:roll',{expr:'40d6',label:'Forty dice'});
  await expect(page.locator('.dice-tray-results .tray-die-result')).toHaveCount(40,{timeout:30000});
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await expect.poll(()=>page.evaluate(()=>{
    const grid=document.querySelector('.dice-tray-results') as HTMLElement;
    if(!grid)return false;
    const area=grid.getBoundingClientRect();
    return grid.scrollWidth<=grid.clientWidth+1&&grid.scrollHeight<=grid.clientHeight+1&&
     [...grid.querySelectorAll('.tray-die-result')].every(box=>{
      const r=box.getBoundingClientRect(),number=box.querySelector('strong')!.getBoundingClientRect();
      return r.left>=area.left-1&&r.right<=area.right+1&&r.top>=area.top-1&&r.bottom<=area.bottom+1&&
       number.top>=r.top-1&&number.bottom<=r.bottom+1&&r.bottom<=innerHeight&&r.right<=innerWidth;
     });
   })).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:test.info().outputPath('forty-dice-phone.png')});
  await expect(page.locator('.tray-die-result[data-filled=true]')).toHaveCount(40,{timeout:45000});
  await page.screenshot({path:test.info().outputPath('forty-dice-phone-settled.png')});
 }finally{dm.disconnect();}
});
