import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import sharp from 'sharp';

test('GPU sight compositor preserves raised bodies, clips distant light to sight, and reuses unchanged masks',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 const renderer=new T.WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(100,100);renderer.setClearColor(0,0);
 const host=document.createElement('div');document.body.appendChild(host);host.appendChild(renderer.domElement);
 const bodyBytes=new Uint8Array(100*100*4);
 for(let y=45;y<55;y++)for(let x=75;x<85;x++){const i=(y*100+x)*4;bodyBytes[i]=bodyBytes[i+1]=bodyBytes[i+2]=bodyBytes[i+3]=255;}
 // A shared-only silhouette must not be restored as personal sight.
 for(let y=65;y<75;y++)for(let x=75;x<85;x++){const i=(y*100+x)*4;bodyBytes[i+1]=bodyBytes[i+2]=bodyBytes[i+3]=255;}
 const body=new T.DataTexture(bodyBytes,100,100);body.needsUpdate=true;
 const compositor=createMiniatureVisionComposite(renderer,host,body),scene=new T.Scene();
 scene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(.5,.25,.125,1.);}'})));
 const camera=new T.OrthographicCamera(-50,50,50,-50,.1,1000);camera.position.set(50,100,50);camera.up.set(0,0,-1);camera.lookAt(50,0,50);
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const full=rect(0,0,100,100),sight=rect(0,0,60,100),next={enabled:true,explored:[],memory:null,keepRevealed:false,origins:[rect(0,0,20,100)],sight:[sight],lights:[{polygon:full,source:{id:'lamp',x:50,y:50,height:5,radius:25,strength:1}}]};
 const draw=(f=next)=>{renderer.render(scene,camera);compositor.render(true,f,camera);};
 const sample=(x,y)=>{const p=new Uint8Array(4);renderer.getContext().readPixels(x,y,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,p);return [...p];};
 draw();const pixels={visible:sample(10,50),body:sample(80,50),shared:sample(80,70),hidden:sample(90,10),light:sample(50,50),blockedLight:sample(70,50)};
 const initial=Number(host.dataset.visionCoverUpdates);for(let i=0;i<5;i++)draw();const idle=Number(host.dataset.visionCoverUpdates);
 camera.position.x+=5;camera.lookAt(55,0,50);draw();const cameraUpdates=Number(host.dataset.visionCoverUpdates);
 draw({...next,lights:[]});const changed=Number(host.dataset.visionCoverUpdates);
 renderer.setSize(120,100);draw();const resized=Number(host.dataset.visionCoverUpdates);
 renderer.render(scene,camera);compositor.render(false,next,camera);const disabled=host.dataset.visionComposite,z=host.style.zIndex;
 window.sightComposite={pixels,initial,idle,cameraUpdates,changed,resized,disabled,z,canvasCount:host.querySelectorAll('canvas').length};
 compositor.dispose();body.dispose();renderer.dispose();
 `}});
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).sightComposite);
 expect(data.pixels.visible[0]).toBeGreaterThanOrEqual(127);expect(data.pixels.visible.slice(1)).toEqual([64,32,255]);expect(data.pixels.body).toEqual(data.pixels.visible);
 expect(data.pixels.shared).toEqual([5,6,8,255]);expect(data.pixels.hidden).toEqual([5,6,8,255]);
 expect(data.pixels.light).toEqual(data.pixels.visible);expect(data.pixels.blockedLight).toEqual([5,6,8,255]);
 expect(data).toMatchObject({initial:1,idle:1,cameraUpdates:2,changed:3,resized:4,disabled:'off',z:'',canvasCount:1});expect(errors).toEqual([]);
});

test('soft fog preserves the original composition of translucent lighting over unknown and remembered terrain',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisionLift} from './client/src/canvas/miniatureVisionLift';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 document.body.style.margin='0';
 const rect=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
 for(const [row,[remembered,raisedBody]] of [[false,false],[true,false],[false,true],[true,true]].entries())for(const [column,gpu] of [false,true].entries()){
  const body=new T.DataTexture(new Uint8Array(raisedBody?[255,255,255,255]:[0,0,0,0]),1,1);body.needsUpdate=true;
  const stage=document.createElement('div');stage.style.cssText='position:absolute;width:100px;height:100px;background:#998877;left:'+column*100+'px;top:'+row*100+'px';document.body.append(stage);
  stage.style.setProperty('--player-vision-cover','linear-gradient(#0008,#0008)');
  const host=document.createElement('div');host.style.cssText='position:absolute;inset:0;z-index:1';stage.append(host);
  const fog=document.createElement('div');fog.style.cssText='position:absolute;inset:0;z-index:2;background:'+(remembered?'#141414':'#050608')+';opacity:.5333333333333333';stage.append(fog);
  const renderer=new T.WebGLRenderer({alpha:true});renderer.setSize(100,100);renderer.setClearColor(0,0);host.append(renderer.domElement);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-50,50,50,-50,.1,1000);camera.position.set(50,100,50);camera.up.set(0,0,-1);camera.lookAt(50,0,50);
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(.3,.15,.075,.6);}'})));
  renderer.render(scene,camera);
  if(!gpu){const lift=createMiniatureVisionLift(renderer,host,body);lift.render(true);}
  else {
   const memory=document.createElement('canvas');memory.width=memory.height=100;const ctx=memory.getContext('2d');ctx.fillStyle='#141414';ctx.fillRect(0,0,100,100);memory.dataset.ready='true';memory.dataset.version='1';
   const compositor=createMiniatureVisionComposite(renderer,host,body);
   // Choose an irradiance that matches the reference 8/15 cover opacity.
   let low=0,high=1;for(let i=0;i<50;i++){const t=(low+high)/2;if(t*t*(3-2*t)>7/15)high=t;else low=t;}
   const irradiance=.05+1.05*(low+high)/2,strength=irradiance*(1+1/4096)/3;
   compositor.render(true,{enabled:true,origins:[],sight:[rect],lights:[{polygon:rect,source:{id:'lamp',x:50,y:50,height:0,radius:10000,strength}}],explored:remembered?[[rect.map(p=>[p.x,p.y])]]:[],memory:remembered?memory:null,keepRevealed:false},camera);
  }
 }
 `}});
 await page.setViewportSize({width:200,height:400});await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const shot=await page.screenshot();
 for(const top of [0,100,200,300]){
  const original=await sharp(shot).extract({left:10,top:top+10,width:80,height:80}).removeAlpha().raw().toBuffer();
  const composite=await sharp(shot).extract({left:110,top:top+10,width:80,height:80}).removeAlpha().raw().toBuffer();
  const difference=Math.max(...original.map((v,i)=>Math.abs(v-composite[i])));
  expect(difference,'fog composition row '+top/100).toBeLessThanOrEqual(2);
 }
});
