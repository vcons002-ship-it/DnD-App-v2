import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('Fireball travels from its caster before one full-radius explosion; Call Lightning strikes stay inside the selected radius',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3,Box3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:100,y:100,diameter:40,event:{kind:'pc',refId:'mage',delta:0,spell:'Fireball',areaPosition:{mapId:'map',x:100,y:100,radiusFt:20},sourcePosition:{mapId:'map',x:0,y:100}}};
 const position=()=>({x:100,y:100,visible:true,height:6});effects.sync([event],0);
 const read=()=>{const root=scene.children[0],shape=root.children[1];root.updateMatrixWorld(true);return {orb:shape.children[0].visible,orbX:shape.children[0].getWorldPosition(new Vector3()).x,explosion:shape.children[15].visible,frontRadius:shape.children.at(-1).scale.x*root.scale.x};};
 const lights=effects.tick(120,1,false,position),early=read();effects.tick(480,1,false,position);const late=read();effects.tick(980,1,false,position);const exploded=read();effects.tick(2200,1,false,position);const expired=!effects.active;
 effects.sync([{...event,id:2,event:{kind:'pc',refId:'mage',delta:0,spell:'Call Lightning',areaPosition:{mapId:'map',x:100,y:100,radiusFt:5}},diameter:10}],2300);effects.tick(2500,1,false,position);
 const lightning=scene.children[0],shape=lightning.children[1];lightning.updateMatrixWorld(true);
 const positions=shape.children.map(m=>m.getWorldPosition(new Vector3())).map(p=>Math.hypot(p.x-100,p.z-100));
 window.result={early,late,exploded,expired,lights:lights.length,maxRadius:Math.max(...positions),minRadius:Math.min(...positions),count:positions.length};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.orb).toBe(true);expect(r.early.orbX).toBeCloseTo(20);expect(r.early.explosion).toBe(false);
 expect(r.late.orbX).toBeCloseTo(80);expect(r.exploded.orb).toBe(false);expect(r.exploded.explosion).toBe(true);
 expect(r.exploded.frontRadius).toBeCloseTo(20);expect(r.expired).toBe(true);expect(r.lights).toBeGreaterThan(0);
 expect(r.count).toBe(14);expect(r.minRadius).toBe(0);expect(r.maxRadius).toBeGreaterThan(4);expect(r.maxRadius).toBeLessThan(5);
});
