import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';

test('DM picks custom light colors that render for players and persist after reload',async({page,request,browser},info)=>{
  test.setTimeout(90000);
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Custom colored lights'}})).json();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Colored light room',image:{name:'floor.png',mimeType:'image/png',buffer:await sharp({create:{width:800,height:600,channels:3,background:'#69615c'}}).png().toBuffer()}}})).json();
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  const playerContext=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:1000}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const picker=()=>page.getByLabel('Light 1 color picker',{exact:true});
  const choose=async(color:string)=>{
    // Drive the native color input's input event through React's real handler.
    await picker().evaluate((input:HTMLInputElement,color)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,color);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    },color);
    await expect.poll(async()=>(await snap()).map.environment.lights[0].color).toBe(color);
    await expect(page.getByLabel('Light 1 color',{exact:true})).toHaveValue('custom');
  };
  try{
    const druk=(await snap()).characters.find((c:any)=>c.name==='Druk');
    socket.emit('map:setActive',{mapId:map.id});
    for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
    socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:400,y:330});
    socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',mist:false,lights:[
      {id:'custom',x:200,y:220,radiusFt:18,heightFt:9,color:'warm',intensity:1,flicker:true,visibleTorch:true},
      {id:'blue',x:600,y:350,radiusFt:18,heightFt:9,color:'cool',intensity:1,flicker:true,visibleTorch:true},
    ]}});await snap();
    await page.setViewportSize({width:1440,height:1000});await page.goto(`/dm?code=${code}`);
    await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    const player=await playerContext.newPage();player.on('pageerror',e=>errors.push(e.message));await player.goto(`/join?code=${code}`);
    await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
    for(const p of [page,player])await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','1',{timeout:60000});
    await page.getByRole('button',{name:'Maps',exact:true}).click();await page.locator('.map-environment-controls > summary').click();
    await page.locator('.environment-light-list > details').first().locator('summary').click();
    await expect(picker()).toHaveValue('#ffb258');
    await choose('#bb22ff');await choose('#ee3030');
    await page.getByLabel('Light 1 color',{exact:true}).selectOption('green');await expect(picker()).toHaveValue('#85eab5');
    await choose('#bb22ff');
    await page.screenshot({path:info.outputPath('custom-light-picker.png')});
    for(const p of [page,player]){
      await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-light-count','2');
      await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-local-shadow-lights','2');
      await p.reload();await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','1',{timeout:60000});
    }
    await expect.poll(async()=>(await snap()).map.environment.lights[0].color).toBe('#bb22ff');
    await player.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await player.getByRole('button',{name:'Fit',exact:true}).click();
    await player.screenshot({path:info.outputPath('custom-lights-player.png')});
    expect(errors).toEqual([]);
  }finally{socket.disconnect();await playerContext.close();}
});
