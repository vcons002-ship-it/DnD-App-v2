import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import sharp from 'sharp';

test('wall fog preserves the complete visible body and its outside outline at different camera angles',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisibilityMaterial} from './client/src/canvas/miniatureVisionLift';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 import {createMiniatureSilhouetteOutline} from './client/src/canvas/miniatureSilhouetteOutline';
 const renderer=new T.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});renderer.setSize(200,200);renderer.setClearColor(0,0);
 const host=document.createElement('div');document.body.append(host);host.append(renderer.domElement);
 const scene=new T.Scene(),mask=new T.WebGLRenderTarget(200,200);mask.depthTexture=new T.DepthTexture(200,200);
 const visibility=createMiniatureVisibilityMaterial(),inverse={value:new T.Matrix4()},outline=createMiniatureSilhouetteOutline(mask.texture,mask.depthTexture,inverse);
 const figure=new T.Mesh(new T.BoxGeometry(18,32,12),new T.MeshBasicMaterial({color:'#d49565'}));figure.position.set(50,16,62);figure.layers.enable(1);figure.userData.outlineId=outline.slot('#40ff60',1);scene.add(figure);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({color:'#604040'}));floor.rotation.x=-Math.PI/2;floor.position.set(50,-.1,50);scene.add(floor);
 const camera=new T.PerspectiveCamera(45,1,.1,1000),composite=createMiniatureVisionComposite(renderer,host,mask.texture);
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const cover={enabled:true,origins:[rect(0,56,100,44)],sight:[],lights:[],explored:[],memory:null,keepRevealed:false};
 const read=()=>{const gl=renderer.getContext(),p=new Uint8Array(200*200*4);gl.readPixels(0,0,200,200,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const results=[];
 for(const angle of [0,.9,1.9]){
  camera.position.set(50+Math.sin(angle)*100,100,50+Math.cos(angle)*100);camera.lookAt(50,0,50);camera.updateMatrixWorld();inverse.value.copy(camera.projectionMatrixInverse);
  camera.layers.set(1);scene.overrideMaterial=visibility;renderer.setRenderTarget(mask);renderer.render(scene,camera);scene.overrideMaterial=null;camera.layers.set(0);renderer.setRenderTarget(null);
  const maskPixels=new Uint8Array(200*200*4);renderer.readRenderTargetPixels(mask,0,0,200,200,maskPixels);
  renderer.render(scene,camera);const body=read();outline.render(renderer);const withOutline=read();
  composite.render(true,cover,camera);const clipped=read();outline.render(renderer);const fixed=read();
  let borders=0,lost=0,restored=0,bodyChanged=0,terrainLeaked=0;
  for(let i=0;i<body.length;i+=4){
   const border=withOutline[i+1]>body[i+1]+20&&withOutline[i+1]>withOutline[i]+30;
   if(border){borders++;if(clipped[i+1]<withOutline[i+1]-20){lost++;if(fixed[i+1]>clipped[i+1]+20)restored++;}}
   if(maskPixels[i]===255&&maskPixels[i+3]===255&&body.slice(i,i+4).some((v,j)=>v!==fixed[i+j]))bodyChanged++;
   if(!border&&!maskPixels[i+3]&&clipped.slice(i,i+4).some((v,j)=>v!==fixed[i+j]))terrainLeaked++;
  }
  results.push({borders,lost,restored,bodyChanged,terrainLeaked});
 }
 window.wallOutline=results;outline.dispose();composite.dispose();mask.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=await page.evaluate(()=>(window as any).wallOutline);
 for(const r of results){expect(r.borders).toBeGreaterThan(20);expect(r.bodyChanged).toBe(0);expect(r.terrainLeaked).toBe(0);expect(r.restored).toBe(r.lost);}
 expect(results.some((r:any)=>r.lost>10)).toBe(true);
});

