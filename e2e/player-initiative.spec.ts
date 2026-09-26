import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Real player/DM browsers against an isolated server: normal one-click damage,
// combined Smite in either mode, duplicate requests, and Pact usage on level-up.
test('Player initiative request persists until rolled', async ({ page, browser, request }) => {
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
  socket.emit('initiative:start');
  await expect(page.getByRole('region',{name:'Initiative roll request'})).toBeVisible();
  expect((await snapshot()).tokens.find(t=>t.id===pc.id)!.initiative).toBeNull();
  expect((await snapshot()).tokens.find(t=>t.id===enemy.id)!.initiative).not.toBeNull();
  expect((await snapshot()).activeTurnTokenId).toBeNull();
  await page.waitForTimeout(5500);
  await expect(page.getByRole('button',{name:'Roll initiative',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Roll initiative',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Roll initiative',exact:true}).click();
  await expect.poll(async()=> (await snapshot()).initiativePending).toBe(false);
  await expect(page.getByRole('region',{name:'Initiative roll request'})).toHaveCount(0);
  const result=await snapshot();
  expect(result.tokens.find(t=>t.id===pc.id)!.initiative).not.toBeNull();
  expect(result.round).toBe(1);
  expect(result.rollLog.filter(r=>r.label==='Initiative')).toHaveLength(1);
});
