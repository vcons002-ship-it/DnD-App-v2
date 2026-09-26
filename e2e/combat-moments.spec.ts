import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Real player/DM browsers against an isolated server: normal one-click damage,
// combined Smite in either mode, duplicate requests, and Pact usage on level-up.
test('Initiative, your turn, Riposte and critical celebration', async ({ page, browser, request }) => {
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Prompt ownership' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const character = (await snapshot()).characters.find((c) => c.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id, className: 'Fighter', level: 3, armorClass: 100, maxHp: 200, curHp: 200,
    stats: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    weapons: [{ name: 'Owner greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing', attackBonus: 100 }] });
  socket.emit('session:setManualDamage', { manual: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Ownership fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Ownership target', disposition: 'enemy', maxHp: 200, armorClass: 1,
    weapons: [{ name: 'DM blade', kind: 'melee', damage: '1d6', damageType: 'slashing', attackBonus: 100 }] });
  const template = (await snapshot()).monsterTemplates.find((m) => m.name === 'Ownership target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 350, y: 240 });
  const ready = await snapshot();
  const pc = ready.tokens.find((t) => t.kind === 'pc')!;
  const enemy = ready.tokens.find((t) => t.kind === 'monster')!;

  socket.emit('ability:set',{kind:'pc',refId:character.id,ability:{id:'riposte',name:'Riposte',type:'maneuver',
    description:'Reaction after a melee miss.',maneuver:{active:false,addDieTo:'damage'}}});
  await snapshot();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1366,height:900});
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  socket.emit('initiative:rollAll');
  await expect(page.locator('.combat-moment')).toContainText('Roll initiative!');
  await expect(page.locator('.combat-moment')).toHaveCSS('animation-name', 'combat-spotlight');
  await page.waitForTimeout(650);
  await page.screenshot({path:test.info().outputPath('roll-initiative.png'),fullPage:true});
  await page.getByRole('button',{name:'Dismiss announcement'}).click();
  if ((await snapshot()).activeTurnTokenId !== pc.id) socket.emit('initiative:next');
  await expect(page.locator('.combat-moment')).toContainText('Your Turn');
  await page.waitForTimeout(700);
  expect(await page.locator('.combat-moment strong').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(60);
  await page.screenshot({path:test.info().outputPath('your-turn.png'),fullPage:true});
  await page.waitForTimeout(3900);
  expect(await page.locator('.combat-moment').evaluate(el => parseFloat(getComputedStyle(el).opacity))).toBeLessThan(1);
  await expect(page.locator('.combat-moment')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  socket.emit('character:update',{characterId:character.id,armorClass:1000});
  await snapshot();
  await page.reload();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  await expect(page.locator('.combat-moment')).toHaveCount(0);
  let offer;
  for(let i=0;i<8 && !offer;i++) {
    socket.emit('combat:attack',{attackerTokenId:enemy.id,targetTokenId:pc.id,weaponIndex:0});
    offer=(await snapshot()).ripostes?.[0];
  }
  expect(offer).toBeTruthy();
  await expect(page.getByRole('region',{name:'Riposte opportunity'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('riposte.png'),fullPage:true});
  await page.getByRole('button',{name:'Pass',exact:true}).click();
  await expect(page.getByRole('region',{name:'Riposte opportunity'})).toHaveCount(0);
  expect((await snapshot()).characters.find(c=>c.id===character.id)!.resources['Superiority Dice'].used).toBe(0);
  offer=undefined;
  for(let i=0;i<8 && !offer;i++) {
    socket.emit('combat:attack',{attackerTokenId:enemy.id,targetTokenId:pc.id,weaponIndex:0});
    offer=(await snapshot()).ripostes?.[0];
  }
  // A prone/unconscious adjacent target makes a landed melee hit a critical hit.
  socket.emit('condition:set',{kind:'monster',refId:enemy.refId,condition:{label:'Unconscious',aura:'blue',isConcentration:false}});
  await snapshot();
  await page.getByRole('region',{name:'Riposte opportunity'}).getByRole('button',{name:/Riposte/}).click();
  await expect.poll(async()=> (await snapshot()).characters.find(c=>c.id===character.id)!.resources['Superiority Dice'].used).toBe(1);
  await expect(page.locator('.critical-flourish')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('critical-hit.png'),fullPage:true});
  await expect(page.getByRole('region',{name:'Riposte opportunity'})).toHaveCount(0);
});
