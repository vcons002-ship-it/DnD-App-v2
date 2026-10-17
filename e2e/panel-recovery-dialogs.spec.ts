import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
const sockets:Socket[]=[];
test.beforeEach(({page})=>page.setDefaultTimeout(12000));
test.afterEach(()=>sockets.splice(0).forEach(s=>s.disconnect()));
async function setup(page:Page,request:APIRequestContext){
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Panel recovery and prompts'}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});sockets.push(socket);
  const snapshot=async()=>{const result=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(result.ok).toBe(true);return result.snapshot;};
  const initial=await snapshot();
  const image=await sharp({create:{width:1000,height:600,channels:3,background:'#635b4c'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Recovery arena',image:{name:'board.png',mimeType:'image/png',buffer:image}}})).json();
  socket.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});await snapshot();
  await page.addInitScript(()=>{
    const id=localStorage.getItem('dnd.playerId')??crypto.randomUUID();localStorage.setItem('dnd.playerId',id);
    localStorage.setItem(`dnd.tokenView:${id}`,'2d');localStorage.setItem(`dnd.monsterTokenView:${id}`,'2d');localStorage.setItem('dnd.rollAnimOff','1');
  });
  page.on('dialog',()=>{throw new Error('Unexpected browser dialog');});
  return {code,map,socket,snapshot,initial};
}
async function dm(page:Page,code:string){await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();}
async function player(page:Page,code:string){await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();await expect(page.getByTestId('player-hud')).toBeVisible();}

test('crowded player panels fit their shared space and retain preferred dimensions',async({page,request},info)=>{
  const f=await setup(page,request);await page.setViewportSize({width:1400,height:1500});await player(page,f.code);
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();
  await page.getByRole('button',{name:'Interface settings',exact:true}).click();
  await page.getByRole('slider',{name:'UI scale'}).fill('100');
  for(const [label,value] of [['Combat height','600'],['Chat / roll log height','550']]){
    const input=page.getByRole('spinbutton',{name:label,exact:true});await input.fill(value);await input.press('Enter');
  }
  await page.getByRole('button',{name:'Close interface settings',exact:true}).click();
  const combat=page.locator('.player-combat'),chat=page.locator('.player-chat');
  expect((await combat.boundingBox())!.height).toBe(600);expect((await chat.boundingBox())!.height).toBe(550);
  await page.setViewportSize({width:1200,height:700});
  await expect.poll(async()=>{const c=(await combat.boundingBox())!,h=(await chat.boundingBox())!;return c.y+c.height+6<=h.y;}).toBe(true);
  const preferences=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dnd:player-layout:v1')!));
  expect((await preferences()).combat.height).toBe(600);expect((await preferences()).chat.height).toBe(550);
  await page.screenshot({path:info.outputPath('panels-fit.png')});
  // Opposite docks also share height on a phone if their widths overlap.
  await page.getByRole('group',{name:'Move Combat window',exact:true}).press('ArrowLeft');await page.setViewportSize({width:430,height:932});
  await expect.poll(async()=>{const c=(await combat.boundingBox())!,h=(await chat.boundingBox())!;return c.y+c.height+6<=h.y;}).toBe(true);
  await page.getByRole('button',{name:'Collapse chat and roll log',exact:true}).click();const taller=(await combat.boundingBox())!.height;
  await page.getByRole('button',{name:'Open chat and roll log',exact:true}).click();expect((await combat.boundingBox())!.height).toBeLessThan(taller);
  await page.setViewportSize({width:1400,height:1500});expect((await combat.boundingBox())!.height).toBe(600);expect((await chat.boundingBox())!.height).toBe(550);
});

test('DM closes only unpinned windows and resets saved layout without losing map drafts',async({page,request})=>{
  const f=await setup(page,request);await page.setViewportSize({width:1440,height:1000});await dm(page,f.code);
  await page.getByRole('button',{name:'Maps',exact:true}).click();const maps=page.locator('#dm-panel-maps');
  await maps.getByPlaceholder('Map name (optional)').fill('Unfinished map draft');
  await maps.getByRole('button',{name:'Pin Maps',exact:true}).click();
  await maps.getByRole('group',{name:'Move Maps window',exact:true}).press('ArrowRight');
  await maps.getByRole('button',{name:'Resize DM panel',exact:true}).press('ArrowLeft');
  await page.getByRole('button',{name:'Creatures',exact:true}).click();
  await page.locator('.dm-campaign-menu > summary').click();await page.getByRole('button',{name:'Close unpinned windows',exact:true}).click();
  await expect(maps).toBeVisible();await expect(page.locator('#dm-panel-spawn')).toBeHidden();
  await expect(page.getByRole('button',{name:'Close unpinned windows',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Reset window layout',exact:true}).click();
  await expect(maps).toBeHidden();
  const saved=await page.evaluate(code=>JSON.parse(localStorage.getItem(`dnd.dmPinnedPanels:${code}`)!),f.code);
  expect(saved.pinned).toEqual([]);expect(saved.sides).toEqual({});
  await page.locator('.dm-campaign-menu > summary').click();await page.getByRole('button',{name:'Maps',exact:true}).click();
  await expect(maps).toHaveAttribute('data-dock-side','left');expect((await maps.boundingBox())!.width).toBe(360);
  await expect(maps.getByPlaceholder('Map name (optional)')).toHaveValue('Unfinished map draft');
  await page.reload();await page.getByRole('button',{name:'Maps',exact:true}).click();await expect(maps.getByRole('button',{name:'Pin Maps',exact:true})).toBeVisible();
});

test('themed deletion can be canceled by Escape or confirmed and restores keyboard focus',async({page,request},info)=>{
  const f=await setup(page,request);await page.setViewportSize({width:1440,height:1000});await dm(page,f.code);
  await page.getByRole('button',{name:'Maps',exact:true}).click();
  const remove=page.getByTitle('Delete this map (removes its tokens)',{exact:true});await remove.click();
  const prompt=page.getByRole('dialog',{name:'Delete map?',exact:true});await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await prompt.press('Escape');await expect(prompt).toHaveCount(0);await expect(remove).toBeFocused();
  expect((await f.snapshot()).maps).toHaveLength(1);await expect(page.locator('#dm-panel-maps')).toBeVisible();
  await remove.click();await page.screenshot({path:info.outputPath('delete-map-prompt.png')});
  await prompt.getByRole('button',{name:'Delete map',exact:true}).click();await expect.poll(async()=>(await f.snapshot()).maps.length).toBe(0);
});

test('map label entry and unsupported images use themed prompts on mobile',async({page,request})=>{
  const f=await setup(page,request);await page.setViewportSize({width:430,height:932});await dm(page,f.code);
  await page.getByRole('button',{name:'Annotate',exact:true}).click();
  await page.getByRole('group',{name:'Annotation color'}).getByRole('button',{name:'Blue',exact:true}).click();
  await page.getByTitle('Text label — click the map to place text',{exact:true}).click();
  const canvas=(await page.locator('.konvajs-content').first().boundingBox())!;
  await page.mouse.click(canvas.x+canvas.width*.55,canvas.y+canvas.height*.65);
  const label=page.getByRole('dialog',{name:'Add map label',exact:true});await expect(label).toBeVisible();
  await label.getByRole('textbox',{name:'Label text',exact:true}).fill('Watch the doorway');await label.getByRole('textbox').press('Enter');
  await expect.poll(async()=>(await f.snapshot()).annotations.some((a:any)=>a.text==='Watch the doorway')).toBe(true);
  expect((await f.snapshot()).annotations.find((a:any)=>a.text==='Watch the doorway').color).toBe('#4cc9f0');
  await page.getByRole('button',{name:'Annotate',exact:true}).click();
  await page.getByRole('button',{name:'Done annotating',exact:true}).click();
  await page.getByRole('button',{name:'Maps',exact:true}).click();
  await page.locator('#dm-panel-maps input[type=file]').first().setInputFiles({name:'phone.heic',mimeType:'image/heic',buffer:Buffer.from('test')});
  await page.locator('#dm-panel-maps').getByRole('button',{name:'Upload image or animated map',exact:true}).click();
  const notice=page.getByRole('dialog',{name:'Image not supported',exact:true});await expect(notice).toBeVisible();
  const box=(await notice.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(430);
  await notice.getByRole('button',{name:'Got it',exact:true}).click();await expect(notice).toHaveCount(0);
});

test('rules updates above a character sheet and concentration replacement wait for confirmation',async({page,request})=>{
  const f=await setup(page,request),caster=f.initial.characters.find((c:any)=>c.name==='Druk');
  const catalog=(await(await request.get('/api/spells/all')).json()).results;
  const spell={...catalog.find((a:any)=>a.name==='Detect Magic'),id:'detect-magic',roll:{kind:'damage',dice:'1d4'}};
  f.socket.emit('character:update',{characterId:caster.id,className:'Wizard',level:3,sheetAbilities:[spell],spellSlots:{L1:{max:4,used:0}}});
  f.socket.emit('condition:set',{kind:'pc',refId:caster.id,condition:{label:'Concentration: Old spell',isConcentration:true}});
  await f.snapshot();await page.setViewportSize({width:1440,height:1000});await player(page,f.code);
  await page.getByRole('button',{name:'Character',exact:true}).click();
  const sheet=page.locator('dialog.character-window');await expect(sheet).toBeVisible();
  await sheet.getByRole('button',{name:'Spellbook',exact:true}).click();
  const character=async()=>(await f.snapshot()).characters.find((c:any)=>c.id===caster.id);
  const update=sheet.locator('.spell-entry').filter({hasText:'Detect Magic'}).locator('.rules-update');
  await update.click();const rules=page.getByRole('dialog',{name:'Update spell rules?',exact:true});await expect(rules).toBeVisible();
  await rules.getByRole('button',{name:'Cancel',exact:true}).click();await expect(sheet).toBeVisible();expect((await character()).sheetAbilities[0].roll.dice).toBe('1d4');
  await expect(update).toBeFocused();await update.click();await rules.getByRole('button',{name:'Update this entry',exact:true}).click();
  await expect.poll(async()=>(await character()).sheetAbilities[0].roll).toBeUndefined();
  await sheet.getByRole('button',{name:'Close character window',exact:true}).click();
  f.socket.emit('token:spawn',{mapId:f.map.id,kind:'pc',refId:caster.id,x:250,y:300});await f.snapshot();
  await page.locator('.compact-player-combat').getByRole('button',{name:/Detect Magic/}).click();
  const prompt=page.getByRole('dialog',{name:'Replace concentration?',exact:true});
  await expect(prompt).toBeVisible();expect((await character()).spellSlots.L1.used).toBe(0);
  await prompt.getByRole('button',{name:'Cancel',exact:true}).click();expect((await character()).conditions[0].label).toBe('Concentration: Old spell');
  await page.locator('.compact-player-combat').getByRole('button',{name:/Detect Magic/}).click();
  await prompt.getByRole('button',{name:'Cast Detect Magic',exact:true}).click();
  await expect.poll(async()=>(await character()).spellSlots.L1.used).toBe(1);
  await expect.poll(async()=>(await character()).conditions.some((c:any)=>c.label==='Concentration: Detect Magic')).toBe(true);
});
