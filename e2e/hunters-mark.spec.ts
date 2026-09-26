import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

// Every write is to Playwright's throwaway database. No installed/preview saves.
const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

async function fixture(request: APIRequestContext, page: Page, spawnEnemies = true) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell workflow regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(joined.ok).toBe(true);
    return joined.snapshot;
  };
  const initial = await snapshot();
  const characterId = initial.characters.find((character) => character.name === 'Varis')!.id;
  const abilities: SheetAbility[] = [
    {id:'hm',name:"Hunter's Mark",type:'spell',level:1,tags:['concentration'],description:'Choose a target. Extra Force damage on each hit.',roll:{kind:'damage',dice:'1d6',baseLevel:1}},
  ];
  socket.emit('character:update', { characterId, className: 'Ranger', level: 6,
    stats: { STR: 10, DEX: 18, CON: 10, INT: 20, WIS: 10, CHA: 16 },
    sheetAbilities: abilities, weapons: [{name:'Longbow',kind:'ranged',damage:'1d8',damageType:'piercing',attackBonus:50,range:'150/600'}],
    spellSlots: { L1: { max: 8, used: 0 }, L2: { max: 4, used: 0 }, L3: { max: 8, used: 0 } },
  });
  // Generate a plain, local fixture PNG in a browser canvas, not external art.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Spell test map',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 300, y: 300 });
  if (spawnEnemies) {
    socket.emit('monster:create', { name: 'Goblin', maxHp: 6, armorClass: 1,
      stats: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 }, disposition: 'enemy' });
    const template = (await snapshot()).monsterTemplates.find((monster) => monster.name === 'Goblin')!;
    for (const [x,y] of [[500,200],[650,250],[550,400]]) socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x, y });
  }
  const ready = await snapshot();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Varis' }).click();
  const combat = page.getByRole('region', { name: 'Combat panel', exact: true });
  await expect(combat).toBeVisible();
  const row = (name: string) => combat.locator('.combat-ability-row').filter({ hasText: name });
  const dismissReveal = async (expectedRollId?: string) => {
    // A DM-socket snapshot confirms server completion, not that this player's
    // socket has rendered the same roll yet. Wait for the known result before
    // dismissing it, otherwise a late reveal can intercept the next map click.
    if (expectedRollId) await expect(page.locator('.roll-reveal')).toHaveAttribute('data-roll-id', expectedRollId);
    if (await page.locator('.roll-reveal').count()) {
      await page.locator('.roll-reveal').click({ position: { x: 10, y: 10 } });
      await expect(page.locator('.roll-reveal')).toHaveCount(0);
    }
  };
  // Konva exposes this read-only scene geometry; still click through the real
  // browser hit-test, never call an app event handler or forge a client store.
  const clickToken = async (id: string, button: 'left' | 'right' = 'left') => {
    const point = await page.evaluate((tokenId) => {
      const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
      const stage = stages.find((candidate) => candidate.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y, {button});
  };
  return { socket, snapshot, ready, characterId, abilities, combat, row, dismissReveal, clickToken };
}


test('Hunter mark cast, automatic hit damage, and no-slot transfer through player UI', async ({page,request}) => {
  test.setTimeout(150000);
  const f = await fixture(request,page);
  f.socket.emit('session:setManualDamage',{manual:true});
  await f.snapshot();
  const targets=f.ready.tokens.filter(t=>t.kind==='monster');
  // Adjacent paralyzed targets make these real hits critical, without changing RNG.
  for (const [i,t] of targets.slice(0,2).entries()) {
    f.socket.emit('token:move',{tokenId:t.id,x:i===0?350:300,y:i===0?300:350});
    f.socket.emit('condition:set',{kind:'monster',refId:t.refId,condition:{label:'Paralyzed',aura:'red',isConcentration:false}});
  }
  await f.snapshot();

  // Allow the remote token movement animation and initial map fit to settle.
  await page.waitForTimeout(1500);
  await f.clickToken(targets[0].id,'right');
  const menu=page.getByRole('dialog',{name:'Token actions'});
  await expect(menu).toBeVisible();
  await menu.getByRole('button',{name:/Hunter.s Mark/}).click();
  await expect.poll(async()=> (await f.snapshot()).characters.find(c=>c.id===f.characterId)!.sheetAbilities[0].mark?.refId).toBe(targets[0].refId);
  expect((await f.snapshot()).characters.find(c=>c.id===f.characterId)!.spellSlots.L1.used).toBe(1);
  const attack=async(target:string)=>{
    for(let attempt=0;attempt<5;attempt++) {
      await f.dismissReveal();
      await f.clickToken(target,'right');
      await expect(menu).toBeVisible();
      await menu.getByRole('button',{name:'Adv',exact:true}).click();
      await menu.getByRole('button',{name:/Longbow/}).click();
      await expect(page.locator('.roll-reveal')).toBeVisible();
      const roll=(await f.snapshot()).rollLog.filter(r=>r.reveal?.kind==='attack').at(-1)!;
      if(roll.pending) {
        await expect(page.locator('.player-damage-dock .damage-prompt-btn')).toBeVisible({timeout:20000});
        await page.locator('.player-damage-dock .damage-prompt-btn').click();
        await expect.poll(async()=> (await f.snapshot()).rollLog.some(r=>r.reveal?.damageDice?.some(d=>d.label.includes("Hunter's Mark")))).toBe(true);
        const mesh=page.locator('.roll-reveal .three-die');
        expect(roll.pending.crit).toBe(true);
        await expect(page.locator('.rr-arrow')).toContainText(`Goblin G${targets.findIndex(t=>t.id===target)+1}`);
        for(const sides of [6,8]) {
          await expect(mesh.locator(`xpath=self::*[@data-sides="${sides}" and @data-critical="true"]`)).toHaveCount(1);
          await expect(mesh.locator(`xpath=self::*[@data-sides="${sides}" and @data-critical="false"]`)).toHaveCount(1);
        }

        await expect(page.locator('.roll-reveal .three-die[data-sides="8"]')).toHaveCount(roll.pending.crit?2:1);
        await expect(page.locator('.roll-reveal .three-die[data-sides="6"]')).toHaveCount(roll.pending.crit?2:1);
        await expect.poll(async()=>mesh.evaluateAll(nodes=>nodes.every(n=>!n.getAttribute('aria-label')?.includes('rolling')))).toBe(true);
        const actual=await mesh.evaluateAll(nodes=>nodes.map(n=>({sides:Number(n.getAttribute('data-sides')),value:Number(n.getAttribute('data-value'))})));
        const expected=roll.pending.dice.flatMap(d=>(d.faces??[]).map(value=>({sides:d.label.includes("Hunter's Mark")?6:8,value})));
        expect(actual).toEqual(expected);
        await expect.poll(async()=>Number((await page.locator('.rr-dmg-num').innerText()).match(/^\d+/)?.[0])).toBe(roll.pending.amount);
        await expect.poll(async()=>page.evaluate(()=> (window as any).Konva.stages.flatMap((stage:any)=>stage.find('.hp-floater-number').map((node:any)=>node.text())))).toContain(`\u2212${roll.pending.amount}`);
        await f.dismissReveal();
        return;
      }
    }
    throw new Error('No hit after retries');
  };
  await attack(targets[0].id);
  const prompt=page.getByRole('region',{name:'Move mark',exact:true});
  await expect(prompt).toBeVisible({timeout:20000});
  await prompt.getByRole('button',{name:'Move mark',exact:true}).click();
  await f.clickToken(targets[1].id);
  await expect(prompt.getByRole('button',{name:'Confirm mark'})).toBeVisible();
  await prompt.getByRole('button',{name:'Confirm mark'}).click();
  await expect.poll(async()=> (await f.snapshot()).characters.find(c=>c.id===f.characterId)!.sheetAbilities[0].mark?.refId).toBe(targets[1].refId);
  await expect(prompt).toHaveCount(0);
  await attack(targets[1].id);
  const final=await f.snapshot();
  expect(final.characters.find(c=>c.id===f.characterId)!.spellSlots.L1.used).toBe(1);
});