test('lit figures retain their head colors when projected over hidden ground while unlit figures keep darkvision grading',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisibilityMaterial} from './client/src/canvas/miniatureVisionLift';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 const renderer=new T.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});renderer.setSize(160,160);renderer.setClearColor(0,0);
 const host=document.createElement('div');document.body.append(host);host.append(renderer.domElement);
 const scene=new T.Scene(),mask=new T.WebGLRenderTarget(160,160),material=createMiniatureVisibilityMaterial();
 const figure=new T.Mesh(new T.BoxGeometry(18,32,12),new T.MeshBasicMaterial({color:'#e47733'}));figure.position.set(50,16,62);figure.layers.enable(1);figure.userData.bodySlot=1;scene.add(figure);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({color:'#604040'}));floor.rotation.x=-Math.PI/2;floor.position.set(50,-.1,50);scene.add(floor);
 const camera=new T.PerspectiveCamera(45,1,.1,1000);camera.position.set(50,100,150);camera.lookAt(50,0,50);
 camera.layers.set(1);scene.overrideMaterial=material;renderer.setRenderTarget(mask);renderer.render(scene,camera);scene.overrideMaterial=null;camera.layers.set(0);renderer.setRenderTarget(null);
 const mp=new Uint8Array(160*160*4);renderer.readRenderTargetPixels(mask,0,0,160,160,mp);
 const read=()=>{const gl=renderer.getContext(),p=new Uint8Array(160*160*4);gl.readPixels(0,0,160,160,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const room=rect(0,56,100,44),near=rect(0,56,100,44);
 const base={enabled:true,origins:[room],sight:[room],lights:[{polygon:room,source:{id:'lamp',x:50,y:70,height:9,radius:40,strength:1}}],explored:[],memory:null,keepRevealed:false,grade:{heavy:false,daylight:false,near:[near]}};
 const composite=createMiniatureVisionComposite(renderer,host,mask.texture),points=[{slot:1,x:50,y:62}];
 renderer.render(scene,camera);const plain=read();composite.gradeBodies(base,points);composite.render(true,base,camera);const lit=read();
 const unlitFrame={...base,lights:[]};renderer.render(scene,camera);composite.gradeBodies(unlitFrame,points);composite.render(true,unlitFrame,camera);const dim=read();
 const noFog={...base,enabled:false};renderer.render(scene,camera);composite.gradeBodies(noFog,points);composite.render(true,noFog,camera);const withoutFog=read();
 const field=new T.DataTexture(new Float32Array([3,3,3,0]),1,1,T.RGBAFormat,T.FloatType);field.needsUpdate=true;
 renderer.render(scene,camera);composite.gradeBodies(unlitFrame,points,{torchField:{value:field},torchBounds:{value:new T.Vector4(0,0,100,100)}});composite.render(true,unlitFrame,camera);const fieldLit=read();
 let groundRestored=0;for(let i=0;i<mp.length;i+=4)if(!mp[i+3]&&dim[i+3]===255&&fieldLit.slice(i,i+3).some((v,j)=>Math.abs(v-dim[i+j])>5))groundRestored++;
 let litChanged=0,dimColored=0,bodyPixels=0;
 let noFogChanged=0,fieldChangedBody=0;
 for(let i=0;i<mp.length;i+=4)if(mp[i]===255&&mp[i+3]===255){bodyPixels++;if(plain.slice(i,i+4).some((v,j)=>Math.abs(v-lit[i+j])>1))litChanged++;if(dim[i]>dim[i+1]+15&&dim[i+1]>dim[i+2])dimColored++;if(plain.slice(i,i+4).some((v,j)=>Math.abs(v-withoutFog[i+j])>1))noFogChanged++;if(dim.slice(i,i+4).some((v,j)=>v!==fieldLit[i+j]))fieldChangedBody++;}
 const after=new Uint8Array(mp.length);renderer.readRenderTargetPixels(mask,0,0,160,160,after);
 window.bodyGrade={litChanged,bodyPixels,dimColored,noFogChanged,groundRestored,fieldChangedBody,maskUnchanged:after.every((v,i)=>v===mp[i]),grading:host.parentElement.dataset.gpuVisionGrade};
 field.dispose();composite.dispose();mask.dispose();material.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).bodyGrade);
 expect(r.bodyPixels).toBeGreaterThan(300);expect(r.litChanged).toBe(0);expect(r.dimColored).toBe(r.bodyPixels);expect(r.grading).toBe('true');
 expect(r.noFogChanged).toBe(0);expect(r.groundRestored).toBeGreaterThan(100);expect(r.fieldChangedBody).toBe(0);
 expect(r.maskUnchanged).toBe(true);
});

test('Shocking Grasp leaves a small readable electrical status instead of a standing sky bolt and removes it with the condition',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new T.Scene(),effects=createSpellImpactEffects(scene),camera=new T.PerspectiveCamera(45,1,.1,1000);
 const input={id:'active:grasp',tokenId:'target',x:50,y:50,diameter:20,persistent:true,event:{kind:'monster',refId:'g',delta:0,spell:'Shocking Grasp'}};
 effects.sync([input],0);effects.tick(4000,4,false,()=>({x:50,y:50,height:40,visible:true}));camera.position.set(50,100,120);camera.lookAt(50,0,50);effects.faceCamera(camera);
 const names=[];scene.traverse(n=>names.push(n.name));const bounds=new T.Box3().setFromObject(scene);
 const active={kinds:effects.kinds,names,height:bounds.max.y-bounds.min.y};
 effects.tick(4100,4,false,()=>({x:50,y:50,height:40,visible:false}));const hidden=effects.kinds;
 effects.sync([],4200);const expired=effects.active;effects.dispose();window.graspStatus={active,hidden,expired};
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).graspStatus);
 expect(r.active.kinds).toEqual(['shock']);expect(r.active.names).toContain('shocking-grasp-active');expect(r.active.names).toContain('shocking-grasp-status-rim');
 expect(r.active.height).toBeLessThan(55);expect(r.hidden).toEqual([]);expect(r.expired).toBe(false);
});

