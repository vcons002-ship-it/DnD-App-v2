import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import sharp from 'sharp';

test('default spell illumination restores color grading locally without uncovering terrain or retaining light after expiry',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {PlayerVisionOverlay} from './client/src/canvas/PlayerVisionOverlay';
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container),ref=React.createRef();
 flushSync(()=>root.render(React.createElement(PlayerVisionOverlay,{ref,width:700,height:500,view:{x:0,y:0,scale:1},tilt:45,rotation:30,mapFogOfWar:true,
 vision:{daylight:false,rangeFt:60,radius:160,heavy:true,origins:[{id:'pc',x:180,y:160}],lights:[],walls:[{id:'wall',kind:'rectangle',ax:300,ay:0,bx:312,by:500}]}})));
 const before=ref.current.cover(),mask=container.querySelector('[id^="vision-cover-"]').innerHTML;
 ref.current.prepareLights([{id:'spell',x:220,y:160,height:50,radius:100,strength:3,transient:true}]);
 const heldInvisible=container.querySelectorAll('[id^="vision-shade-"] ellipse').length===0;
 ref.current.lights([{id:'spell',x:220,y:160,height:50,radius:100,strength:3,transient:true}]);ref.current.cover();
 const count=container.querySelectorAll('[id^="vision-shade-"] ellipse').length,clip=container.querySelector('[id^="vision-shade-"] g[clip-path]')?.getAttribute('clip-path');
 const during=ref.current.cover(),sameCover=mask===container.querySelector('[id^="vision-cover-"]').innerHTML;
 ref.current.lights([]);ref.current.cover();
 window.result={heldInvisible,count,clip,sameCover,transientSight:during.lights.some(l=>l.source.transient),sameOrigins:JSON.stringify(before.origins)===JSON.stringify(during.origins),remaining:container.querySelectorAll('[id^="vision-shade-"] ellipse').length};root.unmount();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.heldInvisible).toBe(true);expect(r.count).toBeGreaterThan(0);expect(r.clip).toContain('url(');
 expect(r.sameCover).toBe(true);expect(r.sameOrigins).toBe(true);expect(r.transientSight).toBe(false);expect(r.remaining).toBe(0);
});

