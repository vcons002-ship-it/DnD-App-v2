import {test,expect,type APIRequestContext} from './helpers/test';
import {io,type Socket} from 'socket.io-client';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './directAv1Recorder';
import type {StateSnapshot} from '../shared/types';

const sockets:Socket[]=[];
test.afterEach(()=>sockets.splice(0).forEach(s=>s.disconnect()));
const evidence=path.resolve('tmp/character-creator');
async function campaign(request:APIRequestContext){
  const response=await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'New heroes'}});
  expect(response.ok()).toBe(true);const {code}=await response.json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(socket);
  const snapshot=async():Promise<StateSnapshot>=>{const ack=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(ack.ok).toBe(true);return ack.snapshot;};
  await snapshot();return {code,socket,snapshot};
}
test('Paladin purchases gear and chooses spells before creating or crafting the character',async({page,request})=>{
  mkdirSync(evidence,{recursive:true});await page.setViewportSize({width:1500,height:980});const f=await campaign(request);
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.creator-launch').click();
  const guide=page.getByRole('dialog',{name:'Bring your hero to life'}),next=()=>guide.getByRole('button',{name:/^Next/}).click();
  await guide.getByLabel('Character name',{exact:true}).fill('Aldric');await guide.getByRole('button',{name:/Paladin.*Stand for your oath/}).click();await next();await next();
  await guide.getByRole('button',{name:/Gold alternative/}).click();
  for(const name of ['Maul','Chain Mail','Holy Symbol (Amulet)',"Explorer's Pack"]){await guide.getByLabel('Search equipment').fill(name);await guide.getByRole('button',{name:`Buy ${name}`,exact:true}).click();}
  await expect(guide.locator('.creator-budget')).toContainText('100 GP remaining');await expect(guide.getByLabel('Worn armor')).toHaveValue('chain-mail');
  await page.screenshot({path:path.join(evidence,'paladin-equipment.png')});await next();
  await expect(guide.locator('.creator-spells button[aria-pressed=true]')).toHaveCount(2);
  await guide.getByRole('button',{name:/^Bless\b/}).click();await guide.getByRole('button',{name:/^Heroism\b/}).click();
  await page.screenshot({path:path.join(evidence,'paladin-spells.png')});await next();
  await guide.getByLabel('Your hero’s appearance',{exact:true}).fill('Human Paladin in chain mail, holding a two-handed flanged mace.');
  await guide.getByLabel('Weapon held by your token',{exact:true}).selectOption('Maul');
  await guide.getByRole('checkbox',{name:/Craft token art/}).check();await next();
  await expect(guide.locator('.creator-review')).toContainText('Maul');await expect(guide.locator('.creator-review')).toContainText('Heroism');
  await expect(guide.getByRole('button',{name:'Create & craft token',exact:true})).toBeEnabled();
  // Check crafting availability without running a paid generation in regression tests.
  await guide.getByRole('button',{name:/^Back/}).click();await guide.getByRole('checkbox',{name:/Craft token art/}).uncheck();await next();
  await guide.getByRole('button',{name:'Create & play',exact:true}).click();await expect(guide).not.toBeVisible();
  const hero=(await f.snapshot()).characters.find(c=>c.name==='Aldric')!;
  expect(hero.gold).toBe(100);expect(hero.armorClass).toBe(16);expect(hero.weapons.map(w=>w.name)).toEqual(['Maul']);
  expect(hero.items.map(i=>i.name)).toEqual(['Maul','Chain Mail','Holy Symbol (Amulet)',"Explorer's Pack"]);
  expect(hero.sheetAbilities.filter(s=>s.type==='spell'&&s.level===1&&s.prepared).map(s=>s.name)).toEqual(['Cure Wounds','Heroism']);
  await page.getByLabel('Character',{exact:true}).click();await page.screenshot({path:path.join(evidence,'paladin-created.png')});
});

