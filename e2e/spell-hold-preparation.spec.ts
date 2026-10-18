import {test,expect} from './helpers/test';
import {build} from 'esbuild';

test('held spells warm detached GPU resources, reuse them on release, and keep their full visible lifetime',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,1000),renderer=new WebGLRenderer();renderer.setSize(64,64);camera.position.set(0,10,20);camera.lookAt(0,0,0);
 const effects=createSpellImpactEffects(scene),event={id:1,tokenId:'target',x:0,y:0,diameter:3,event:{kind:'monster',refId:'g',delta:-13,damageType:'fire',spell:'Fireball'}};
 const position=()=>({x:0,y:0,height:4,visible:true});
 window.effects=effects;window.release=()=>{effects.sync([event],6000);const light=effects.tick(6100,1,false,()=>({x:7,y:9,height:4,visible:true}));const root=scene.children.find(n=>n.name.startsWith('spell-impact-'));window.released={...effects.preparation,lights:light.length,x:root.position.x,y:root.position.z,active:effects.active};effects.tick(6200,1,false,position);window.alive=effects.active;effects.tick(12000,1,false,position);window.expired=!effects.active;effects.dispose();renderer.dispose();};
 effects.prepare([event],1000,1,false,position);effects.warm(renderer,camera);
 window.before={children:scene.children.length,lights:effects.tick(5000,1,false,position).length,active:effects.active};
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 expect(await page.evaluate(()=>(window as any).before)).toEqual({children:0,lights:0,active:false});
 await page.waitForFunction(()=>(window as any).effects.preparation.gpuWarmCount===1);
 await page.evaluate(()=>(window as any).release());
 const r=await page.evaluate(()=>({released:(window as any).released,alive:(window as any).alive,expired:(window as any).expired}));
 expect(r.released.built).toBe(1);expect(r.released.promoted).toBe(1);expect(r.released.pending).toBe(0);
 expect(r.released.lights).toBeGreaterThan(0);expect(r.released.x).toBe(7);expect(r.released.y).toBe(9);
 expect(r.released.active).toBe(true);expect(r.alive).toBe(true);expect(r.expired).toBe(true);
});

test('skip before or during shader warmup activates immediately and a late callback cannot hide or replay it',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 (async()=>{
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,1000),renderer=new WebGLRenderer();renderer.setSize(64,64);let finish;
 renderer.compileAsync=()=>new Promise(resolve=>finish=resolve);
 const effects=createSpellImpactEffects(scene),event={id:1,tokenId:'target',x:0,y:0,diameter:3,event:{kind:'monster',refId:'g',delta:-13,damageType:'fire',spell:'Fireball'}},position=()=>({x:0,y:0,height:4,visible:true});
 effects.prepare([event],1000,1,false,position);effects.warm(renderer,camera);
 effects.sync([event],1100);effects.tick(1200,1,false,position);const root=scene.children[0],before={visible:root.visible,...effects.preparation};
 finish(new Set());await Promise.resolve();await Promise.resolve();const after={visible:root.visible,...effects.preparation};
 const cold=createSpellImpactEffects(new Scene());cold.sync([{...event,id:2}],1200);const coldLight=cold.tick(1300,1,false,position).length;
 cold.dispose();effects.dispose();renderer.dispose();window.result={before,after,coldLight};
 })();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.waitForFunction(()=>(window as any).result);
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.before.visible).toBe(true);expect(r.before.promoted).toBe(1);expect(r.before.gpuWarmCount).toBe(0);
 expect(r.after).toEqual(r.before);expect(r.coldLight).toBeGreaterThan(0);
});
