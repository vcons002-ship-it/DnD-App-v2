import{test,expect}from'@playwright/test';import sharp from'sharp';

test('all added class dice use refractive resin with moving interiors and opaque number inlays',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1150,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/dice-comparison.html');await expect(page.locator('#tray')).toHaveAttribute('data-state','settled',{timeout:60000});
 await page.getByRole('button',{name:'3D inspector',exact:true}).click();const dialog=page.getByRole('dialog',{name:'3D dice inspector'}),view=dialog.locator('.inspector-view');
 await expect(dialog).toBeVisible({timeout:30000});await page.getByLabel('Inspector auto rotate').uncheck();await page.getByLabel('Inspector die',{exact:true}).selectOption('20');
 const material=async()=>JSON.parse(await view.getAttribute('data-resin')??'[]');
 const setResult=async(value:number)=>page.getByLabel('Inspector result').evaluate((e:HTMLInputElement,v)=>{e.value=String(v);e.dispatchEvent(new Event('input'));},value);
 for(const name of ['Barbarian','Bard','Cleric','Druid','Monk','Paladin','Rogue','Warlock','Wizard','Artificer']){
  await page.getByLabel('Inspector character',{exact:true}).selectOption({label:name});await setResult(15);
  await expect.poll(material).toEqual([{volume:'class',transmission:.96,opacity:1,metalness:0}]);
  await setResult(20);await expect.poll(async()=>JSON.parse(await view.getAttribute('data-power')??'[]')[0]?.maximum).toBe(true);
  if(name==='Paladin'||name==='Warlock')await page.screenshot({path:info.outputPath(name+'-resin.png')});
 }
 await page.getByLabel('Inspector character',{exact:true}).selectOption({label:'Warlock'});await page.getByLabel('Inspector die',{exact:true}).selectOption('20');await setResult(10);await page.waitForTimeout(800);
 const bounds=(await view.boundingBox())!,clip={x:Math.round(bounds.x+bounds.width/2-65),y:Math.round(bounds.y+bounds.height/2-65),width:130,height:130};
 const a=await sharp(await page.screenshot({clip})).removeAlpha().raw().toBuffer();await page.waitForTimeout(1200);const z=await sharp(await page.screenshot({clip})).removeAlpha().raw().toBuffer();
 let difference=0;for(let i=0;i<a.length;i++)difference+=Math.abs(a[i]-z[i]);expect(difference/a.length,'The interior keeps moving with a fixed die and camera').toBeGreaterThan(.15);
 for(const sides of ['4','6','8','10','12','20','100']){await page.getByLabel('Inspector die',{exact:true}).selectOption(sides);await expect.poll(async()=>(await material()).length).toBe(sides==='100'?2:1);expect((await material()).every((m:any)=>m.volume==='class'&&m.transmission>.9&&m.opacity===1&&m.metalness===0)).toBe(true);}
 await page.getByLabel('Inspector gold dice').check();await expect.poll(material).toEqual([null,null]);await page.getByLabel('Inspector gold dice').uncheck();
 await page.getByLabel('Inspector character',{exact:true}).selectOption({label:'DM'});await expect.poll(async()=>(await material())[0]?.volume).toBe('dm');
 expect(errors).toEqual([]);await page.getByRole('button',{name:'Close dice inspector'}).click();
});
