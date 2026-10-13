import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('six updated spell fields render in tilted, overhead and reduced views with bounded draw calls',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,Vector3,Matrix4} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(256,256);document.body.append(renderer.domElement);
 const camera=new PerspectiveCamera(45,1,.1,1000);camera.layers.set(7);const results=[];
 for(const [spell,diameter,age] of [['Cone of Cold',60,600],['Thunderwave',15,450],['Shatter',20,550],['Flame Strike',20,700],['Ice Knife',10,450],['Meteor Swarm',80,1650]]){
  const directed=spell==='Cone of Cold'||spell==='Thunderwave',event={id:spell,tokenId:'area',x:0,y:0,diameter,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell,areaPosition:{mapId:'map',x:0,y:0,radiusFt:diameter/2,...(directed?{end:{x:0,y:diameter}}:{})}}};
  effects.sync([event],0);
  for(const [top,reduced] of [[false,false],[true,false],[false,true]]){
   effects.tick(age,1,reduced,()=>({x:0,y:0,visible:true,height:6}));
   camera.position.set(top?0:diameter*.8,diameter*(top?2.5:1.8),top?.01:diameter*1.7);camera.lookAt(0,0,spell==='Cone of Cold'?30:0);renderer.render(scene,camera);
   const root=scene.children[0],shape=root.children[1];root.updateMatrixWorld(true);
   const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>5)colored++;
   const field=shape.children.find(m=>/field|continuous-front|cold-cone/.test(m.name)),splinters=shape.children.find(m=>/splinters|crystals/.test(m.name));
   results.push({spell,top,reduced,colored,error:gl.getError(),calls:renderer.info.render.calls,scale:field?.getWorldScale(new Vector3()).toArray(),count:splinters?.count});
  }
 }
 window.result=results;effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});const results=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);expect(results).toHaveLength(18);
 for(const r of results){expect(r.error,r.spell).toBe(0);expect(r.colored,r.spell).toBeGreaterThan(50);expect(r.calls).toBeLessThanOrEqual(r.spell==='Meteor Swarm'?17:4);}
 for(const name of ['Thunderwave','Shatter','Flame Strike','Ice Knife']){
  const r=results.filter((v:any)=>v.spell===name);expect(r.map((v:any)=>v.count)).toEqual([64,64,20]);
  expect(r[0].scale[0]).toBeCloseTo(name==='Thunderwave'?15:name==='Ice Knife'?10:20);
 }
});

test('Meteor Swarm reuses the Fireball dome with a larger projectile falling from the sky',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),position=()=>({x:0,y:0,visible:true,height:6});
 effects.sync([{id:1,tokenId:'area',x:0,y:0,diameter:80,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Meteor Swarm',areaPosition:{mapId:'map',x:0,y:0,radiusFt:40}}}],0);
 const read=()=>{const shape=scene.children[0].children[1],orb=shape.children[0],front=shape.getObjectByName('fireball-continuous-front');scene.updateMatrixWorld(true);return{height:orb.getWorldPosition(new Vector3()).y,orb:orb.visible,size:orb.getWorldScale(new Vector3()).x,dome:front.visible,radius:front.getWorldScale(new Vector3()).x,parts:shape.children.length};};
 effects.tick(90,1,false,position);const early=read();effects.tick(750,1,false,position);const late=read();effects.tick(1800,1,false,position);const blast=read();
 effects.tick(3100,1,false,position);window.result={early,late,blast,expired:!effects.active};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.height).toBeGreaterThan(80);expect(r.late.height).toBeLessThan(r.early.height/3);expect(r.early.size).toBeGreaterThan(4);
 expect(r.early.dome).toBe(false);expect(r.blast.dome).toBe(true);expect(r.blast.orb).toBe(false);expect(r.blast.radius).toBeCloseTo(40);expect(r.blast.parts).toBe(17);expect(r.expired).toBe(true);
});

test('Cone of Cold and Thunderwave retain the confirmed angle at different map scales',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3} from 'three';import {areaPolygon} from './shared/spellAreas';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),results=[];
 for(const [spell,size] of [['Cone of Cold',60],['Thunderwave',15]])for(const px of [1,4,20])for(const angle of [0,Math.PI/2,.73*Math.PI]){
  const origin={x:130,y:-20},event={id:1,tokenId:'area',...origin,diameter:size*px,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell,areaPosition:{mapId:'map',...origin,radiusFt:size/2,end:{x:origin.x+Math.cos(angle)*size*px,y:origin.y+Math.sin(angle)*size*px}}}};
  effects.sync([event],0);effects.tick(500,px,false,()=>({...origin,visible:true,height:6*px}));const shape=scene.children[0].children[1];scene.updateMatrixWorld(true);
  const cone=spell==='Cone of Cold',points=cone?[[0,0,0],[1,0,-.5],[1,0,.5]]:[[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5]];
  const actual=points.flatMap(p=>{const at=shape.localToWorld(new Vector3(...p));return [at.x,at.z]});
  results.push({actual,expected:areaPolygon({kind:cone?'cone':'cube',sizeFt:size,rangeFt:0},origin,angle,px)});
 }
 window.result=results;effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const r of await page.evaluate(()=>(window as any).result))r.actual.forEach((v:number,i:number)=>expect(v).toBeCloseTo(r.expected[i],5));
});
