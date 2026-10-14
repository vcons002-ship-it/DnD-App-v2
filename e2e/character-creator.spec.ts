import {test,expect,type APIRequestContext} from '@playwright/test';
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
    await guide.getByRole('button',{name:/Shield guardian/}).click();
    await page.waitForTimeout(1200);await guide.getByRole('button',{name:'Next →',exact:true}).click();
    await expect(guide.getByText('This class has no spellcasting at level one.',{exact:false})).toBeVisible();
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
  expect(hero.claimedBy).toBeTruthy();expect(hero.ownerId).toBeTruthy();expect(hero.armorClass).toBe(18);
  expect(hero.stats.STR).toBe(16);expect(hero.stats.CON).toBe(16);expect(hero.maxHp).toBe(15);
  expect(hero.weapons[0].name).toBe('Longsword');expect(hero.weapons[0].diceOnly).toBe(true);
  expect(hero.sheetAbilities.some(s=>s.name==='Greatsword Mastery')).toBe(true);
  await page.screenshot({path:path.join(evidence,'created-character.png')});
  await page.getByRole('dialog').filter({hasText:'Character record'}).getByRole('button',{name:/Close/}).click();
  await page.getByRole('button',{name:/Place.*token/}).click();
  await page.locator('.konvajs-content').first().click({position:{x:400,y:300}});
  await expect.poll(async()=> (await f.snapshot()).tokens.some(t=>t.refId===hero.id)).toBe(true);
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

test('desktop identity and review keep the preview and navigation visible',async({page,request})=>{
  mkdirSync(evidence,{recursive:true});await page.setViewportSize({width:1500,height:980});const f=await campaign(request);
  await page.goto(`/join?code=${f.code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.creator-launch').click();const guide=page.getByRole('dialog',{name:'Bring your hero to life'});
  await guide.getByLabel('Character name',{exact:true}).fill('Rowan Ashford');
  await expect(guide.getByRole('button',{name:'Next →',exact:true})).toBeEnabled();
  await page.screenshot({path:path.join(evidence,'creator-desktop.png')});
  for(let i=0;i<4;i++)await guide.getByRole('button',{name:'Next →',exact:true}).click();
  await page.screenshot({path:path.join(evidence,'creator-desktop-review.png')});
  await guide.getByRole('button',{name:'Close character creator'}).click();
  await expect(page.locator('.creator-launch')).toBeFocused();
});
