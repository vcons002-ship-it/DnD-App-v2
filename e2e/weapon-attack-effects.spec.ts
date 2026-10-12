import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('weapon projectiles arrive before feedback, leave no light sources, and obey visibility',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 import {scheduleHpFeedback} from './client/src/lib/hpFeedback';
 const event={id:1,kind:'monster',refId:'victim',delta:-12,weaponAttack:{kind:'arrow'},sourcePosition:{mapId:'map',x:-30,y:0}};
 const plan=scheduleHpFeedback([event],1000),scene=new Scene(),effects=createSpellImpactEffects(scene);
 effects.sync([{id:1,tokenId:'victim',x:0,y:0,diameter:3,event,startAt:plan.events[0].numberStartAt,weaponOnly:true}],1000);
 const read=()=>{const root=scene.children[0];root.updateMatrixWorld(true);const arrow=root.getObjectByName('weapon-projectile'),contact=root.getObjectByName('weapon-contact');return {visible:arrow.visible,x:arrow.getWorldPosition(new Vector3()).x,contact:contact.visible};};
 const pos=()=>({x:0,y:0,visible:true,height:5});const lights=effects.tick(1100,1,false,pos);const early=read();effects.tick(1350,1,false,pos);const late=read();effects.tick(1425,1,false,pos);const impact=read();
 effects.tick(1450,1,false,()=>({x:0,y:0,visible:false}));const hidden=!scene.children[0].visible;effects.tick(2200,1,false,pos);
 window.result={early,late,impact,lights:lights.length,hidden,expired:!effects.active,numberStart:plan.events[0].componentStarts[0],effectStart:plan.events[0].numberStartAt};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.visible).toBe(true);expect(r.early.x).toBeLessThan(-20);expect(r.early.contact).toBe(false);
 expect(r.late.x).toBeGreaterThan(r.early.x);expect(r.late.x).toBeLessThan(0);
 expect(r.impact.visible).toBe(false);expect(r.impact.contact).toBe(true);expect(r.numberStart).toBe(1420);expect(r.effectStart).toBe(1000);
 expect(r.lights).toBe(0);expect(r.hidden).toBe(true);expect(r.expired).toBe(true);
});

test('physical shapes render in overhead and tilted views and coexist with spell riders',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,100),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(128,128);camera.layers.set(7);document.body.append(renderer.domElement);
 const body=new Mesh(new BoxGeometry(1.8,4,1.8),new MeshBasicMaterial({color:'#102030'}));body.position.y=2;body.layers.set(7);scene.add(body);
 const effects=createSpellImpactEffects(scene),out=[];
 for(const kind of ['slash','blunt','thrust','arrow','bolt','stone','thrown'])for(const top of [false,true]){
  effects.sync([],0);const event={kind:'monster',refId:'victim',delta:-12,weaponAttack:{kind},sourcePosition:{mapId:'map',x:-10,y:0}};
  effects.sync([{id:kind+top,tokenId:'victim',x:0,y:0,diameter:3,event,weaponOnly:true}],0);
  effects.tick(['slash','blunt','thrust'].includes(kind)?150:500,1,top,()=>({x:0,y:0,visible:true,height:4}));camera.position.set(0,top?9:7,top?.01:7);camera.lookAt(0,1,0);effects.faceCamera(camera);renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);out.push({kind,top,pixels:pixels.filter((v,i)=>i%4===0&&v>180&&pixels[i+1]>180&&pixels[i+2]>180).length,error:gl.getError()});
 }
 effects.sync([],0);const event={kind:'monster',refId:'victim',delta:-12,weaponAttack:{kind:'slash'},spell:"Hunter's Mark"};effects.sync([{id:'physical',tokenId:'victim',x:0,y:0,diameter:3,event,weaponOnly:true},{id:'mark',tokenId:'victim',x:0,y:0,diameter:3,event}],0);effects.tick(200,1,false,()=>({x:0,y:0,visible:true,height:4}));
 window.result={out,kinds:effects.kinds};effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);expect(errors).toEqual([]);
 for(const view of r.out){expect(view.error).toBe(0);expect(view.pixels,JSON.stringify(view)).toBeGreaterThan(0);}
 expect(r.kinds).toEqual(['weapon-slash','mark']);
});
