import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';

test('party and enemy initiative tags follow live shared sight in 2D and 3D without revealing concealed enemies',async({page,request})=>{
 test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Party initiative through fog'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Two rooms',image:{name:'rooms.png',mimeType:'image/png',buffer:await sharp({create:{width:1100,height:600,channels:3,background:'#323832'}}).png().toBuffer()}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await dm.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const ranks=()=>page.evaluate(()=>((window as any).Konva?.stages??[]).flatMap((s:any)=>s.find('.token').flatMap((n:any)=>n.find('.token-initiative-rank').filter((b:any)=>b.isVisible()).map((b:any)=>({id:n.getAttr('tokenId'),text:b.find('Text')[0]?.text()})))));
 try{
 const chars=(await snap()).characters,druk=chars.find((c:any)=>c.name==='Druk'),varis=chars.find((c:any)=>c.name==='Varis');
 dm.emit('map:setActive',{mapId:map.id});
 for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 dm.emit('map:editWalls',{mapId:map.id,add:{id:'split',ax:500,ay:-5000,bx:500,by:5000}});
 dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:100,y:200});
 dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:varis.id,x:850,y:200});
 dm.emit('monster:create',{name:'Goblin',disposition:'enemy',maxHp:7,modelType:'goblin'});
 const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');
 dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:950,y:200});
 dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:950,y:450});
 const ready=await snap(),pcs=ready.tokens.filter((t:any)=>t.kind==='pc'),enemies=ready.tokens.filter((t:any)=>t.kind==='monster');
 const own=pcs.find((t:any)=>t.refId===druk.id),ally=pcs.find((t:any)=>t.refId===varis.id);
 dm.emit('token:setHidden',{tokenId:enemies[1].id,hidden:true});
 for(const [tokenId,initiative] of [[own.id,10],[ally.id,17],[enemies[0].id,13],[enemies[1].id,20]])dm.emit('initiative:set',{tokenId,initiative});
 await snap();await page.setViewportSize({width:1440,height:1000});
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
 await expect(page.getByTestId('player-hud')).toBeVisible();
 for(const threeD of [false,true]){
  await page.getByRole('button',{name:threeD?'3D player tokens':'2D player tokens',exact:true}).click();
  await page.getByRole('button',{name:threeD?'3D monster tokens':'2D monster tokens',exact:true}).click();
  for(const mode of ['day','dim','heavy']){
   dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:mode==='day'?'day':'dungeon',heavyDarkness:mode==='heavy',lights:[]}});await snap();
   await expect.poll(ranks,{timeout:15000}).toEqual(expect.arrayContaining([{id:ally.id,text:'1'},{id:enemies[0].id,text:'2'},{id:own.id,text:'3'}])).catch(async e=>{console.log(JSON.stringify({threeD,mode,own:own.id,ally:ally.id,enemy:enemies[0].id,ranks:await ranks()}));throw e});
   expect((await ranks()).some((t:any)=>t.id===enemies[1].id)).toBe(false);
  }
 }
 await expect.poll(()=>page.getByTestId('miniature-layer').getAttribute('data-miniature-ids'),{timeout:45000}).toContain(ally.id);
 // Retained color keeps the tag during live party sight, then drops it when
 // nobody currently sees that enemy. Party tags continue to display.
 dm.emit('map:setEnvironment',{mapId:map.id,settings:{lighting:'day',heavyDarkness:false}});
 dm.emit('fog:setExploration',{mapId:map.id,mode:'revealed'});await snap();
 await expect.poll(ranks,{timeout:15000}).toEqual(expect.arrayContaining([{id:enemies[0].id,text:'2'}]));
 dm.emit('token:move',{tokenId:ally.id,x:200,y:200});await snap();
 await expect.poll(ranks,{timeout:15000}).toEqual(expect.arrayContaining([{id:ally.id,text:'1'},{id:own.id,text:'2'}]));
 await expect.poll(async()=>(await ranks()).some((t:any)=>t.id===enemies[0].id)).toBe(false);
 // Painted cover also preserves the known party tag, and changes no hidden identity.
 dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:true});await snap();
 await expect.poll(ranks,{timeout:15000}).toEqual(expect.arrayContaining([{id:ally.id,text:'1'},{id:own.id,text:'2'}]));
 }finally{dm.disconnect()}
});
