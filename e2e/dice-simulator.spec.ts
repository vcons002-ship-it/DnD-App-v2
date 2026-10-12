import {test,expect} from '@playwright/test';

test('published simulator rolls current character dice with live collision audio and mute controls',async({page},info)=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  (window as any).__diceAudioStarts=0;
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){
   (window as any).__diceAudioStarts++;return start.apply(this,args);
  };
 });
 await page.setViewportSize({width:1180,height:1000});
 await page.goto('/dice-comparison.html');
 const tray=page.locator('#tray'),canvas=tray.locator('canvas');
 await expect(tray).toHaveAttribute('data-state','settled',{timeout:45000});
 await page.getByLabel('Number of dice').fill('3');
 for(const [index,name,theme,sides] of [[0,'Druk','fighter',6],[1,'Varis','ranger',8],[2,'Vanec','sorcerer',20],[3,'DM','dm-neutral-roll',10]] as const){
  await page.getByLabel('Character',{exact:true}).selectOption(String(index));
  const before=await page.evaluate(()=>(window as any).__diceAudioStarts);
  await page.getByRole('button',{name:`d${sides}`,exact:true}).click();
  await expect(tray).toHaveAttribute('data-state','settled',{timeout:45000});
  await expect(tray).toHaveAttribute('data-roller',name);
  await expect(tray).toHaveAttribute('data-theme',theme);
  await expect(tray).toHaveAttribute('data-dice-count','3');
  expect(Number(await tray.getAttribute('data-sound-impacts'))).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).__diceAudioStarts)).toBeGreaterThan(before);
  const values=(await page.locator('.individual').innerText()).split(' | ').map(value=>Number(value.split(': ')[1]));
  expect(values.every(value=>value>=1&&value<=sides)).toBe(true);
  expect(Number(await page.locator('.value').innerText())).toBe(values.reduce((sum,value)=>sum+value,0));
  expect(JSON.parse((await canvas.getAttribute('data-roll-power'))!).every((p:any)=>p.known)).toBe(true);
  await page.screenshot({path:info.outputPath(`${name}-latest-dice.png`)});
 }
 await page.getByLabel('Dice sounds').uncheck();
 const silentBefore=await page.evaluate(()=>(window as any).__diceAudioStarts);
 await page.getByLabel('Number of dice').fill('2');
 await page.getByRole('button',{name:'d100',exact:true}).click();
 await expect(tray).toHaveAttribute('data-state','settled',{timeout:45000});
 await expect(tray).toHaveAttribute('data-dice-count','4');
 expect(await page.evaluate(()=>(window as any).__diceAudioStarts)).toBe(silentBefore);
 await page.getByLabel('Sound volume').evaluate((input:HTMLInputElement)=>{input.value='55';input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(await page.evaluate(()=>localStorage.getItem('dnd.sfxVolume'))).toBe('0.55');
 await page.setViewportSize({width:430,height:932});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByLabel('Dice sounds')).toBeVisible();
 await page.screenshot({path:info.outputPath('mobile-dice-roller.png')});
 expect(errors).toEqual([]);
});