test('visible spell geometry survives terrain fog without revealing map pixels or drawing through foreground figures',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 import {createMiniatureVisionLift} from './client/src/canvas/miniatureVisionLift';
 import {createSpellImpactEffects,SPELL_IMPACT_LAYER} from './client/src/canvas/spellImpactEffects';
 const renderer=new T.WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(160,160);renderer.setClearColor(0,0);
 const host=document.createElement('div');document.body.appendChild(host);host.appendChild(renderer.domElement);
 const body=new T.DataTexture(new Uint8Array([0,0,0,0]),1,1);body.needsUpdate=true;
 const compositor=createMiniatureVisionComposite(renderer,host,body),scene=new T.Scene();
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({color:'#704030'}));floor.rotation.x=-Math.PI/2;floor.position.set(50,0,50);scene.add(floor);
 // An opaque figure in front of the vines must continue to occlude them after fog compositing.
 const figure=new T.Mesh(new T.BoxGeometry(8,25,8),new T.MeshBasicMaterial({color:'#704030'}));figure.position.set(50,12.5,48);scene.add(figure);
 const camera=new T.OrthographicCamera(-50,50,50,-50,.1,1000);camera.position.set(50,100,120);camera.lookAt(50,0,50);
 const effects=createSpellImpactEffects(scene),input={id:1,tokenId:'visible-target',x:50,y:50,diameter:22,event:{kind:'monster',refId:'g',delta:-1,spell:'Ensnaring Strike'}};
 effects.sync([input],0);effects.tick(400,2,false,()=>({x:50,y:50,height:28,visible:true}));
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const cover={enabled:true,origins:[rect(0,0,30,100)],sight:[],lights:[],explored:[],memory:null,keepRevealed:false};
 const read=()=>{const gl=renderer.getContext(),p=new Uint8Array(160*160*4);gl.readPixels(0,0,160,160,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 camera.layers.disable(SPELL_IMPACT_LAYER);renderer.render(scene,camera);const plain=read();
 camera.layers.enable(SPELL_IMPACT_LAYER);renderer.render(scene,camera);const effect=read();
 camera.layers.disable(SPELL_IMPACT_LAYER);renderer.render(scene,camera);compositor.render(true,cover,camera);const fog=read();
 effects.renderForeground(renderer,camera);const fixed=read();
 let visible=0,restored=0,leaked=0;
 for(let i=0;i<plain.length;i+=4){
  const colored=effect[i+1]>plain[i+1]+15&&effect[i+1]>effect[i]+15;
  if(colored&&fog[i]<10&&fog[i+1]<10){visible++;if(fixed[i+1]>fog[i+1]+15)restored++;}
  // Empty terrain remains exactly covered; a spell never reveals the map underneath it.
  if(effect[i]===plain[i]&&effect[i+1]===plain[i+1]&&effect[i+2]===plain[i+2]&&fixed.slice(i,i+4).some((v,j)=>v!==fog[i+j]))leaked++;
 }
 const center=new T.Vector3(50,20,48).project(camera),x=Math.floor((center.x+1)*80),y=Math.floor((center.y+1)*80),index=(y*160+x)*4;
 const occluded=[...fixed.slice(index,index+4)],occludedFog=[...fog.slice(index,index+4)];
 // The fallback must also lift only effect pixels, preserving original depth.
 renderer.render(scene,camera);
 const lift=createMiniatureVisionLift(renderer,host,body);
 lift.render(true,()=>effects.renderForeground(renderer,camera));
 const lifted=document.querySelector('[data-testid="personal-sight-miniatures"]'),liftPixels=lifted.getContext('2d').getImageData(0,0,160,160).data;
 let legacyVisible=0,legacyLeak=0;
 for(let i=0;i<plain.length;i+=4){const flipped=((159-Math.floor(i/4/160))*160+(i/4)%160)*4;
  if(liftPixels[flipped+1]>30&&liftPixels[flipped+1]>liftPixels[flipped]+15)legacyVisible++;
  if(effect[i]===plain[i]&&effect[i+1]===plain[i+1]&&effect[i+2]===plain[i+2]&&liftPixels[flipped+3])legacyLeak++;
 }
 lift.dispose();
 effects.tick(400,2,false,()=>({x:50,y:50,height:28,visible:false}));renderer.render(scene,camera);compositor.render(true,cover,camera);effects.renderForeground(renderer,camera);const hidden=read();
 window.spellFog={visible,restored,leaked,legacyVisible,legacyLeak,occluded,occludedFog,hiddenLeak:hidden.some((v,i)=>v!==fog[i]),autoClear:renderer.autoClear,layer:camera.layers.mask};
 effects.dispose();compositor.dispose();body.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).spellFog);
 expect(result.visible).toBeGreaterThan(60);expect(result.restored).toBeGreaterThan(result.visible*.98);
 expect(result.leaked).toBe(0);expect(result.occluded).toEqual(result.occludedFog);expect(result.hiddenLeak).toBe(false);
 expect(result.legacyVisible).toBeGreaterThan(60);expect(result.legacyLeak).toBe(0);
 expect(result.autoClear).toBe(true);expect(result.layer).toBe(1);
});

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