test('ordinary light bands preserve attenuation and reuse projected geometry and clips through flicker',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {createVisionLightMask} from './client/src/canvas/visionLightMask';
 import {createVisionLightProjector} from './client/src/canvas/visionLightEllipse';
 import {lightCoverage} from './shared/playerVision';
 import {LIGHT_SPILL_MULTIPLIER} from './shared/lightFalloff';
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('width','700');svg.setAttribute('height','500');
 const defs=document.createElementNS(ns,'defs'),g=document.createElementNS(ns,'g');svg.append(defs,g);document.body.append(svg);
 const retained=createVisionLightMask(g,defs,'test'),results=[];
 const raster=async(markup)=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="'+ns+'" width="700" height="500">'+markup+'</svg>');await image.decode();const c=document.createElement('canvas');c.width=700;c.height=500;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,700,500).data;};
 (async()=>{
 for(const tilt of [0,45])for(const strength of [0,.005,.15,1,3]){
  const light={id:'flash',x:240,y:180,radius:110,height:60,strength,transient:true};
  const ellipse=createVisionLightProjector({x:130,y:90,scale:1},tilt,37,700,500);
  const projection={key:''+tilt,wallsKey:'[]',occluded:false,ellipse,circle:()=>'',clip:()=>''};
  retained.sync([light],projection);
  let previous=0,old='';
  for(let i=48;i>=1;i--){const r=light.radius*LIGHT_SPILL_MULTIPLIER*i/48,coverage=lightCoverage(r-light.radius/64,light),alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
   if(alpha>.0001){const e=ellipse(light.x,light.y,r);old+='<ellipse fill="black" fill-opacity="'+alpha.toFixed(4)+'" cx="'+e.cx.toFixed(2)+'" cy="'+e.cy.toFixed(2)+'" rx="'+e.rx.toFixed(2)+'" ry="'+e.ry.toFixed(2)+'" transform="rotate('+e.rotation.toFixed(4)+' '+e.cx.toFixed(2)+' '+e.cy.toFixed(2)+')"/>';}}
  const [a,b]=await Promise.all([raster(g.innerHTML),raster(old)]);let max=0,diff=0;for(let i=0;i<a.length;i++){max=Math.max(max,Math.abs(a[i]-b[i]));diff+=Math.abs(a[i]-b[i]);}results.push({tilt,strength,max,diff});
 }
 const p={key:'fixed',wallsKey:'wall',occluded:true,ellipse:()=>({cx:50,cy:50,rx:40,ry:40,rotation:0}),circle:()=>'',clip:l=>'M0,0L'+l.x+',0L'+l.x+',100Z'};
 const l={id:'same',x:80,y:50,radius:40,height:20,strength:1,transient:true};retained.sync([l],p);const nodes=[...g.querySelectorAll('ellipse')],clipNode=defs.querySelector('path'),clip=clipNode.getAttribute('d'),before=retained.stats;
 for(let i=0;i<10;i++)retained.sync([l],p);const stable=nodes.every((n,i)=>g.querySelectorAll('ellipse')[i]===n);
 for(let i=0;i<20;i++)retained.sync([{...l,strength:.2+i*.1}],p);
 const reused=stable&&defs.querySelector('path')===clipNode,after=retained.stats;
 retained.sync([{...l,x:90}],p);const moved=defs.querySelector('path').getAttribute('d')!==clip;
 // Changing ellipse/path representation must preserve the attenuation too.
 retained.sync([{...l,x:90}],{...p,key:'fallback',ellipse:()=>undefined,circle:()=> 'M0,0L100,0L100,100Z'});
 const fallback=g.querySelectorAll('path').length>0&&[...g.querySelectorAll('path')].every(n=>n.hasAttribute('fill-opacity'));
 let projections=0;retained.sync([{...l,id:'dark',strength:.001}],{...p,ellipse:()=>{projections++;return p.ellipse();},clip:()=>{projections++;return '';}});const invisible=g.childElementCount===0&&projections===0;
 retained.sync([],p);window.maskResult={results,reused,before,after,moved,fallback,invisible,remaining:g.childElementCount,clips:defs.childElementCount};retained.dispose();
 })().catch(e=>window.maskError=e.message);
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.waitForFunction(()=>(window as any).maskResult||(window as any).maskError);
 expect(await page.evaluate(()=>(window as any).maskError)).toBeUndefined();
 const result=await page.evaluate(()=>(window as any).maskResult);
 for(const sample of result.results)expect(sample.max,JSON.stringify(sample)).toBeLessThanOrEqual(1);
 expect(result.reused).toBe(true);expect(result.after.geometryUpdates).toBe(result.before.geometryUpdates);
 expect(result.invisible).toBe(true);expect(result.moved).toBe(true);expect(result.fallback).toBe(true);expect(result.remaining).toBe(0);expect(result.clips).toBe(0);
});

