import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const sockets: Socket[] = [];
test.afterEach(() => sockets.splice(0).forEach(socket => socket.disconnect()));

// Only the E2E server's disposable database is modified. The actual bundled
// GLBs, production map component, Socket.IO path and browser WebGL are used.
async function fixture(page: Page, request: APIRequestContext) {
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: '3D battlefield regression' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  let stagedId: string | null = null;
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(joined.ok).toBe(true);
    if (stagedId) return await new Promise<StateSnapshot>(resolve => {
      const handle=(s:StateSnapshot)=>{if(s.map?.id===stagedId){socket.off('state:snapshot',handle);resolve(s);}};
      socket.on('state:snapshot', handle); socket.emit('map:select', {mapId:stagedId!});
    });
    return joined.snapshot;
  };
  const initial = await snapshot();
  const png = await page.evaluate(() => { const c=document.createElement('canvas');c.width=1216;c.height=832;const g=c.getContext('2d')!;g.fillStyle='#736b54';g.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]; });
  const uploaded = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Miniature test board', image: { name: 'board.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(uploaded.ok()).toBeTruthy();
  const map = await uploaded.json();
  stagedId = map.id;

  socket.emit('map:select', { mapId: map.id });
  socket.emit('map:setGrid', { mapId: map.id, gridSizePx: 100, feetPerSquare: 5, widthFt: 60.8, locked: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  const names = ['Druk', 'Varis', 'Vanec'];
  for (const [index, name] of names.entries()) {
    const character = initial.characters.find(c => c.name === name)!;
    expect(character).toBeTruthy();
    socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300 + index * 300, y: 360 });
  }
  const ready = await snapshot();
  expect(ready.tokens).toHaveLength(3);
  return { code, socket, snapshot, mapId: map.id, initial, ready };
}

async function enter(page: Page, code: string, characterName = 'Druk', tilted = true) {
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: characterName }).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();

  if (tilted) await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
}

async function afterPaint(page: Page) {
  // Allow both Konva and the separate WebGL canvas to present the last input.
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

test('DM and player encounter tags follow activation and fog, and match complete reveals',async({page,browser,request},info)=>{
 test.setTimeout(90000);
 page.setDefaultTimeout(10000);
 const f=await fixture(page,request);
 for(const [i,t] of f.ready.tokens.entries())f.socket.emit('token:move',{tokenId:t.id,x:430+i*150,y:690});
 f.socket.emit('monster:create',{name:'Goblin',maxHp:12,modelType:'goblin'});
 const tmpl=(await f.snapshot()).monsterTemplates.find(m=>m.name==='Goblin')!;
 for(let i=0;i<4;i++)f.socket.emit('token:spawn',{mapId:f.mapId,kind:'monster',refId:tmpl.id,x:300+i*200,y:420});
 let state=await f.snapshot();
 const goblins=state.tokens.filter(t=>t.kind==='monster');
 expect(goblins.map(t=>t.revealTag)).toEqual(['U','U','U','U']);
 // Fog added after all PCs and monsters were placed, still during prep.
 f.socket.emit('fog:setLayer',{mapId:f.mapId,layer:'tokens',enabled:true});
 f.socket.emit('fog:paint',{mapId:f.mapId,layer:'tokens',cells:['7,4'],reveal:true});
 await f.snapshot();
 const ctx=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000}});
 const p=await ctx.newPage();
 const labels=()=>p.evaluate(()=>{const K=(window as any).Konva;return K.stages.flatMap((s:any)=>s.find('.token-tracking-tag').map((g:any)=>g.findOne('Text').text()));});
 await p.goto(`/dm?code=${f.code}`);await p.locator('input[type=password]').fill(DM_SECRET);
 await p.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
 await expect(p.getByRole('button',{name:'Maps',exact:true})).toHaveAttribute('aria-expanded','true');
 await p.getByTitle('View this map',{exact:true}).click();
 await p.getByRole('button',{name:'Maps',exact:true}).click();
 await p.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
 await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','7',{timeout:60000});
 await expect.poll(labels).toEqual(['U','U','U','U']);
 await p.getByRole('button',{name:'Maps',exact:true}).click();
 await p.getByRole('button',{name:'Make active',exact:true}).click();
 await p.getByRole('button',{name:'Maps',exact:true}).click();
 await expect.poll(labels).toEqual(['U','U','G1','U']);
 await p.screenshot({path:info.outputPath('dm-partial.png')});
 await enter(p,f.code,'Druk',true);
 await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','4',{timeout:60000});
 await expect.poll(labels).toEqual(['G1']);
 f.socket.emit('fog:paint',{mapId:f.mapId,layer:'tokens',cells:['3,4'],reveal:true});
 await expect.poll(labels).toEqual(['G2','G1']);
 f.socket.emit('fog:paint',{mapId:f.mapId,layer:'tokens',cells:['7,4'],reveal:false});
 await expect.poll(labels).toEqual(['G2']);
 f.socket.emit('fog:paint',{mapId:f.mapId,layer:'tokens',cells:['7,4'],reveal:true});
 await expect.poll(labels).toEqual(['G2','G1']);
 await p.screenshot({path:info.outputPath('player-partial.png')});
 // A second map, fully exposed on first activation: match DM creation numbers.
 const png=Buffer.from(await page.evaluate(() => { const c=document.createElement('canvas');c.width=1216;c.height=832;const g=c.getContext('2d')!;g.fillStyle='#736b54';g.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]; }), 'base64');
 const uploaded=await request.post(`/api/sessions/${f.code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Full reveal example',image:{name:'board.png',mimeType:'image/png',buffer:png}}});
 const map=await uploaded.json();
 f.socket.emit('map:select',{mapId:map.id});
 f.socket.emit('map:setGrid',{mapId:map.id,gridSizePx:100,feetPerSquare:5,widthFt:60.8,locked:false});
 for(let i=0;i<3;i++)f.socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:tmpl.id,x:350+i*250,y:430});
 f.socket.emit('map:setActive',{mapId:map.id});
 await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','3',{timeout:60000});
 await expect.poll(labels).toEqual(['G5','G6','G7']);
 await p.screenshot({path:info.outputPath('player-full.png')});
 await p.getByRole('button',{name:'2D monster tokens',exact:true}).click();
 await expect.poll(labels).toEqual(['G5','G6','G7']);
 await p.getByRole('button',{name:'Flat battlefield view',exact:true}).click();
 await expect.poll(labels).toEqual(['G5','G6','G7']);
 await p.reload();
 await expect.poll(labels).toEqual(['G5','G6','G7']);
 await ctx.close();
});
