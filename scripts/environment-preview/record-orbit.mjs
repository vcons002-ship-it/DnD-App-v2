import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

// A separate static lab: no app server, save file or campaign connection.
const out=path.resolve(process.argv[2]);await mkdir(out,{recursive:true});
const varietyStudy=process.argv.includes('--variety');
const windColorStudy=process.argv.includes('--wind-color');
const stormStudy=windColorStudy||process.argv.includes('--storm');
const dungeonStudy=process.argv.includes('--dungeon');
const weatherStudy=process.argv.includes('--weather');
const torchStudy=process.argv.includes('--torches');
const root=path.resolve('client/environment-dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path.relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);
const encoder=require('playwright-core/lib/server/registry/index').registry.findExecutable('ffmpeg');
const ffmpeg=execFileSync('where.exe',['ffmpeg'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
encoder.executablePath=()=>ffmpeg;encoder.executablePathOrDie=()=>ffmpeg;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out,size:{width:1440,height:960}}});
const page=await context.newPage(),errors=[],phases=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
let box;
try{
  await page.goto('http://127.0.0.1:4198/environment-test.html'+(varietyStudy?'?variety=1':stormStudy?'?storm=1':dungeonStudy?'?dungeon=1':torchStudy?'?torches=1':weatherStudy?'?atmosphere=1':''));
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='7');
  await page.getByRole('button',{name:'Close-up',exact:true}).click();await page.waitForTimeout(800);
  if(!weatherStudy&&!torchStudy&&!dungeonStudy&&!stormStudy&&!varietyStudy){await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(800);}
  box=await page.getByTestId('environment-stage').boundingBox();
  await page.evaluate(()=>{
    const marker=document.createElement('div');marker.id='record-start-marker';marker.style.cssText='position:fixed;left:0;top:0;width:8px;height:8px;background:#ff00ff;z-index:9999';document.body.append(marker);
    const caption=document.createElement('div');caption.id='record-caption';caption.style.cssText='position:absolute;left:0;right:0;top:0;padding:16px;text-align:center;background:#101815ed;color:#ece7d3;font:22px Georgia;z-index:9;pointer-events:none';
    document.querySelector('[data-testid="environment-stage"]').append(caption);
  });
  const caption=async text=>{
    phases.push({text,at:Date.now()});await page.locator('#record-caption').evaluate((e,t)=>e.textContent=t,text);
    if(weatherStudy&&text.startsWith('Torches off'))await page.locator('#record-start-marker').evaluate(e=>e.style.background='#00ffff');
    await page.mouse.move(1410,945);
  };
  if(windColorStudy){
    const preset=page.getByLabel('Environment preset',{exact:true}),layer=page.getByTestId('miniature-layer');
    const setInput=async(label,value)=>page.getByLabel(label,{exact:true}).evaluate((input,value)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    },String(value));
    await caption('Clear day - original map colors, no color wash');await page.waitForTimeout(2200);
    await page.screenshot({path:path.join(out,'clear-day.png')});
    // Prove unshadowed artwork matches effects Off, then that the color control changes it.
    await page.getByLabel('Token shadows',{exact:true}).uncheck();await page.waitForTimeout(300);
    const clip={x:box.x+90,y:box.y+box.height-170,width:170,height:80};
    const neutral=await page.screenshot({clip});
    await page.getByLabel('Show effects',{exact:true}).uncheck();await page.waitForTimeout(300);
    const original=await page.screenshot({clip});
    await page.getByLabel('Show effects',{exact:true}).check();
    await setInput('Scene tint','#579dcc');await caption('DM scene tint - cool blue at 25 percent');await page.waitForTimeout(3000);
    const colored=await page.screenshot({clip});
    const compare=await page.evaluate(async images=>{
      const data=await Promise.all(images.map(async s=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;}));
      let neutralDiff=0,coloredDiff=0;for(let i=0;i<data[0].length;i+=4){if(Math.abs(data[0][i]-data[1][i])+Math.abs(data[0][i+1]-data[1][i+1])+Math.abs(data[0][i+2]-data[1][i+2])>3)neutralDiff++;if(Math.abs(data[0][i]-data[2][i])+Math.abs(data[0][i+1]-data[2][i+1])+Math.abs(data[0][i+2]-data[2][i+2])>3)coloredDiff++;}return {neutralDiff,coloredDiff};
    },[neutral,original,colored].map(b=>b.toString('base64')));
    assert.equal(compare.neutralDiff,0);assert(compare.coloredDiff>10000);phases.push({text:'Original artwork pixel comparison',data:compare});
    await page.screenshot({path:path.join(out,'cool-tint.png')});
    await setInput('Scene tint','#d99750');await caption('Warm amber at 25 percent - map and figure lighting');await page.waitForTimeout(3000);
    await page.screenshot({path:path.join(out,'warm-tint.png')});
    await preset.selectOption('clear-day');await caption('Clear day resets the custom tint');await page.waitForTimeout(1800);
    await preset.selectOption('light-rain');await page.getByLabel('Drifting mist',{exact:true}).uncheck();
    await setInput('Weather strength',1);await setInput('Wind direction',0);
    for(const [wind,title] of [[0,'Rain with no wind'],[1,'Rain at 100 percent wind - the previous maximum'],[3,'Rain at 300 percent wind - stronger sideways travel and slant']]){
      await setInput('Wind strength',wind);await caption(title);await page.waitForTimeout(4200);
      await page.screenshot({path:path.join(out,`rain-wind-${wind}.png`)});phases.push({text:title,data:await layer.evaluate(e=>({...e.dataset}))});
    }
    await setInput('Wind direction',90);await caption('Wind direction also changes the direction of the rain');await page.waitForTimeout(3500);
    await preset.selectOption('clear-day');await caption('Clear day - back to original colors');await page.waitForTimeout(1500);
  }else if(varietyStudy){
    const preset=page.getByLabel('Environment preset',{exact:true});
    const diagnostics=()=>page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
    const looks=[['autumn-wind','Autumn wind - falling leaves catch the evening light'],['firefly-glade','Firefly glade - glowing fireflies above thin green mist'],['haunted-marsh','Haunted marsh - deeper mist and damp ground'],['ashfall','Ashfall - drifting ash and rising embers'],['sandstorm','Sandstorm - warm haze and windblown dust'],['blizzard','Blizzard - thick snow and cold low mist']];
    for(const [id,title] of looks){
      await preset.selectOption(id);await caption(title);await page.waitForTimeout(4800);
      await page.screenshot({path:path.join(out,id+'.png')});phases.push({text:id,data:await diagnostics()});
    }
    await preset.selectOption('haunted-marsh');
    for(const name of ['Druk lantern','Varis lantern','Vanec lantern'])await page.getByLabel(name,{exact:true}).check();
    await caption('Hip lanterns through the marsh - the party leaves a wake');
    await page.getByRole('button',{name:'Move party',exact:true}).click();await page.waitForTimeout(7000);
    await page.screenshot({path:path.join(out,'marsh-lanterns.png')});
    await preset.selectOption('autumn-wind');await caption('Rotate the view - leaves stay anchored to the map');
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();await page.waitForTimeout(3500);
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();
    await page.getByRole('button',{name:'Overhead view',exact:true}).click();await caption('Overhead - the same wind and falling leaves');await page.waitForTimeout(2500);
    await page.screenshot({path:path.join(out,'autumn-overhead.png')});
    await preset.selectOption('clear-day');await caption('Clear day - one click resets the atmosphere');await page.waitForTimeout(1500);
    assert.equal((await diagnostics()).particles,'none');assert.equal((await diagnostics()).weather,'none');
  }else if(stormStudy){
    const layer=page.getByTestId('miniature-layer');
    const diagnostics=()=>layer.evaluate(e=>({...e.dataset}));
    const preset=page.getByLabel('Environment preset',{exact:true});
    await caption('Clear day - original courtyard and character models');
    await page.waitForTimeout(1800);await page.screenshot({path:path.join(out,'clear-day.png')});
    await preset.selectOption('light-rain');
    await caption('Light rain - thin mist, gentle wind and wet stone');
    await page.waitForTimeout(3800);await page.screenshot({path:path.join(out,'light-rain.png')});
    await preset.selectOption('rainstorm');
    await caption('Rainstorm preset - driving rain and occasional cloud lightning');
    await page.waitForTimeout(2200);await page.screenshot({path:path.join(out,'rainstorm.png')});
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="miniature-layer"]').dataset.lightningFlash)>.4,null,{timeout:25000});
    phases.push({text:'Natural lightning pulse',data:await diagnostics()});
    await page.screenshot({path:path.join(out,'storm-lightning.png')});
    await caption('Lanterns keep their warmth as the party moves through the rain');
    for(const name of ['Druk lantern','Varis lantern','Vanec lantern'])await page.getByLabel(name,{exact:true}).check();
    await page.getByRole('button',{name:'Move party',exact:true}).click();
    await page.waitForTimeout(3600);await page.screenshot({path:path.join(out,'storm-party.png')});await page.waitForTimeout(3500);
    await caption('Rotate the map - rain, mist and wet highlights remain on the surface');
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();await page.waitForTimeout(3500);
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();
    await page.getByRole('button',{name:'Overhead view',exact:true}).click();
    await caption('Overhead view - the same environment and lantern light');
    await page.waitForTimeout(2400);await page.screenshot({path:path.join(out,'storm-overhead.png')});
    phases.push({text:'Storm diagnostics',data:await diagnostics()});
    await preset.selectOption('clear-day');
    await caption('One click returns to Clear day - placed lights are preserved');
    await page.waitForTimeout(1800);
    assert.equal((await diagnostics()).weather,'none');assert.equal((await diagnostics()).lightningEnabled,'false');
    assert.equal((await diagnostics()).carriedLanternCount,'3');
  }else if(dungeonStudy){
    const diagnostics=()=>page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
    await caption('Castle basement - normal darkness - light floor mist');
    await page.waitForTimeout(2500);
    await page.screenshot({path:path.join(out,'dungeon-normal.png')});
    assert.equal((await diagnostics()).carriedLanternCount,'3');
    assert.equal((await diagnostics()).placedLanternCount,'3');
    await page.getByRole('button',{name:'Heavy darkness',exact:true}).click();
    await caption('Heavy darkness - the same lanterns at the same brightness');
    await page.waitForTimeout(2500);
    assert.equal((await diagnostics()).darkness,'heavy');
    await page.screenshot({path:path.join(out,'dungeon-heavy.png')});
    await page.getByRole('button',{name:'Heavy darkness',exact:true}).click();
    await page.getByRole('button',{name:'Party view',exact:true}).click();await page.waitForTimeout(800);
    await caption('Normal darkness - the party moves through the dungeon');
    await page.getByRole('button',{name:'Move party',exact:true}).click();
    await page.waitForTimeout(9000);
    phases.push({text:'Normal movement',data:await diagnostics()});
    await page.screenshot({path:path.join(out,'dungeon-normal-movement.png')});
    await page.getByRole('button',{name:'Heavy darkness',exact:true}).click();
    await caption('Heavy darkness - hip lanterns light the way back');
    await page.getByRole('button',{name:'Move party',exact:true}).click();
    await page.waitForTimeout(4500);
    await page.screenshot({path:path.join(out,'dungeon-heavy-movement.png')});
    await page.waitForTimeout(4500);
    phases.push({text:'Heavy movement',data:await diagnostics()});
    await page.getByRole('button',{name:'Heavy darkness',exact:true}).click();
    await caption('Small lanterns sit at the side of the hip');
    await page.getByRole('button',{name:'Lantern close-up',exact:true}).click();
    await page.waitForTimeout(3000);
    await page.screenshot({path:path.join(out,'hip-lantern-closeup.png')});
    await page.getByRole('button',{name:'Reset view',exact:true}).click();
    await caption('Full dungeon - three occasional floor lanterns');
    await page.waitForTimeout(3000);
    await page.screenshot({path:path.join(out,'dungeon-full.png')});
    phases.push({text:'Dungeon diagnostics',data:await diagnostics()});
  }else if(torchStudy){
    await caption('Night - maximum mist strength - 10 ft mist height');
    await page.waitForTimeout(2800);await page.screenshot({path:path.join(out,'night-three-torches.png')});
    await caption('The 3D torch can be hidden while its light stays on');
    await page.getByLabel('Visible placed torches',{exact:true}).uncheck();await page.waitForTimeout(2400);
    await page.getByLabel('Visible placed torches',{exact:true}).check();
    await page.getByRole('button',{name:'Twelve torches',exact:true}).click();
    await caption('Twelve placed torches - no placement count limit');await page.waitForTimeout(3000);
    assert.equal(await page.getByTestId('miniature-layer').getAttribute('data-light-count'),'12');
    await page.screenshot({path:path.join(out,'night-twelve-torches.png')});
    await page.getByRole('button',{name:'Lanterns only',exact:true}).click();
    await caption('No placed lights - Druk lights his waist lantern');
    await page.getByLabel('Druk lantern',{exact:true}).check();
    await page.getByRole('button',{name:'Lantern close-up',exact:true}).click();await page.waitForTimeout(3200);
    await page.screenshot({path:path.join(out,'druk-waist-lantern.png')});
    await page.getByRole('button',{name:'Front view',exact:true}).click();await page.waitForTimeout(800);
    await page.getByLabel('Varis lantern',{exact:true}).check();await page.getByLabel('Vanec lantern',{exact:true}).check();
    await caption('Three waist lanterns - light follows each player');
    await page.getByRole('button',{name:'Move party',exact:true}).click();await page.waitForTimeout(7200);
    await page.screenshot({path:path.join(out,'party-waist-lanterns.png')});
    await page.getByRole('button',{name:'Three torches',exact:true}).click();
    await caption('Waist lanterns and placed torches together - moving through dense mist');
    await page.getByRole('button',{name:'Move party',exact:true}).click();
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();await page.waitForTimeout(7200);
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();
    await page.getByRole('button',{name:'Overhead view',exact:true}).click();
    await caption('Overhead - same torch positions, light and mist');await page.waitForTimeout(2500);
    await page.screenshot({path:path.join(out,'torches-overhead.png')});
    phases.push({text:'Torch diagnostics',data:await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}))});
  }else if(weatherStudy){
    for(const [preset,title] of [['Day','Day · original courtyard with shadows and light mist'],['Dusk','Dusk · warm fading daylight'],['Rain','Rain · wind-driven streaks and ground splashes'],['Snow','Snow · drifting flakes anchored to the map'],['Night','Night · warm light on the map and figures'],['Dungeon','Dungeon · local pools of light in the dark']]){
      await page.getByRole('button',{name:preset,exact:true}).click();await caption(title);await page.waitForTimeout(4300);
      phases.push({text:preset,data:await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}))});
      await page.screenshot({path:path.join(out,`${preset.toLowerCase()}.png`)});
    }
    await caption('Torches off · compare the figures');
    await page.getByLabel('Three local lights',{exact:true}).uncheck();await page.waitForTimeout(2000);
    await page.screenshot({path:path.join(out,'torches-off.png')});
    await caption('Torches on · warm light catches faces, armor and robes');
    await page.getByLabel('Three local lights',{exact:true}).check();await page.waitForTimeout(3000);
    await page.screenshot({path:path.join(out,'torches-on.png')});
    await caption('Brightness and reach flicker together as Druk moves');
    await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.waitForTimeout(5000);
    await caption('Dungeon lighting stays on the map as the camera rotates');
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();await page.waitForTimeout(5000);
    await page.getByRole('button',{name:'Rotate view',exact:true}).click();
    await page.getByRole('button',{name:'Overhead view',exact:true}).click();await caption('Overhead · same lights and original map image');await page.waitForTimeout(2300);
    await page.screenshot({path:path.join(out,'overhead.png')});
  }else{
  await caption('Lower-body contact: a narrow leading edge');
  await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);
  await page.waitForTimeout(3000);await page.screenshot({path:path.join(out,'stronger-wake.png')});await page.waitForTimeout(6000);
  await caption('The trail persists while moving and rotating the camera');
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();
  await page.mouse.move(box.x+80,box.y+box.height-90);await page.mouse.down({button:'right'});
  for(let i=1;i<=100;i++){
    await page.mouse.move(box.x+80+i*8.4,box.y+box.height-90);await page.waitForTimeout(40);
    if([30,60,90].includes(i)){
      const data=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
      assert(Number(data.mistWakes)>0,'Rotation must not erase the moving trail');
      phases.push({text:`Orbit ${i}`,data});await page.screenshot({path:path.join(out,`angle-${i}.png`)});
    }
  }
  await page.mouse.up({button:'right'});await page.mouse.move(1410,945);await page.waitForTimeout(1600);
  await caption('Mist parts at his body; curls develop behind him');
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);await page.waitForTimeout(5400);
  await caption('Overhead: the mist gradually folds back into the trail');
  await page.getByRole('button',{name:'Overhead view',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.mouse.move(1410,945);
  await page.waitForTimeout(2500);await page.screenshot({path:path.join(out,'overhead-wake.png')});await page.waitForTimeout(6000);
  }
  assert.deepEqual(errors,[]);
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
const source=await page.video().path();
// Locate the visible start marker in actual encoded frames, not wall time.
// Startup and the encoder need not run at the same pace as the test process.
const pixels=execFileSync(ffmpeg,['-v','error','-i',source,'-vf','fps=25,crop=2:2:2:2,format=rgb24','-f','rawvideo','pipe:1']);
let frame=0;for(;frame<pixels.length/12;frame++)if(pixels[frame*12]>210&&pixels[frame*12+1]<40&&pixels[frame*12+2]>210)break;
assert(frame<pixels.length/12,'Recording start marker missing');
const start=frame/25,video=path.join(out,windColorStudy?'wind-color.mp4':varietyStudy?'environment-variety.mp4':stormStudy?'storm-environment.mp4':dungeonStudy?'dungeon-lanterns.mp4':torchStudy?'torches-and-lanterns.mp4':weatherStudy?'weather-lighting.mp4':'mist-orbit.mp4');
const crop=`crop=${Math.floor(box.width/2)*2}:${Math.floor(box.height/2)*2}:${Math.floor(box.x/2)*2}:${Math.floor(box.y/2)*2}`;
execFileSync(ffmpeg,['-y','-v','error','-ss',String(start),'-i',source,'-vf',crop,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-an','-movflags','+faststart',video],{windowsHide:true});
execFileSync(ffmpeg,['-y','-v','error','-ss','3','-i',video,'-frames:v','1',path.join(out,'poster.png')],{windowsHide:true});
if(weatherStudy){
  let torchFrame=frame;for(;torchFrame<pixels.length/12;torchFrame++)if(pixels[torchFrame*12]<40&&pixels[torchFrame*12+1]>210&&pixels[torchFrame*12+2]>210)break;
  assert(torchFrame<pixels.length/12,'Torch comparison marker missing');
  const torchStart=torchFrame/25-start;
  execFileSync(ffmpeg,['-y','-v','error','-ss',String(torchStart),'-i',video,'-t','17','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-an','-movflags','+faststart',path.join(out,'torch-lighting.mp4')],{windowsHide:true});
}
await writeFile(path.join(out,'recording.json'),JSON.stringify({status:'passed',video,bytes:(await stat(video)).size,source,start,box,phases,errors},null,2));
console.log(video);