test('colored spell overlay stays above darkvision, is clipped at walls and clears after the flash',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {Vector3} from 'three';import {PlayerVisionOverlay} from './client/src/canvas/PlayerVisionOverlay';import {createSpellColorOverlay} from './client/src/canvas/spellColorOverlay';
 document.body.style.margin='0';
 const container=document.createElement('div');container.style.cssText='position:relative;width:700px;height:500px;background:#303030';document.body.append(container);
 const root=createRoot(container),ref=React.createRef();let overlay;
 window.setFlashMode=heavy=>{overlay?.dispose();flushSync(()=>root.render(React.createElement(PlayerVisionOverlay,{ref,width:700,height:500,view:{x:0,y:0,scale:1},tilt:0,rotation:0,mapFogOfWar:true,spellLighting:false,
 vision:{daylight:false,rangeFt:60,radius:160,heavy,origins:[{id:'pc',x:180,y:160}],lights:[],walls:[{id:'wall',kind:'rectangle',ax:300,ay:0,bx:312,by:500}]}})));overlay=createSpellColorOverlay(container);};
 window.flash=on=>overlay.draw(on?[{id:'flash',x:270,y:160,height:50,radius:150,strength:3,color:new Vector3(1,0,0),visibleTorch:false,transient:true}]:[],{x:0,y:0,scale:1},0,0,700,500);
 `}});
 await page.setViewportSize({width:700,height:500});await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const pixels=async()=>{const png=await page.screenshot();return sharp(png).removeAlpha().raw().toBuffer();};
 for(const heavy of [false,true]){
  await page.evaluate(h=>(window as any).setFlashMode(h),heavy);const before=await pixels();
  const originalMask=await page.locator('[id^="vision-cover-"]').innerHTML();
  await page.evaluate(()=>(window as any).flash(true));const flash=await pixels();
  const pixel=(data:Buffer,x:number,y:number)=>[...data.subarray((y*700+x)*3,(y*700+x)*3+3)];
  const visibleBefore=pixel(before,265,160),visibleFlash=pixel(flash,265,160);
  expect(visibleFlash[0]-visibleBefore[0]).toBeGreaterThan(25);
  expect(visibleFlash[0]-visibleFlash[1]).toBeGreaterThan(25);
  expect(pixel(flash,340,160)).toEqual(pixel(before,340,160));
  expect(await page.locator('[id^="vision-cover-"]').innerHTML()).toBe(originalMask);
  await page.evaluate(()=>(window as any).flash(false));const after=await pixels();
  expect(pixel(after,265,160)).toEqual(visibleBefore);
 }
});

test('spell flashes cannot change darkvision, sight or exploration; ordinary lights, camera and movement still update',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {PlayerVisionOverlay} from './client/src/canvas/PlayerVisionOverlay';
 let now=500;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container),ref=React.createRef();
 const lamp={id:'lamp',x:160,y:140,height:60,radius:90,strength:1};
 const vision={rangeFt:60,radius:160,heavy:true,origins:[{id:'pc',x:180,y:160}],lights:[lamp],walls:[{id:'wall',kind:'rectangle',ax:300,ay:20,bx:312,by:220}]};
 const props={width:700,height:500,view:{x:160,y:100,scale:1},tilt:45,rotation:0,vision,mapFogOfWar:true,spellLighting:false};
 flushSync(()=>root.render(React.createElement(PlayerVisionOverlay,{...props,ref})));
 const initial=ref.current.cover(),base=Number(container.firstChild.dataset.visionBaseDrawCount),paths=container.querySelector('[id^="vision-cover-"]').innerHTML;
 let same=0;
 for(let i=0;i<20;i++){now+=16;const before=ref.current.cover();ref.current.lights([lamp,{id:'spell',x:200+i,y:150,height:50,radius:90,strength:1+i*.1,transient:true}]);const after=ref.current.cover();if(after===before)same++;}
 const end=Number(container.firstChild.dataset.visionBaseDrawCount),unchanged=paths===container.querySelector('[id^="vision-cover-"]').innerHTML;
 const beforeLamp=ref.current.cover();ref.current.lights([{...lamp,strength:2}]);const changedLamp=ref.current.cover()!==beforeLamp;
 const beforeMove=ref.current.cover();ref.current.move('pc',220,160);const moved=ref.current.cover()!==beforeMove;
 const oldPaths=[...container.querySelectorAll('ellipse')].map(n=>n.getAttribute('transform')).join(',');ref.current.camera({rotation:60});
 const camera=oldPaths!==[...container.querySelectorAll('ellipse')].map(n=>n.getAttribute('transform')).join(',');
 ref.current.lights([lamp]);ref.current.cover();const expired=container.querySelectorAll('[id^="vision-spell-"]').length===0;
 window.flashResult={same,baseDraws:end-base,unchanged,changedLamp,moved,camera,expired,hasTransient:initial.lights.some(l=>l.source.transient)};root.unmount();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).flashResult);
 expect(r.same).toBe(20);expect(r.baseDraws).toBe(0);
 expect(r.unchanged).toBe(true);expect(r.changedLamp).toBe(true);expect(r.moved).toBe(true);expect(r.camera).toBe(true);expect(r.expired).toBe(true);expect(r.hasTransient).toBe(false);
});
