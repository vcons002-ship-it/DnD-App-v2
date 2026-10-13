import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './directAv1Recorder';

// Study only: static posters use the real app; decoded video replaces their
// Konva image in this test browser. No production media schema is changed.
test.skip(!process.env.DND_ANIMATED_MAP_STUDY,'Opt-in animated map feasibility recording');
test('three downloaded animated maps under real 3D tokens',async({browser,request})=>{
  test.setTimeout(240000);
  const root=process.env.DND_ANIMATED_MAP_STUDY!,out=process.env.DND_ANIMATED_MAP_STUDY_OUT??root+'/review';mkdirSync(out,{recursive:true});
  const sources=JSON.parse(readFileSync(root+'/sources.json','utf8'));
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Animated map prototype'}})).json();
  const admin=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
  const snapshot=async()=>{const r=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
  const first=await snapshot(),maps=[];
  const positions=[[[1050,400],[1120,550],[1080,660]],[[650,440],[750,380],[860,250]],[[1370,360],[1440,510],[1350,720]]];
  for(const [index,source] of sources.entries()){
    const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:source.title+' — animated study',image:{name:source.name+'.jpg',mimeType:'image/jpeg',buffer:readFileSync(root+'/'+source.name+'-inspect.jpg')}}})).json();
    maps.push(map);admin.emit('map:setGrid',{mapId:map.id,gridSizePx:96,feetPerSquare:5,widthFt:100,locked:false});
    for(const layer of ['map','tokens']){admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});admin.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
    for(const [i,name] of ['Druk','Varis','Vanec'].entries())admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:first.characters.find((c:any)=>c.name===name).id,x:positions[index][i][0],y:positions[index][i][1]});
  }
  admin.emit('map:setActive',{mapId:maps[0].id});await snapshot();
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1}),page=await context.newPage();
  const errors:string[]=[],chapters:any[]=[],observations:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/animated-study/*.mp4',async route=>{
    const file=new URL(route.request().url()).pathname.split('/').pop()!;
    const source=sources.find((s:any)=>file===s.name+'-sample.mp4');if(!source){await route.abort();return;}
    await route.fulfill({path:root+'/'+file,contentType:'video/mp4',headers:{'cache-control':'public, max-age=86400'}});
  });
  await page.addInitScript(()=>localStorage.setItem('dnd-environment-quality','balanced'));
  let capture:Awaited<ReturnType<typeof startAv1Capture>>|undefined;
  const title='Animated Battle Maps Prototype';
  const click=async(name:string)=>{const button=page.getByRole('button',{name,exact:true});const b=(await button.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.waitForTimeout(250);await button.click();};
  const caption=async(text:string)=>page.evaluate(text=>{document.getElementById('animated-study-title')!.textContent=text;},text);
  const attachVideo=async(index:number)=>{
    await expect.poll(()=>page.evaluate(path=>(window as any).Konva.stages.some((s:any)=>s.find('Image').some((n:any)=>n.image()?.src?.endsWith(path))),maps[index].imagePath)).toBe(true);
    await page.evaluate(async({source,mapPath})=>{
      const w=window as any;w.__animatedStudy?.stop();
      const stage=w.Konva.stages.find((s:any)=>s.find('Image').some((n:any)=>n.image()?.src?.endsWith(mapPath)));
      const image=stage.find('Image').find((n:any)=>n.image()?.src?.endsWith(mapPath)),poster=image.image(),layer=image.getLayer();
      const video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.src='/animated-study/'+source.name+'-sample.mp4';
      video.style.cssText='position:fixed;left:-2px;top:-2px;width:1px;height:1px;pointer-events:none';document.body.append(video);
      await new Promise<void>((resolve,reject)=>{video.addEventListener('loadeddata',()=>resolve(),{once:true});video.addEventListener('error',()=>reject(new Error('Video decoding failed')),{once:true});});
      image.image(video);let running=true,painted=0;
      const draw=()=>{if(!running)return;painted++;layer.batchDraw();video.requestVideoFrameCallback(draw);};
      video.requestVideoFrameCallback(draw);await video.play();
      w.__animatedStudy={video,stats:()=>({painted,time:video.currentTime,quality:video.getVideoPlaybackQuality().toJSON?.()??{total:video.getVideoPlaybackQuality().totalVideoFrames,dropped:video.getVideoPlaybackQuality().droppedVideoFrames}}),stop:()=>{if(!running)return;running=false;video.pause();if(image.image()===video)image.image(poster);layer.batchDraw();video.remove();}};
      document.getElementById('animated-study-pause')!.textContent='Pause map';
    },{source:sources[index],mapPath:maps[index].imagePath});
  };
  try{
    await page.goto(`http://localhost:${PORT}/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','3',{timeout:90000});
    await page.getByRole('button',{name:'Collapse combat',exact:true}).click();
    await page.evaluate(title=>{
      document.title=title;
      const overlay=document.createElement('div');overlay.id='animated-study-caption';overlay.style.cssText='position:fixed;top:128px;left:50%;transform:translateX(-50%);z-index:99;background:#10151de8;color:#ecd6a9;border:1px solid #a48a59;border-radius:6px;padding:9px 16px;text-align:center;font:16px Georgia;pointer-events:none';
      overlay.innerHTML='<div id="animated-study-title"></div><small style="display:block;color:#bdb7a8;margin-top:5px">Prototype · map art by Domille’s Wondrous Works · real app tokens</small><button id="animated-study-pause" style="pointer-events:auto;margin-top:6px;padding:5px 12px;background:#30323a;color:#ecd6a9;border:1px solid #806d4c;border-radius:4px">Pause map</button>';
      document.body.append(overlay);document.getElementById('animated-study-pause')!.onclick=()=>{const v=(window as any).__animatedStudy?.video;if(!v)return;if(v.paused){void v.play();document.getElementById('animated-study-pause')!.textContent='Pause map';}else{v.pause();document.getElementById('animated-study-pause')!.textContent='Resume map';}};
    },title);
    await attachVideo(0);await caption('Ritual Temple · overhead · animated background');await click('Fit');await page.waitForTimeout(1800);
    capture=await startAv1Capture(page,out+'/animated-maps-av1.mp4',{title,width:1600,height:1084});
    for(let index=0;index<maps.length;index++){
      if(index){await page.evaluate(()=>{(window as any).__animatedStudy?.stop();});admin.emit('map:setActive',{mapId:maps[index].id});await expect(page.locator('.active-map')).toContainText(sources[index].title);await click('Flat battlefield view');await click('Fit');await page.waitForTimeout(600);await attachVideo(index);}
      chapters.push({title:sources[index].title,time:(Date.now()-capture.startedAt)/1000,source:sources[index].source});
      await caption(sources[index].title+' · overhead · animated background');await page.waitForTimeout(4200);
      // Never take still screenshots while Windows Graphics Capture is recording.
      await click('Tilted battlefield view');await caption(sources[index].title+' · 45° · same map plane');await page.waitForTimeout(4000);
      // Still images can be extracted from the finished video.
      await page.getByTitle('Zoom in',{exact:true}).click();await caption(sources[index].title+' · closer view · 3D party');await page.waitForTimeout(2200);
      await click('Flat battlefield view');await click('Fit');await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees','0');
      await click('Pause map');await caption(sources[index].title+' · paused background · tokens remain usable');
      const state=await snapshot(),druk=state.tokens.find((t:any)=>t.mapId===maps[index].id&&t.refId===first.characters.find((c:any)=>c.name==='Druk').id);
      const point=await page.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=stage.container().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},druk.id);
      await page.mouse.move(point.x,point.y,{steps:10});await page.mouse.down();await page.mouse.move(point.x+70,point.y+20,{steps:25});await page.mouse.up();
      await expect.poll(async()=>(await snapshot()).tokens.find((t:any)=>t.id===druk.id).x).not.toBe(druk.x);await page.waitForTimeout(1600);
      const paused=await page.evaluate(()=>(window as any).__animatedStudy.video.paused);expect(paused).toBe(true);
      await click('Resume map');await caption(sources[index].title+' · resumed · video and tokens are separate');await page.waitForTimeout(2300);
      const stats=await page.evaluate(()=>(window as any).__animatedStudy.stats());expect(stats.painted).toBeGreaterThan(100);observations.push({name:sources[index].name,...stats});
    }
    await capture.stop();capture=undefined;
    expect(errors).toEqual([]);writeFileSync(out+'/receipt.json',JSON.stringify({scope:'Browser-injected animated map prototype; not production support',sources,chapters,observations,errors,recording:'Windows Graphics Capture / RTX 5090 NVENC AV1'},null,2));
  }finally{if(capture)await capture.stop();admin.disconnect();await context.close();}
});
