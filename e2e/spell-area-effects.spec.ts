import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('Fireball travels from its caster before one full-radius explosion; Call Lightning strikes stay inside the selected radius',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3,Box3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:100,y:100,diameter:40,event:{kind:'pc',refId:'mage',delta:0,spell:'Fireball',areaPosition:{mapId:'map',x:100,y:100,radiusFt:20},sourcePosition:{mapId:'map',x:0,y:100}}};
 const position=()=>({x:100,y:100,visible:true,height:6});effects.sync([event],0);
 const read=()=>{const root=scene.children[0],shape=root.children[1],front=shape.getObjectByName('fireball-continuous-front'),crest=shape.getObjectByName('fireball-flame-crest');root.updateMatrixWorld(true);return {orb:shape.children[0].visible,orbX:shape.children[0].getWorldPosition(new Vector3()).x,explosion:front.visible,frontRadius:front.scale.x*root.scale.x,crest:crest.visible,crestRadius:crest.scale.x*root.scale.x,fronts:shape.children.filter(m=>m.name==='fireball-continuous-front').length,parts:shape.children.length};};
 const lights=effects.tick(120,1,false,position),early=read();effects.tick(480,1,false,position);const late=read();effects.tick(980,1,false,position);const expanding=read();const explosionLights=effects.tick(1280,1,false,position);const exploded=read();effects.tick(2200,1,false,position);const expired=!effects.active;
 effects.sync([{...event,id:2,event:{kind:'pc',refId:'mage',delta:0,spell:'Call Lightning',areaPosition:{mapId:'map',x:100,y:100,radiusFt:5}},diameter:10}],2300);effects.tick(2500,1,false,position);
 const lightning=scene.children[0],shape=lightning.children[1];lightning.updateMatrixWorld(true);
 const positions=shape.children.map(m=>m.getWorldPosition(new Vector3())).map(p=>Math.hypot(p.x-100,p.z-100));
 window.result={early,late,expanding,exploded,expired,lights:lights.length,explosionLights:explosionLights.map(l=>Math.hypot(l.x-100,l.y-100)),maxRadius:Math.max(...positions),minRadius:Math.min(...positions),count:positions.length};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.orb).toBe(true);expect(r.early.orbX).toBeCloseTo(20);expect(r.early.explosion).toBe(false);
 expect(r.late.orbX).toBeCloseTo(80);expect(r.exploded.orb).toBe(false);expect(r.exploded.explosion).toBe(true);
 expect(r.exploded.frontRadius).toBeCloseTo(20);expect(r.expired).toBe(true);expect(r.lights).toBeGreaterThan(0);
 expect(r.expanding.frontRadius).toBeGreaterThan(10);expect(r.expanding.frontRadius).toBeLessThan(20);
 expect(r.exploded.fronts).toBe(1);expect(r.exploded.parts).toBe(17);
 expect(r.early.crest).toBe(false);expect(r.expanding.crest).toBe(true);
 expect(r.expanding.crestRadius).toBe(r.expanding.frontRadius);expect(r.exploded.crestRadius).toBe(r.exploded.frontRadius);
 expect(r.explosionLights).toHaveLength(3);for(const radius of r.explosionLights)expect(radius).toBeCloseTo(13);
 expect(r.count).toBe(14);expect(r.minRadius).toBe(0);expect(r.maxRadius).toBeGreaterThan(4);expect(r.maxRadius).toBeLessThan(5);
});

test('Fireball renders a filled dome from overhead and oblique views without shader errors',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,100),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(128,128);document.body.append(renderer.domElement);camera.layers.set(7);
 const effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:0,y:0,diameter:10,event:{kind:'pc',refId:'mage',delta:0,spell:'Fireball',areaPosition:{mapId:'map',x:0,y:0,radiusFt:5}}};effects.sync([event],0);
 const results=[];
 for(const [x,y,z,reduced] of [[0,16,.01,false],[0,12,12,false],[0,16,.01,true]]){
  camera.position.set(x,y,z);camera.lookAt(0,0,0);effects.tick(1120,1,reduced,()=>({x:0,y:0,visible:true,height:5}));renderer.render(scene,camera);
  const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(64,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);results.push({pixel:[...pixel],error:gl.getError()});
 }
 window.result=results;effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);expect(errors).toEqual([]);
 for(const view of r){expect(view.error).toBe(0);expect(view.pixel[3]).toBeGreaterThan(30);expect(view.pixel[0]).toBeGreaterThan(view.pixel[2]);}
});
