import {describe,it,expect} from 'vitest';
import {Scene,DirectionalLight,HemisphereLight,Texture,DepthTexture,Vector2,Vector3,type BufferAttribute,Mesh,BoxGeometry,MeshBasicMaterial,InstancedMesh,Matrix4,OrthographicCamera,WebGLRenderTarget,Bone,Skeleton,SkinnedMesh} from 'three';
import {createBattlefieldLighting} from '../canvas/battlefieldLighting.js';
import {createEnvironmentVisibility} from '../canvas/environmentVisibility.js';
import {createMiniatureNameLayer} from '../canvas/miniatureNameLayer.js';
import {createMiniatureMaskCache} from '../canvas/miniatureMaskCache.js';
import {miniatureAppearanceKey} from '../canvas/miniatureAppearance.js';
import {createVisionLightMask} from '../canvas/visionLightMask.js';
import {createVisionLightProjector} from '../canvas/visionLightEllipse.js';
import {DEFAULT_MAP_ENVIRONMENT} from '../../../shared/mapEnvironment.js';

describe('standard rendering retention',()=>{
 it('retains a static light field through camera/selection frames, and refreshes for shadows, walls, sources, spells and removal',()=>{
  const scene=new Scene(),visibility=createEnvironmentVisibility();
  const lighting=createBattlefieldLighting(scene,new DirectionalLight(),new HemisphereLight(),visibility.uniforms,{texture:new Texture(),resolution:new Vector2(100,100)},{} as any);
  const settings:any={...DEFAULT_MAP_ENVIRONMENT,enabled:true,mist:false,mapWidth:1000,mapHeight:700,pixelsPerFoot:10,lights:[{id:'lamp',x:100,y:100,heightFt:8,radiusFt:30,intensity:1,color:'warm',flicker:false}]};
  let renders=0;const renderer:any={shadowMap:{needsUpdate:true},getRenderTarget:()=>null,setRenderTarget(){},getClearAlpha:()=>0,getClearColor:(c:any)=>c.set('black'),setClearColor(){},clear(){},render(){renders++;}};
  lighting.update(settings);lighting.renderField(renderer);expect(renders).toBe(1);
  const light=lighting.lights[0];
  for(const t of [1,2,3]){lighting.tick(t);lighting.renderField(renderer);}
  expect(lighting.lights[0]).toBe(light);expect(renders).toBe(1);
  lighting.update({...settings});lighting.renderField(renderer);expect(renders).toBe(1);
  lighting.renderField(renderer,1);expect(renders).toBe(2);
  lighting.renderField(renderer,1);expect(renders).toBe(2);
  lighting.update({...settings,walls:[{id:'wall',ax:200,ay:0,bx:200,by:500}]});lighting.renderField(renderer,1);expect(renders).toBe(3);
  lighting.update({...settings,lights:[{...settings.lights[0],x:150,color:'cool'}]});lighting.renderField(renderer,1);expect(renders).toBe(4);
  const spell:any={id:'spell',x:100,y:100,height:30,radius:100,strength:1,color:new Vector3(1,0,0),transient:true,visibleTorch:false};
  lighting.setTransient([spell]);lighting.tick(4);lighting.renderField(renderer,1);expect(renders).toBe(5);
  spell.strength=.5;lighting.tick(5);lighting.renderField(renderer,1);expect(renders).toBe(6);
  lighting.setTransient([]);lighting.tick(6);lighting.renderField(renderer,1);expect(renders).toBe(7);
  lighting.update({...settings,lights:[]});lighting.renderField(renderer,1);expect(renders).toBe(8);expect(lighting.lights).toHaveLength(0);
  lighting.dispose();visibility.dispose();
 });
 it('preserves torch flicker and carried lantern motion while keeping stationary carried lanterns idle',()=>{
  const scene=new Scene(),visibility=createEnvironmentVisibility(),lighting=createBattlefieldLighting(scene,new DirectionalLight(),undefined,visibility.uniforms,{texture:new Texture(),resolution:new Vector2()},{} as any);
  let renders=0;const renderer:any={shadowMap:{needsUpdate:true},getRenderTarget:()=>null,setRenderTarget(){},getClearAlpha:()=>0,getClearColor:(c:any)=>c.set('black'),setClearColor(){},clear(){},render(){renders++;}};
  const settings:any={...DEFAULT_MAP_ENVIRONMENT,enabled:true,mapWidth:1000,mapHeight:700,pixelsPerFoot:10,lights:[{id:'lamp',x:100,y:100,heightFt:8,radiusFt:30,intensity:1,color:'warm',flicker:true}]};
  lighting.update(settings);lighting.tick(1);const before=lighting.lights[0].strength;lighting.tick(2);expect(lighting.lights[0].strength).not.toBe(before);
  lighting.update({...settings,lights:[]});
  lighting.setCarried([{id:'carrier',x:20,y:20,height:30,fixtureHeight:25,facing:0}]);lighting.tick(3);lighting.renderField(renderer);
  const stationaryRenders=renders;
  expect(lighting.animated).toBe(false);
  expect(lighting.lights.find(l=>l.id==='carrier')?.x).toBe(20);
  lighting.tick(4);lighting.renderField(renderer);
  expect(renders).toBe(stationaryRenders);
  lighting.setCarried([{id:'carrier',x:80,y:20,height:30,fixtureHeight:25,facing:1}]);lighting.tick(5);lighting.renderField(renderer);
  expect(lighting.lights.find(l=>l.id==='carrier')?.x).toBe(80);
  expect(renders).toBe(stationaryRenders+1);
  lighting.dispose();visibility.dispose();
 });
 it('retains vision light SVG masks across stationary torch flicker and updates when a light moves',()=>{
  let groupWrites=0;
  const node=()=>({id:'',attrs:new Map<string,string>(),setAttribute(k:string,v:string){this.attrs.set(k,v);},getAttribute(k:string){return this.attrs.get(k)??null;},append(){},remove(){}});
  const prevDoc=(globalThis as any).document;(globalThis as any).document={createElementNS:()=>node()};
  try{
   const group={set innerHTML(_v:string){groupWrites++;}} as unknown as SVGGElement;
   const defs=node() as unknown as SVGGElement;
   const mask=createVisionLightMask(group,defs,'lamp');
   const ellipse=createVisionLightProjector({x:0,y:0,scale:1},45,0,1000,800);
   const projection={key:'cam1',wallsKey:'[]',occluded:false,ellipse,circle:()=>'M0,0Z',clip:()=>'M0,0Z'};
   mask.sync([{id:'torch',x:200,y:300,height:50,radius:180,strength:.9,nominalRadius:200,nominalStrength:1} as any],projection);
   expect(groupWrites).toBe(1);expect(mask.stats.geometryUpdates).toBe(1);
   for(const factor of [.85,1.05,1.22]){
    mask.sync([{id:'torch',x:200,y:300,height:50,radius:200*factor,strength:factor,nominalRadius:200,nominalStrength:1} as any],projection);
   }
   expect(groupWrites).toBe(1);expect(mask.stats.geometryUpdates).toBe(1);
   mask.sync([{id:'torch',x:240,y:300,height:50,radius:200,strength:1,nominalRadius:200,nominalStrength:1} as any],projection);
   expect(groupWrites).toBe(2);expect(mask.stats.geometryUpdates).toBe(2);
   mask.dispose();
  }finally{(globalThis as any).document=prevDoc;}
 });
 it('uploads name geometry only when it moves and glyph pixels only when text changes',()=>{
  const scene=new Scene(),names=createMiniatureNameLayer(scene,new DepthTexture(10,10),{value:new Vector2(10,10)});
  const canvas={width:100,height:20} as HTMLCanvasElement,points=[{x:0,y:0},{x:100,y:0},{x:0,y:20},{x:100,y:20}];
  const label={id:'one',canvas,points,opacity:1,emphasized:false};
  names.sync([label],new Set(['one']));const mesh=scene.getObjectByName('miniature-name') as Mesh,position=mesh.geometry.getAttribute('position') as BufferAttribute,version=position.version;
  names.sync([{...label,points:points.map(p=>({...p})),emphasized:true,opacity:.45}],new Set(['one']));
  expect(position.version).toBe(version);expect(names.state).toEqual({nameTextureUpdates:1,namePositionUpdates:1});
  names.sync([{...label,points:points.map(p=>({x:p.x+.00000001,y:p.y}))}],new Set(['one']));expect(position.version).toBeGreaterThan(version);expect(names.state.nameTextureUpdates).toBe(1);
  names.sync([{...label,canvas:{width:100,height:20} as HTMLCanvasElement}],new Set(['one']));expect(names.state.nameTextureUpdates).toBe(2);
  names.sync([],new Set());expect(scene.children).toHaveLength(0);names.dispose();
 });
 it('detects changed instance pixels even without a buffer upload, while ignoring identical uploads',()=>{
  const scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,.1,10),target=new WebGLRenderTarget(20,20),cache=createMiniatureMaskCache();
  const mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);mesh.layers.enable(1);mesh.setMatrixAt(0,new Matrix4());mesh.setMatrixAt(1,new Matrix4().makeTranslation(1,0,0));scene.add(mesh);
  expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.instanceMatrix.needsUpdate=true;expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.instanceMatrix.array[12]=.25;expect(cache.needsRender(target,scene,camera)).toBe(true);
  mesh.count=1;expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.visible=false;expect(cache.needsRender(target,scene,camera)).toBe(true);mesh.visible=true;expect(cache.needsRender(target,scene,camera)).toBe(true);
  camera.position.x=.1;expect(cache.needsRender(target,scene,camera)).toBe(true);
  mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();target.dispose();
 });
 it('keeps body material work independent of coordinates and selection but invalidates visible appearance changes',()=>{
  const token={diameter:50,definition:{baseDiameter:1,baseCenter:[0,0,0]},hidden:false,x:10,selected:false};const before=miniatureAppearanceKey(token,true);
  const moved={...token,x:90,selected:true};expect(miniatureAppearanceKey(moved,true)).toBe(before);
  for(const patch of [{hidden:true},{invisible:true},{sharedSightOnly:true},{diameter:60},{tint:'#ff0000'},{shade:[.5,.5,.5]},{outline:'#ffffff'}])expect(miniatureAppearanceKey({...token,...patch},true)).not.toBe(before);
  expect(miniatureAppearanceKey(token,false)).not.toBe(before);
 });
 it('refreshes retained depth for pose, morph and geometry changes',()=>{
  const scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,.1,10),target=new WebGLRenderTarget(20,20),cache=createMiniatureMaskCache();
  const mesh=new SkinnedMesh(new BoxGeometry(),new MeshBasicMaterial()),bone=new Bone();mesh.add(bone);mesh.bind(new Skeleton([bone]));mesh.layers.enable(1);scene.add(mesh);
  expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  bone.position.x=.1;expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.morphTargetInfluences=[.5];expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.geometry.getAttribute('position').needsUpdate=true;expect(cache.needsRender(target,scene,camera)).toBe(true);
  mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();mesh.skeleton.dispose();target.dispose();
 });
});
