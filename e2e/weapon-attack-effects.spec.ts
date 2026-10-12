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
 const pos=()=>({x:0,y:0,visible:true,height:5});const lights=effects.tick(1100,1,false,pos);const early=read();effects.tick(1300,1,false,pos);const late=read();effects.tick(1345,1,false,pos);const impact=read();
 effects.tick(1450,1,false,()=>({x:0,y:0,visible:false}));const hidden=!scene.children[0].visible;effects.tick(2500,1,false,pos);
 window.result={early,late,impact,lights:lights.length,hidden,expired:!effects.active,numberStart:plan.events[0].componentStarts[0],effectStart:plan.events[0].numberStartAt};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.visible).toBe(true);expect(r.early.x).toBeLessThan(-20);expect(r.early.contact).toBe(false);
 expect(r.late.x).toBeGreaterThan(r.early.x);expect(r.late.x).toBeLessThan(0);
 expect(r.impact.visible).toBe(false);expect(r.impact.contact).toBe(true);expect(r.numberStart).toBe(1340);expect(r.effectStart).toBe(1000);
 expect(r.lights).toBe(0);expect(r.hidden).toBe(true);expect(r.expired).toBe(true);
});

test('physical shapes render in overhead and tilted views and coexist with spell riders',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,100),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(128,128);camera.layers.set(7);document.body.append(renderer.domElement);
 const body=new Mesh(new BoxGeometry(1.8,4,1.8),new MeshBasicMaterial({color:'#102030'}));body.position.y=2;body.layers.set(7);scene.add(body);
 const effects=createSpellImpactEffects(scene),out=[];
 for(const kind of ['slash','blunt','thrust','arrow','bolt','stone','thrown','axe','knife','spear','trident','hammer','dart','bullet','whip','claw','bite'])for(const top of [false,true]){
  effects.sync([],0);const event={kind:'monster',refId:'victim',delta:-12,weaponAttack:{kind},sourcePosition:{mapId:'map',x:-5,y:0}};
  effects.sync([{id:kind+top,tokenId:'victim',x:0,y:0,diameter:3,event,weaponOnly:true}],0);
  // Pull the overhead camera back to include the expanded impact debris.
  effects.tick(['slash','blunt','thrust','whip','claw','bite'].includes(kind)?400:250,1,top,()=>({x:0,y:0,visible:true,height:4}));camera.position.set(0,top?14:7,top?.01:7);camera.lookAt(0,1,0);effects.faceCamera(camera);renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);out.push({kind,top,pixels:pixels.filter((v,i)=>i%4===0&&v>120&&pixels[i+1]>90&&pixels[i+2]>60).length,error:gl.getError()});
 }
 effects.sync([],0);const event={kind:'monster',refId:'victim',delta:-12,weaponAttack:{kind:'slash'},spell:"Hunter's Mark"};effects.sync([{id:'physical',tokenId:'victim',x:0,y:0,diameter:3,event,weaponOnly:true},{id:'mark',tokenId:'victim',x:0,y:0,diameter:3,event}],0);effects.tick(200,1,false,()=>({x:0,y:0,visible:true,height:4}));
 window.result={out,kinds:effects.kinds};effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);expect(errors).toEqual([]);
 for(const view of r.out){expect(view.error).toBe(0);expect(view.pixels,JSON.stringify(view)).toBeGreaterThan(0);}
 expect(r.kinds).toEqual(['weapon-slash','mark']);
});

test('melee mirrors stay stable, axes tumble in the flight plane, and shards use two batches',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Vector3,MeshBasicMaterial} from 'three';import {createWeaponAttackGeometry} from './client/src/canvas/weaponAttackGeometry';
 import {weaponImpactStyle} from './shared/spellImpact';import {WEAPON_FLIGHT_MS} from './shared/weaponImpact';
 const shapes=createWeaponAttackGeometry(),mat=new MeshBasicMaterial(),original=Math.random;
 const make=kind=>shapes.build(weaponImpactStyle({weaponAttack:{kind},delta:-5}),mat,mat,mat);
 Math.random=()=>0;const left=make('slash');Math.random=()=>.99;const right=make('thrust');const axe=make('axe');Math.random=original;
 const mirrors=[left.root.userData.meleeMirror,right.root.userData.meleeMirror];left.update(.2,false,false,0);right.update(.4,false,false,0);
 const stable=[left.root.userData.meleeMirror,right.root.userData.meleeMirror];
 const source=new Vector3(-4,1,0),dir=new Vector3(0,.87,0).sub(source).normalize();axe.update(WEAPON_FLIGHT_MS/1250*.999,false,false,0,source);
 const projectile=axe.root.getObjectByName('weapon-projectile'),axis=new Vector3(0,0,1).applyQuaternion(projectile.quaternion),edge=new Vector3(1,0,0).applyQuaternion(projectile.quaternion);
 const handle=axe.root.getObjectByName('weapon-axe-handle'),batches=left.parts.filter(p=>p.isInstancedMesh);
 window.result={mirrors,stable,spinAlongFlight:Math.abs(axis.dot(dir)),edgeForward:edge.dot(dir),handle:handle.material.color.getHexString(),batches:batches.length,shards:batches.reduce((n,m)=>n+m.count,0)};
 [left,right,axe].forEach(s=>{s.materials.forEach(m=>m.dispose());s.root.traverse(n=>{if(n.isInstancedMesh)n.dispose()})});mat.dispose();shapes.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.mirrors).toEqual([-1,1]);expect(r.stable).toEqual(r.mirrors);expect(r.spinAlongFlight).toBeLessThan(.001);expect(r.edgeForward).toBeGreaterThan(.99);expect(r.handle).toBe('70401f');expect(r.batches).toBe(2);expect(r.shards).toBe(12);
});

test('repeated weapon bursts release instances and retain a fixed shared geometry budget',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,100),renderer=new WebGLRenderer();renderer.setSize(64,64);camera.layers.set(7);camera.position.set(0,14,7);camera.lookAt(0,1,0);
 const effects=createSpellImpactEffects(scene),geometries=[],calls=[];
 for(let cycle=0;cycle<12;cycle++){
  const now=cycle*2000,inputs=['slash','axe','thrust','blunt','arrow','claw'].map((kind,i)=>({id:cycle+'-'+i,tokenId:'target',x:0,y:0,diameter:3,weaponOnly:true,event:{kind:'monster',refId:'target',delta:-5,weaponAttack:{kind},sourcePosition:{mapId:'map',x:-5,y:0}}}));
  effects.sync(inputs,now);effects.tick(now+500,1,false,()=>({x:0,y:0,height:4,visible:true}));effects.faceCamera(camera);renderer.render(scene,camera);geometries.push(renderer.info.memory.geometries);calls.push(renderer.info.render.calls);
  effects.tick(now+1600,1,false,()=>({x:0,y:0,height:4,visible:true}));if(scene.children.length)throw Error('Expired effects retained');
 }
 effects.dispose();window.result={geometries,calls,remaining:renderer.info.memory.geometries,active:effects.active};renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(new Set(r.geometries).size).toBe(1);expect(r.remaining).toBe(0);expect(r.active).toBe(false);expect(Math.max(...r.calls)).toBeLessThan(60);
});
