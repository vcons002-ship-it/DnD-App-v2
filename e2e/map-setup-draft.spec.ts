import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {io,type Socket} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';
import type {StateSnapshot} from '../shared/types';

const connections:Socket[]=[];
test.afterEach(()=>connections.splice(0).forEach(s=>s.disconnect()));
async function fixture(page:Page,request:APIRequestContext,failLights=false){
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Combined setup test'}})).json();
  const image=await sharp({create:{width:400,height:300,channels:3,background:'#343a44'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Combined setup map',image:{name:'map.png',mimeType:'image/png',buffer:image}}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});connections.push(socket);
  const snapshot=async():Promise<StateSnapshot>=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  await snapshot();socket.emit('map:setActive',{mapId:map.id});await snapshot();
  const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
  const source={mapId:map.id,imageHash:hash(image),width:400,height:300,gridSizePx:map.gridSizePx,feetPerSquare:map.feetPerSquare,gridOffsetX:map.gridOffsetX,gridOffsetY:map.gridOffsetY,wallsHash:hash('[]')};
  const {wallsHash,...lightSource}=source;
  const drafts={
    walls:{version:1,id:'e2e-walls',method:'ai',source,maskImagePath:map.imagePath,items:[
      {id:'item-0',kind:'wall',label:'Left jamb',ax:0,ay:140/300,bx:.4,by:160/300,heightFt:10,confidence:1},
      {id:'item-1',kind:'wall',label:'Right jamb',ax:.6,ay:140/300,bx:1,by:160/300,heightFt:10,confidence:1},
    ]},
    doors:{version:1,id:'e2e-doors',source,maskImagePath:map.imagePath,doors:[{id:'ai-door-1',ax:160,ay:150,bx:240,by:150,thickness:6,issue:'No saved walls yet'}]},
    lights:{version:1,id:'e2e-lights',source:{...lightSource,lightsHash:hash('[]')},maskImagePath:map.imagePath,lights:[100,300].map((x,i)=>({id:`ai-light-${i+1}`,x,y:220,radiusFt:20,heightFt:8,color:'warm',intensity:1,flicker:true}))},
  };
  const calls={walls:0,doors:0,lights:0};
  // Stub only paid image analysis; auth, UI, source validation and Apply use the
  // real app/server. Separate live API evidence is recorded in the dev preview.
  for(const [step,endpoint] of [['walls','wall-draft'],['doors','door-draft'],['lights','light-draft']] as const){
    await page.route(`**/api/maps/${map.id}/${endpoint}`,async route=>{
      calls[step]++;expect(route.request().headers()['x-dm-passphrase']).toBe(DM_SECRET);
      if(step==='lights'&&failLights&&calls.lights===1)await route.fulfill({status:503,json:{error:'Image API connection failed'}});
      else await route.fulfill({json:drafts[step]});
    });
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/dm?code=${code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await page.getByRole('button',{name:'Walls',exact:true}).click();
  await page.getByRole('button',{name:'Suggest walls, doors & lights',exact:true}).click();
  return {map,snapshot,calls};
}

test('one click runs all three analyses, fits doors to selected walls and applies together',async({page,request})=>{
  const f=await fixture(page,request);
  await expect.poll(()=>f.calls).toEqual({walls:1,doors:1,lights:1});
  const dialog=page.getByRole('dialog',{name:'Map setup draft'});
  await expect(dialog.getByRole('button',{name:'Apply selected setup'})).toBeEnabled();
  await dialog.getByRole('button',{name:'Doors draft',exact:true}).click();await expect(dialog.getByLabel('Door 1',{exact:true})).toBeChecked();
  await dialog.getByRole('button',{name:'Walls draft',exact:true}).click();await dialog.getByLabel('Left jamb').uncheck();
  await dialog.getByRole('button',{name:'Doors draft',exact:true}).click();await expect(dialog.getByLabel(/^Door 1/)).toBeDisabled();await expect(dialog.getByLabel(/^Door 1/)).not.toBeChecked();
  await dialog.getByRole('button',{name:'Walls draft',exact:true}).click();await dialog.getByLabel('Left jamb').check();
  await dialog.getByRole('button',{name:'Doors draft',exact:true}).click();await expect(dialog.getByLabel('Door 1',{exact:true})).toBeChecked();
  await dialog.getByRole('button',{name:'Lights draft',exact:true}).click();await dialog.getByLabel('Light source 2').uncheck();
  const response=page.waitForResponse(r=>r.url().endsWith('/setup-draft/apply'));
  await dialog.getByRole('button',{name:'Apply selected setup'}).click();const applied=await response;expect(applied.status()).toBe(200);expect(await applied.json()).toEqual({walls:2,doors:1,lights:1});
  await expect(dialog).toBeHidden();const state=await f.snapshot();expect(state.map!.walls).toHaveLength(3);expect(state.map!.walls!.filter(w=>w.door&&w.tokenId)).toHaveLength(1);expect(state.map!.environment!.lights).toHaveLength(1);expect(state.map!.imagePath).toBe(f.map.imagePath);
});

test('retrying one failed workflow preserves successful drafts and selections',async({page,request})=>{
  const f=await fixture(page,request,true),dialog=page.getByRole('dialog',{name:'Map setup draft'});
  await expect(dialog.getByRole('button',{name:'Retry lights',exact:true})).toBeEnabled();
  await dialog.getByLabel('Right jamb').uncheck();
  await dialog.getByRole('button',{name:'Retry lights',exact:true}).click();
  await expect.poll(()=>f.calls).toEqual({walls:1,doors:1,lights:2});
  await expect(dialog.getByRole('button',{name:'Apply selected setup'})).toBeEnabled();
  await expect(dialog.getByLabel('Right jamb')).not.toBeChecked();await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Lights draft',exact:true}).click();await expect(dialog.getByLabel('Light source 1')).toBeChecked();
});

test('combined Apply requires DM authentication',async({request})=>{
  const response=await request.post('/api/maps/anything/setup-draft/apply',{data:{drafts:{},selected:{walls:[],doors:[],lights:[]}}});expect(response.status()).toBe(403);
});
