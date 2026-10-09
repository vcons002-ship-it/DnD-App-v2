import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';

test('darkness keeps local-light shadows and lets the DM restore map shadows',async({page,request,browser},info)=>{
  test.setTimeout(120000);
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Darkness shadow controls'}})).json();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Shadow room',image:{name:'room.png',mimeType:'image/png',buffer:await sharp({create:{width:800,height:600,channels:3,background:'#474344'}}).png().toBuffer()}}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  const playerContext=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:1000}});
  try{
    const druk=(await snap()).characters.find((c:any)=>c.name==='Druk');
    socket.emit('map:setActive',{mapId:map.id});
    socket.emit('map:setGrid',{mapId:map.id,gridSizePx:100,feetPerSquare:5,widthFt:40,locked:false});
    for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
    socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:300,y:300});
    socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,mist:false,lights:[
      {id:'left',x:200,y:300,radiusFt:20,heightFt:9,color:'warm',intensity:1,flicker:true},
      {id:'right',x:400,y:300,radiusFt:20,heightFt:9,color:'warm',intensity:1,flicker:true},
    ]}});
    await snap();
    await page.setViewportSize({width:1440,height:1000});await page.goto(`/dm?code=${code}`);
    await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    const player=await playerContext.newPage();await player.goto(`/join?code=${code}`);
    await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
    const layers=[page.getByTestId('miniature-layer'),player.getByTestId('miniature-layer')];
    for(const layer of layers)await expect(layer).toHaveAttribute('data-miniature-count','1',{timeout:60000});
    await page.getByRole('button',{name:'Maps',exact:true}).click();await page.locator('.map-environment-controls > summary').click();
    const mapShadows=page.getByLabel('Map directional shadows',{exact:true});
    const verify=async(directional:boolean)=>{
      for(const layer of layers){
        await expect(layer).toHaveAttribute('data-directional-shadow',String(directional));
        await expect(layer).toHaveAttribute('data-shadows','true');
        await expect(layer).toHaveAttribute('data-local-shadow-lights','2');
      }
    };
    await verify(true);
    for(const lighting of ['night','dungeon']){
      await page.getByLabel('Lighting preset',{exact:true}).selectOption(lighting);
      await expect(mapShadows).not.toBeChecked();await verify(false);
      await mapShadows.click();await expect(mapShadows).toBeChecked();await verify(true);
      // Ordinary edits do not silently undo the explicit override.
      socket.emit('map:setEnvironment',{mapId:map.id,settings:{windStrength:.7}});await snap();await verify(true);
      await page.getByLabel('Heavy darkness',{exact:true}).click();await expect(mapShadows).not.toBeChecked();await verify(false);
      await mapShadows.click();await expect(mapShadows).toBeChecked();await verify(true);
      await page.getByLabel('Heavy darkness',{exact:true}).click();await verify(false);
    }
    await page.screenshot({path:info.outputPath('darkness-light-source-shadows.png')});
    await page.getByLabel('Environment preset',{exact:true}).selectOption('clear-day');await verify(true);
    await page.getByLabel('Environment preset',{exact:true}).selectOption('deep-dungeon');await verify(false);
    await page.getByLabel('Token shadows',{exact:true}).click();
    for(const layer of layers){await expect(layer).toHaveAttribute('data-directional-shadow','false');await expect(layer).toHaveAttribute('data-local-shadow-lights','0');}
  }finally{socket.disconnect();await playerContext.close();}
});
