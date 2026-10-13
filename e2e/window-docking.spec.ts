import {expect,test,type Page,type APIRequestContext,type Locator} from '@playwright/test';
import {DM_SECRET,PORT} from './playwright.config';

async function session(request:APIRequestContext){
  const response=await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Window docking'}});
  expect(response.ok()).toBe(true);return (await response.json()).code as string;
}
async function player(page:Page,code:string){
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
}
async function drag(page:Page,header:Locator,x:number,release=true){
  const box=(await header.boundingBox())!;
  await page.mouse.move(box.x+40,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(x,box.y+box.height/2,{steps:8});
  await expect(page.locator('.window-dock-preview')).toHaveAttribute('data-dock-side',x<(await page.evaluate(()=>innerWidth))/2?'left':'right');
  if(release)await page.mouse.up();
}

test('DM windows dock with their pinned column, preserve drafts and widths, and restore sides',async({page,request},info)=>{
  await page.setViewportSize({width:1440,height:1000});const code=await session(request);
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  const maps=page.getByRole('complementary',{name:'Maps',exact:true});
  const header=maps.getByRole('group',{name:'Move Maps window',exact:true});
  await expect(maps).toBeVisible();await maps.getByPlaceholder('Map name (optional)').fill('Keep my map draft');
  await maps.getByRole('button',{name:'Resize DM panel',exact:true}).press('ArrowRight');
  const width=(await maps.boundingBox())!.width;
  await drag(page,header,1200);
  await expect(maps).toHaveAttribute('data-dock-side','right');
  expect((await maps.boundingBox())!.x).toBeCloseTo(1440-width-14,0);
  expect((await maps.boundingBox())!.width).toBe(width);
  await expect(maps.getByPlaceholder('Map name (optional)')).toHaveValue('Keep my map draft');
  await maps.getByRole('button',{name:'Pin Maps',exact:true}).click();
  await expect(page.locator('.window-dock-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'Creatures',exact:true}).click();
  const creatures=page.getByRole('complementary',{name:'Creatures',exact:true});
  await expect(creatures).toHaveAttribute('data-dock-side','right');
  await creatures.getByRole('button',{name:'Pin Creatures',exact:true}).click();
  await drag(page,header,180);
  await expect(maps).toHaveAttribute('data-dock-side','left');await expect(creatures).toHaveAttribute('data-dock-side','left');
  const a=(await maps.boundingBox())!,b=(await creatures.boundingBox())!;
  expect(a.x).toBe(14);expect(b.x).toBe(a.x);expect(b.y).toBeCloseTo(a.y+a.height+8,0);
  await drag(page,header,1200,false);await page.keyboard.press('Escape');await page.mouse.up();
  await expect(maps).toBeVisible();await expect(maps).toHaveAttribute('data-dock-side','left');
  await expect(page.locator('[data-dock-dragging]')).toHaveCount(0);
  await header.focus();await header.press('ArrowRight');
  await expect(creatures).toHaveAttribute('data-dock-side','right');
  await page.screenshot({path:info.outputPath('dm-docked-right.png')});
  await page.reload();await expect(maps).toBeVisible();await expect(creatures).toBeVisible();
  await expect(maps).toHaveAttribute('data-dock-side','right');expect((await maps.boundingBox())!.width).toBe(width);
  await page.setViewportSize({width:430,height:932});
  expect((await maps.boundingBox())!.x).toBe(8);expect((await maps.boundingBox())!.width).toBe(414);
});

test('player combat and chat dock independently with mirrored resizing and persisted choices',async({page,request},info)=>{
  await page.setViewportSize({width:1366,height:900});await player(page,await session(request));
  const combat=page.locator('.player-combat'),chat=page.locator('.player-chat');
  const original=(await combat.boundingBox())!;
  const header=combat.getByRole('group',{name:'Move Combat window',exact:true});
  await drag(page,header,160);await expect(combat).toHaveAttribute('data-dock-side','left');
  expect((await combat.boundingBox())!.x).toBeCloseTo(60*.85,0);
  expect((await combat.boundingBox())!.width).toBe(original.width);
  await page.getByRole('button',{name:'Resize combat panel',exact:true}).press('ArrowRight');
  expect((await combat.boundingBox())!.width-original.width).toBeCloseTo(10*.85,0);
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();
  await drag(page,chat.getByRole('group',{name:'Move Chat and roll log window',exact:true}),180);
  await expect(chat).toHaveAttribute('data-dock-side','left');
  // The mirrored resize corner must leave the collapse button clickable.
  await chat.getByRole('button',{name:'Collapse chat and roll log',exact:true}).click();
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();
  expect((await page.getByTestId('player-hud').boundingBox())!.x).toBeGreaterThan(700);
  await page.screenshot({path:info.outputPath('player-docked-left.png')});
  await header.focus();await header.press('ArrowRight');await expect(combat).toHaveAttribute('data-dock-side','right');
  await page.reload();await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(combat).toHaveAttribute('data-dock-side','right');await expect(chat).toHaveAttribute('data-dock-side','left');
  await page.getByRole('button',{name:'Interface settings',exact:true}).click();
  await page.getByRole('combobox',{name:'Combat window side',exact:true}).selectOption('left');
  await expect(combat).toHaveAttribute('data-dock-side','left');
  await page.getByRole('button',{name:'Reset interface layout',exact:true}).click();
  await expect(combat).toHaveAttribute('data-dock-side','right');await expect(chat).toHaveAttribute('data-dock-side','right');
});

test('touch can dock a player window without panning the page',async({browser,request})=>{
  const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,hasTouch:true,viewport:{width:430,height:932}});
  try{
    const page=await context.newPage();await player(page,await session(request));
    const combat=page.locator('.player-combat'),header=combat.getByRole('group',{name:'Move Combat window',exact:true});
    const box=(await header.boundingBox())!,x=box.x+40,y=box.y+box.height/2;
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(80-x)*step/6,y}]});
    await expect(page.locator('.window-dock-preview')).toHaveAttribute('data-dock-side','left');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(combat).toHaveAttribute('data-dock-side','left');
    const moved=(await combat.boundingBox())!;expect(moved.x).toBeGreaterThanOrEqual(0);expect(moved.x+moved.width).toBeLessThanOrEqual(430);
    expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});
    await expect(page.locator('.window-dock-preview')).toHaveCount(0);
  }finally{await context.close();}
});
