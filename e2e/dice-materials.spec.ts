import {test,expect} from '@playwright/test';

test('custom dice roller uses one selected character and preserves percentile pair results',async({page},info)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.goto('/dice-comparison.html');
 const tray=page.locator('#tray'),amount=page.getByRole('spinbutton',{name:'Number of dice'});
 await expect(tray).toHaveAttribute('data-state','settled',{timeout:30000});
 await page.getByLabel('Character',{exact:true}).selectOption('3');await amount.fill('8');
 await page.getByRole('button',{name:'d6',exact:true}).click();
 await expect(tray).toHaveAttribute('data-roller','DM');await expect(tray).toHaveAttribute('data-dice-count','8');
 await expect(page.locator('.result')).toHaveCount(1);await expect(page.locator('.name')).toHaveText('DM ? 8d6');
 await expect(tray).toHaveAttribute('data-state','settled',{timeout:40000});
 const values=(await page.locator('.individual').innerText()).split(' ? ').map(s=>Number(s.split(': ')[1]));
 expect(values).toHaveLength(8);expect(values.every(v=>v>=1&&v<=6)).toBe(true);
 await expect(page.locator('.value')).toHaveText(String(values.reduce((a,b)=>a+b,0)));
 await page.screenshot({path:info.outputPath('dm-custom-8d6.png')});
 await page.getByLabel('Character',{exact:true}).selectOption('2');await amount.fill('3');
 await page.getByRole('button',{name:'d100',exact:true}).click();
 await expect(tray).toHaveAttribute('data-roller','Vanec');await expect(tray).toHaveAttribute('data-dice-count','6');
 await expect(tray).toHaveAttribute('data-state','settled',{timeout:40000});
 const percentiles=(await page.locator('.individual').innerText()).split(' ? ').map(s=>Number(s.split(': ')[1]));
 expect(percentiles).toHaveLength(3);expect(percentiles.every(v=>v>=1&&v<=100)).toBe(true);
 await amount.fill('21');await page.getByRole('button',{name:'Roll dice',exact:true}).click();
 expect(await amount.evaluate((n:HTMLInputElement)=>n.validity.rangeOverflow)).toBe(true);
 await expect(tray).toHaveAttribute('data-state','settled');await expect(tray).toHaveAttribute('data-dice-count','6');
 await amount.fill('');await page.getByRole('button',{name:'Roll dice',exact:true}).click();
 expect(await amount.evaluate((n:HTMLInputElement)=>n.validity.valueMissing)).toBe(true);await expect(tray).toHaveAttribute('data-dice-count','6');
 expect(errors).toEqual([]);
});

test('mobile reviewer can switch character and roll a maximum pool',async({page},info)=>{
 test.setTimeout(90000);await page.setViewportSize({width:412,height:915});
 await page.goto('/dice-comparison.html');await expect(page.locator('#tray')).toHaveAttribute('data-state','settled',{timeout:30000});
 await page.getByLabel('Character',{exact:true}).selectOption('1');await page.getByLabel('Number of dice',{exact:true}).fill('40');
 await page.getByRole('button',{name:'d6',exact:true}).click();
 await expect(page.locator('#tray')).toHaveAttribute('data-dice-count','40');
 await expect(page.locator('#tray')).toHaveAttribute('data-state','settled',{timeout:60000});
 await expect(page.locator('.name')).toHaveText('Varis ? 40d6');
 expect((await page.locator('.individual').innerText()).split(' ? ')).toHaveLength(40);
 await page.screenshot({path:info.outputPath('varis-40d6-mobile.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