test('a player creates, claims, and places a battle-ready fighter through the guided option',async({page,request})=>{
  test.setTimeout(120000);mkdirSync(evidence,{recursive:true});
  await page.setViewportSize({width:1500,height:980});
  const f=await campaign(request);
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const ctx=c.getContext('2d')!;ctx.fillStyle='#303b32';ctx.fillRect(0,0,800,600);return c.toDataURL('image/png').split(',')[1];});
  const map=await(await request.post(`/api/sessions/${f.code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Training grounds',image:{name:'camp.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}}})).json();
  f.socket.emit('map:setActive',{mapId:map.id});f.socket.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});await f.snapshot();
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await expect(page.locator('.creator-launch')).toBeVisible();
  await page.evaluate(()=>{document.title='Character Creator AV1 Review';});
  const capture=process.env.CREATOR_CAPTURE?await startAv1Capture(page,path.join(evidence,'character-creator-av1.mp4'),{title:'Character Creator AV1 Review',width:1500,height:1066}):null;
  try{
    await page.locator('.creator-launch').click();
    const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
    await expect(guide).toBeVisible();await expect(guide.getByRole('button',{name:'Next →',exact:true})).toBeEnabled();
    await guide.getByLabel('Character name',{exact:true}).fill('Rowan');
    await page.waitForTimeout(1200);
    await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByRole('heading',{name:'Find your strengths'})).toBeVisible();
    await guide.getByLabel('STR base score').selectOption('14');
    await expect(guide.getByLabel('CON base score')).toHaveValue('15'); // swapping, not duplicating
    await page.waitForTimeout(1000);await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByRole('heading',{name:'Ready for the road'})).toBeVisible();
    await guide.getByRole('button',{name:/Greatsword & chain mail/}).click();
    await page.waitForTimeout(1200);await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByText('This class has no spellcasting at level one.',{exact:false})).toBeVisible();
    await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByRole('heading',{name:'A hero you can picture'})).toBeVisible();
    await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByRole('heading',{name:'Rowan, your story begins'})).toBeVisible();
    await page.waitForTimeout(1800);
    await guide.getByRole('button',{name:'Create & play',exact:true}).click();
    await expect(guide).not.toBeVisible();
    await expect(page.getByRole('button',{name:'Character',exact:true})).toBeVisible();
    await page.waitForTimeout(1300);
  }finally{if(capture)await capture.stop();}
  await page.getByLabel('Character',{exact:true}).click();
  const snap=await f.snapshot(),hero=snap.characters.find(c=>c.name==='Rowan')!;
  expect(hero.claimedBy).toBeTruthy();expect(hero.ownerId).toBeTruthy();expect(hero.armorClass).toBe(16);
  expect(hero.stats.STR).toBe(16);expect(hero.stats.CON).toBe(16);expect(hero.maxHp).toBe(15);
  expect(hero.weapons[0].name).toBe('Greatsword');expect(hero.weapons[0].diceOnly).toBe(true);
  expect(hero.sheetAbilities.some(s=>s.name==='Greatsword Mastery')).toBe(true);
  await page.screenshot({path:path.join(evidence,'created-character.png')});
  await page.locator('.hero-token-crafting > summary').click();
  await page.locator('.model-upload-control > summary').click();
  await page.getByLabel('3D model file',{exact:true}).setInputFiles(path.resolve('client/public/miniatures/varis-battlefield-f7cc36107994.glb'));
  await page.getByRole('checkbox',{name:'Model already has a circular base'}).check();
  await page.getByRole('button',{name:'Upload & use miniature',exact:true}).click();
  await expect(page.locator('.model-upload-control')).toContainText('Miniature ready',{timeout:60000});
  await expect.poll(async()=> (await f.snapshot()).characters.find(c=>c.id===hero.id)?.modelType).toMatch(/^uploaded-/);
  await page.screenshot({path:path.join(evidence,'character-model-upload.png')});
  await page.getByRole('dialog').filter({hasText:'Character record'}).getByRole('button',{name:/Close/}).click();
  await page.getByRole('button',{name:/Place.*token/}).click();
  await page.locator('.konvajs-content').first().click({position:{x:400,y:300}});
  await expect.poll(async()=> (await f.snapshot()).tokens.some(t=>t.refId===hero.id)).toBe(true);
});

test('mobile backgrounds, starting feature descriptions and included inventory match the created sheet',async({page,request},info)=>{
  await page.setViewportSize({width:390,height:844});const f=await campaign(request);
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.creator-launch').click();
  const guide=page.getByRole('dialog',{name:'Bring your hero to life'}),next=()=>guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByLabel('Character name',{exact:true}).fill('Mobile soldier');
  await guide.getByRole('group',{name:'Human starting traits',exact:true}).getByText('Versatile',{exact:true}).click();
  await expect(guide.getByRole('group',{name:'Human starting traits',exact:true})).toContainText('additional Origin feat');
  await next();await guide.getByLabel('Choose a background',{exact:true}).selectOption('soldier');
  await expect(guide.getByRole('combobox',{name:'Origin feat',exact:true})).toHaveValue('Savage Attacker');await expect(guide.getByRole('combobox',{name:'Origin feat',exact:true})).toBeDisabled();
  await expect(guide.getByLabel('INT background increase',{exact:true})).toBeDisabled();await guide.getByLabel('Background tool proficiency',{exact:true}).selectOption('Dragonchess Set');
  await guide.getByRole('group',{name:'Your origin feats',exact:true}).getByText('Savage Attacker',{exact:true}).click();
  await expect(guide.getByRole('group',{name:'Your origin feats',exact:true})).toContainText('Once per turn');await next();
  await guide.getByLabel('Background equipment option',{exact:true}).selectOption('package');
  const inventory=guide.getByRole('group',{name:'Your starting inventory',exact:true});await expect(inventory).toContainText('18 GP');
  await expect(inventory).toContainText('20 × Arrows');await expect(inventory).toContainText('1 × Dragonchess Set');
  await inventory.getByText('What’s in Dungeoneer\'s Pack?',{exact:true}).click();await expect(inventory).toContainText('10 Torches');
  await next();await next();await next();await expect(guide.getByRole('group',{name:'Class features added to your sheet',exact:true})).toBeVisible();
  await guide.getByRole('button',{name:'Create & play',exact:true}).click();await expect(guide).not.toBeVisible();
  const hero=(await f.snapshot()).characters.find(c=>c.name==='Mobile soldier')!;
  expect(hero.gold).toBe(18);expect(hero.items.find(i=>i.name==='Arrows')?.qty).toBe(20);expect(hero.sheetAbilities.find(a=>a.name==='Background: Soldier')?.description).toContain('Dragonchess Set');
  expect(hero.items.find(i=>i.name==="Dungeoneer's Pack")?.note).toContain('10 Torches');
});

test('mobile wizard draft survives closing; spells produce the right prepared spellbook',async({page,request})=>{
  mkdirSync(evidence,{recursive:true});await page.setViewportSize({width:390,height:844});const f=await campaign(request);
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.creator-launch').click();const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
  await guide.getByLabel('Character name',{exact:true}).fill('Mira');
  await guide.getByRole('button',{name:/Wizard.*Build a spellbook/}).click();
  await guide.locator('.creator-body').evaluate(el=>el.scrollTo({top:0}));
  await page.screenshot({path:path.join(evidence,'creator-mobile.png')});
  await guide.getByRole('button',{name:'Close character creator'}).click();await page.locator('.creator-launch').click();
  await expect(guide.getByLabel('Character name',{exact:true})).toHaveValue('Mira');
  await guide.getByRole('button',{name:'Next →',exact:true}).click();await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'Choose your first magic'})).toBeVisible();
  await expect(guide.locator('.creator-spells [aria-pressed=true]')).toHaveCount(9);
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  const overflow=await guide.evaluate(el=>el.scrollWidth>el.clientWidth);expect(overflow).toBe(false);
  await page.screenshot({path:path.join(evidence,'creator-mobile-review.png')});
  await guide.getByRole('button',{name:'Create & play',exact:true}).click();await expect(guide).not.toBeVisible();
  const hero=(await f.snapshot()).characters.find(c=>c.name==='Mira')!;
  expect(hero.spellSlots.L1.max).toBe(2);
  expect(hero.sheetAbilities.filter(s=>s.type==='spell'&&s.level===1)).toHaveLength(6);
  expect(hero.sheetAbilities.filter(s=>s.type==='spell'&&s.level===1&&s.prepared)).toHaveLength(4);
});

test('the server rejects invalid creator choices without creating a sheet',async({page,request})=>{
  const f=await campaign(request),before=(await f.snapshot()).characters.length;
  const ack=await f.socket.timeout(5000).emitWithAck('character:createGuided',{requestId:'bad-request-123456',name:'Injected hero',className:'necromancer',species:'Human'});
  expect(ack.ok).toBe(false);expect((await f.snapshot()).characters).toHaveLength(before);
  await page.goto(`/join?code=${f.code}`);
});

test('player manually rolls abilities, can roll all 24 dice, and creates a character',async({page,request})=>{
  test.setTimeout(180000);mkdirSync(evidence,{recursive:true});
  await page.setViewportSize({width:1500,height:980});const f=await campaign(request);
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.creator-launch').click();const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
  await expect(guide.getByRole('group',{name:'Choose your race (species)'})).toBeVisible();
  await guide.getByLabel('Character name',{exact:true}).fill('Chance');
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByRole('button',{name:'Roll for stats',exact:true}).click();
  await page.evaluate(()=>{document.title='Character Stat Rolls AV1';});
  const capture=process.env.CREATOR_CAPTURE?await startAv1Capture(page,path.join(evidence,'stat-rolls-av1.mp4'),{title:'Character Stat Rolls AV1',width:1500,height:1066}):null;
  const dieCounts=new Set<number>();f.socket.on('dice:frame',frame=>{if(frame?.sides)dieCounts.add(frame.sides.length);});
  try{
    for(const index of [1,2]){
      await guide.getByRole('button',{name:`Roll score ${index}`,exact:true}).click();
      await expect(guide).not.toBeVisible();await expect(page.locator('.dice-tray-canvas')).toBeVisible({timeout:20000});
      await expect(guide).toBeVisible({timeout:60000});
    }
    await expect(guide.getByRole('button',{name:'Roll score 3',exact:true})).toBeEnabled();
    await expect(guide.getByRole('button',{name:'Roll score 1',exact:true})).toHaveCount(0);
    await page.waitForTimeout(800); // no automatic next roll
    await expect(guide).toBeVisible();
    await guide.getByRole('button',{name:'Roll all (new set)',exact:true}).click();
    await expect(guide).not.toBeVisible();
    await expect(page.locator('.dice-tray-canvas')).toBeVisible({timeout:20000});
    await expect(guide).toBeVisible({timeout:90000});
    await expect(guide.locator('.creator-roll-results>div')).toHaveCount(6);
    expect(dieCounts.has(4)).toBe(true);expect(dieCounts.has(24)).toBe(true);
    await page.waitForTimeout(1300);
  }finally{if(capture){
    // Graphics Capture can wait for a final frame when a modal is static.
    // Keep the window repainting during recorder shutdown, then cancel it.
    await guide.evaluate(el=>{(el as any).__captureFinish=el.animate([{opacity:1},{opacity:.99},{opacity:1}],{duration:2000,iterations:10});});
    try{await capture.stop();}finally{await guide.evaluate(el=>(el as any).__captureFinish?.cancel());}
  }}
  const old=await guide.getByLabel('STR base score').inputValue();
  const values=await guide.getByLabel('STR base score').locator('option').evaluateAll(els=>els.map(el=>(el as HTMLOptionElement).value));
  if(values.length>1){const other=values.find(n=>n!==old)!;await guide.getByLabel('STR base score').selectOption(other);}
  const scores=await Promise.all(['STR','DEX','CON','INT','WIS','CHA'].map(async a=>Number(await guide.getByLabel(`${a} base score`).inputValue())));
  const totals=await guide.locator('.creator-roll-results strong').allTextContents();
  expect([...scores].sort()).toEqual(totals.map(Number).sort());
  const assigned=new Set<string>();
  for(const card of await guide.locator('.creator-roll-results>div').all()){
    const label=await card.locator('small').last().textContent(),ability=label!.replace('Assigned to ','');assigned.add(ability);
    expect(await guide.getByLabel(`${ability} base score`,{exact:true}).inputValue()).toBe(await card.locator('strong').textContent());
  }
  expect(assigned.size).toBe(6);
  await page.screenshot({path:path.join(evidence,'creator-rolled-stats.png')});
  for(let i=0;i<4;i++)await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByRole('button',{name:'Create & play',exact:true}).click();await expect(guide).not.toBeVisible();
  const hero=(await f.snapshot()).characters.find(c=>c.name==='Chance')!;
  expect(hero.claimedBy).toBeTruthy();expect(hero.stats.STR).toBe(scores[0]+2);expect(hero.stats.CON).toBe(scores[2]+1);
});

test('appearance crafting creates a playable hero and exposes only their own job',async({page,request})=>{
  mkdirSync(evidence,{recursive:true});await page.setViewportSize({width:1500,height:980});const f=await campaign(request);
  await request.post('/api/assets/pause',{headers:{'x-dm-passphrase':DM_SECRET},data:{paused:true}});
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.creator-launch').click();const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
  await guide.getByLabel('Character name',{exact:true}).fill('Sable');
  await guide.getByRole('button',{name:'Orc',exact:true}).click();
  for(let i=0;i<4;i++)await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByLabel('Weapon held by your token',{exact:true}).selectOption('Flail');
  await guide.getByRole('checkbox',{name:/Craft token art/}).check();
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await expect(guide.getByRole('alert')).toContainText('appearance');
  await guide.getByLabel('Your hero’s appearance',{exact:true}).fill('A tall orc with dark green skin, black braids, brown eyes and a red sash.');
  await page.screenshot({path:path.join(evidence,'creator-token-appearance.png')});
  await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await guide.getByRole('button',{name:'Create & craft token',exact:true}).click();await expect(guide).not.toBeVisible();
  await page.getByLabel('Character',{exact:true}).click();
  await expect(page.locator('.hero-token-crafting')).toContainText(/Crafting in progress|Crafting needs attention/,{timeout:10000});
  const c=(await f.snapshot()).characters.find(c=>c.name==='Sable')!;
  expect(c.claimedBy).toBeTruthy();expect(c.modelType).toMatch(/^hero-sable-/);expect(c.appearance).toContain('black braids');expect(c.weapons.length).toBeGreaterThan(0);
  const ownJob=await f.socket.timeout(5000).emitWithAck('character:tokenCraftStatus',{characterId:c.id});
  expect(ownJob.ok).toBe(true);expect(ownJob.job.sourceCharacterId).toBe(c.id);expect(ownJob.job.artBrief).toContain('Species/race: Orc. Class: Fighter');expect(ownJob.job.artBrief).toContain('Greatsword');expect(ownJob.job.artBrief).toContain('Held weapon: Flail');
  const stranger=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(stranger);
  await stranger.timeout(5000).emitWithAck('join',{sessionCode:f.code,role:'player',playerId:'stranger-crafting-test'});
  const denied=await stranger.timeout(5000).emitWithAck('character:tokenCraftStatus',{characterId:c.id});expect(denied.ok).toBe(false);expect(denied.job).toBeUndefined();
  const refused=await stranger.timeout(5000).emitWithAck('character:craftToken',{characterId:c.id,appearance:'Tampered'});expect(refused.ok).toBe(false);
  for(const artAction of ['approve','regenerate','cancel']){
    const refusedReview=await stranger.timeout(5000).emitWithAck('character:craftToken',{characterId:c.id,appearance:'Tampered',artAction,jobId:ownJob.job.id,artHash:'a'.repeat(64)});
    expect(refusedReview.ok).toBe(false);expect(refusedReview.job).toBeUndefined();
  }
  const crafting=page.locator('.hero-token-crafting');await crafting.getByRole('button',{name:'Cancel crafting',exact:true}).click();
  await expect(crafting.getByRole('status')).toContainText('Craft cancelled');
  expect((await f.socket.timeout(5000).emitWithAck('character:tokenCraftStatus',{characterId:c.id})).job.state).toBe('cancelled');
  await crafting.getByRole('button',{name:/^Craft (a new token|token & miniature)$/}).click();
  await expect(crafting.getByRole('status')).toContainText('Crafting in progress');
  const recraft=await f.socket.timeout(5000).emitWithAck('character:tokenCraftStatus',{characterId:c.id});
  expect(recraft.job.id).not.toBe(ownJob.job.id);expect(recraft.job.heldWeapon).toBe('Flail');expect(recraft.job.heightInches).toBe(78);
  await crafting.getByRole('button',{name:'Cancel crafting',exact:true}).click();
  await request.post('/api/assets/pause',{headers:{'x-dm-passphrase':DM_SECRET},data:{paused:false}});
});

test('mobile appearance height supports manual feet/inches and one-inch steps and persists on the character',async({page,request})=>{
  const f=await campaign(request);await page.setViewportSize({width:390,height:844});
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.creator-launch').click();
  const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
  await guide.getByLabel('Character name',{exact:true}).fill('Height review');await guide.getByRole('button',{name:'Elf',exact:true}).click();
  for(let i=0;i<4;i++)await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await expect(guide.getByLabel('Height feet',{exact:true})).toHaveValue('5');await expect(guide.getByLabel('Height inches',{exact:true})).toHaveValue('6');
  await guide.getByLabel('Height inches',{exact:true}).fill('11');await guide.getByRole('button',{name:'Increase height by one inch',exact:true}).click();
  await expect(guide.getByLabel('Height feet',{exact:true})).toHaveValue('6');await expect(guide.getByLabel('Height inches',{exact:true})).toHaveValue('0');
  await guide.getByRole('button',{name:'Decrease height by one inch',exact:true}).click();await expect(guide.getByLabel('Height feet',{exact:true})).toHaveValue('5');
  await guide.getByLabel('Height inches',{exact:true}).fill('7');await guide.getByRole('button',{name:'Next →',exact:true}).click();await expect(guide).toContainText('5 ft 7 in');
  await guide.getByRole('button',{name:'Create & play',exact:true}).click();await expect(guide).not.toBeVisible();
  expect((await f.snapshot()).characters.find(c=>c.name==='Height review')?.heightInches).toBe(67);
});
