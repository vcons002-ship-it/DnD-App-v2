import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

// Every spell recipe that customizes its material shader. Basic mesh/particle
// effects use the same visibility wrapper but have no custom shader to lose.
const cases=[
 {spell:'Fireball',size:40,age:1120,programs:[['fireball-volume-dome-v1','fireNoise','fireEye'],['fireball-combined-flame-front-v1','fireNoise','fireUv']]},
 {spell:'Meteor Swarm',size:80,age:1650,programs:[['fireball-volume-dome-v1','fireNoise','fireEye'],['fireball-combined-flame-front-v1','fireNoise','fireUv']]},
 {spell:'Lightning Bolt',size:100,age:120,directed:true,programs:[['linear-lightning-0','boltFront','boltPulse'],['linear-lightning-1','boltFront','boltPulse'],['linear-lightning-2','boltFront','boltPulse']]},
 {spell:'Burning Hands',size:15,age:650,directed:true,programs:[['elemental-folded-cone-false-0','flameNoise','flameReach'],['elemental-folded-cone-false-1','flameNoise','flameReach']]},
 {spell:'Cone of Cold',size:60,age:650,directed:true,programs:[['elemental-folded-cone-true-0','flameNoise','flameReach'],['elemental-folded-cone-true-1','flameNoise','flameReach']]},
 {spell:'Ice Storm',size:40,age:650,programs:[['ice-storm-faceted-v1','hailNormal','hailLocal'],['ice-storm-frost-v1','frostNoise','iceQuality']]},
 {spell:'Thunderwave',size:15,age:450,programs:[['area-impact-thunder-cube-v2','areaPhase','fieldNoise']]},
 {spell:'Shatter',size:20,age:550,programs:[['area-impact-shatter-area-v2','areaPhase','fieldNoise']]},
 {spell:'Flame Strike',size:20,age:700,programs:[['area-impact-flame-column-v2','areaClock','fieldNoise']]},
 {spell:'Ice Knife',size:10,age:450,programs:[['area-impact-ice-splash-v2','fractures','fieldNoise']]},
];

for(const cfg of cases)test(`${cfg.spell} preserves custom shading and clips correctly in overhead, tilted and reduced views`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,DataTexture,RedFormat} from 'three';
 import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const cfg=${JSON.stringify(cfg)},scene=new Scene(),effects=createSpellImpactEffects(scene),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});
 renderer.setSize(192,192);document.body.append(renderer.domElement);
 const camera=new PerspectiveCamera(45,1,.1,1000);camera.layers.set(7);
 effects.sync([{id:1,tokenId:'area',x:0,y:0,diameter:cfg.size,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:cfg.spell,areaPosition:{mapId:'m',x:0,y:0,radiusFt:cfg.size/2,...(cfg.directed?{end:{x:cfg.size,y:0}}:{})}}}],0);
 const cover=new DataTexture(new Uint8Array([0]),1,1,RedFormat),fog=new DataTexture(new Uint8Array(64),8,8,RedFormat);cover.needsUpdate=fog.needsUpdate=true;
 const gl=renderer.getContext(),pixels=new Uint8Array(192*192*4),paint=()=>{renderer.render(scene,camera);gl.readPixels(0,0,192,192,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>5)visible++;return visible;};
 const results=[];
 for(const [top,reduced] of [[false,false],[true,false],[false,true]]){
  const center=cfg.directed?cfg.size/2:0;
  camera.position.set(center+(top?0:cfg.size*.65),cfg.size*(top?2.5:1.8),top?.01:cfg.size*1.5);camera.lookAt(center,0,0);
  effects.setCoverClip(null);effects.setFogClip(null);effects.tick(cfg.age,1,reduced,()=>({x:0,y:0,visible:true,height:6}));
  const plain=paint(),calls=renderer.info.render.calls;
  const programs=renderer.info.programs.map(p=>({key:p.cacheKey,source:gl.getAttachedShaders(p.program).map(s=>gl.getShaderSource(s)).join(' '),clip:!!p.getUniforms().map.spellUseCover}));
  effects.setCoverClip({texture:cover,width:192,height:192});const unseen=paint();effects.setCoverClip(null);
  effects.setFogClip({texture:fog,originX:-4,originY:-4,cols:8,rows:8,grid:cfg.size});const fogged=paint();effects.setFogClip(null);const restored=paint();
  results.push({top,reduced,plain,calls,programs,unseen,fogged,restored,error:gl.getError()});
 }
 window.result=results;effects.dispose();cover.dispose();fog.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).result);expect(errors).toEqual([]);
 for(const r of result){
  expect(r.error).toBe(0);expect(r.plain).toBeGreaterThan(15);expect(r.calls).toBeLessThanOrEqual(17);
  expect(r.unseen).toBe(0);expect(r.fogged).toBe(0);expect(r.restored).toBe(r.plain);
  for(const [key,...markers] of cfg.programs)expect(r.programs.some((p:any)=>p.key.includes(key)&&p.clip&&markers.every(s=>p.source.includes(s))),`${cfg.spell}: ${key}, overhead=${r.top}, reduced=${r.reduced}`).toBe(true);
 }
 await test.info().attach('shader-audit',{body:JSON.stringify(result.map((r:any)=>({...r,programs:r.programs.map((p:any)=>({key:p.key,clip:p.clip}))})),null,2),contentType:'application/json'});
});
