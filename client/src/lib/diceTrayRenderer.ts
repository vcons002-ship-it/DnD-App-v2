import * as THREE from 'three';
import {createMaterialDie,getDiceStage} from './materialDice';
import {trayFaceValues,type Toss,type TrayDie} from './diceTrayTypes';
import {diePhysicalScale} from '../../../shared/diceTrayLayout';
import type {DiceTheme} from '../../../shared/diceThemes';
import {createDiceTrails} from './diceTrail';
import {createWoodlandWake} from './diceWoodlandWake';

export type DiceAppearanceTest={liquidInk?:boolean;molten?:boolean;lightning?:boolean;dmGlow?:number;denseDm?:boolean;varisTrail?:boolean;mossAgate?:boolean;enchantedAmber?:boolean;woodlandWake?:boolean};

const trayTextures=new Map<string,Promise<THREE.Texture>>();
export const warmTrayGraphics=()=>{getDiceStage();};
export async function loadTrayTexture(themeId:string){
  if(themeId.startsWith('dm-'))themeId='dm';
  if(!['fighter','ranger','sorcerer','dm'].includes(themeId))return undefined;
  try{let promise=trayTextures.get(themeId);if(!promise){promise=new THREE.TextureLoader().loadAsync(`/art/dice-trays/${themeId}-v1.webp`);trayTextures.set(themeId,promise);}const t=(await promise).clone();t.colorSpace=THREE.SRGBColorSpace;return t;}catch{trayTextures.delete(themeId);return undefined;}
}
// Retain a small representative scene so Three.js keeps the compiled material
// programs resident. Disposing it immediately would undo the shader preload.
// The same face/body programs are shared by all polyhedral dice and percentile
// labels; actual live dice still receive their authoritative faces and poses.
const warmedDice = new Map<string, ReturnType<typeof createTrayRenderer>>();
let graphicsPreload: Promise<void> = Promise.resolve();
export const waitForDiceGraphics = () => graphicsPreload;
export const diceGraphicsPreloaded = (themeId: string) => warmedDice.has(themeId);
export function preloadDiceGraphics(theme: DiceTheme, canStart: () => boolean) {
  graphicsPreload = graphicsPreload.then(async () => {
    if (!canStart() || warmedDice.has(theme.id)) return;
    const art = await loadTrayTexture(theme.id);
    if (!canStart()) { art?.dispose(); return; }
    const toss: Toss = {settleTimes: [], wallHits: 0, frames: new Float32Array(28),
      frameCount: 2, step: 1, radius: .65, trayScale: 1, topFaces: [0, 0], duration: 1};
    // One normal and one critical model cover the material variants without
    // keeping an entire party's full dice sets in mobile GPU memory.
    const renderer = createTrayRenderer([
      {sides: 20, value: 1, index: 0, set: 0},
      {sides: 6, value: 1, index: 1, set: 0, crit: true},
    ], toss, theme, undefined, art, true);
    try {
      await renderer.prepare(320, 320 * 10.2 / 15.2, 1);
      warmedDice.set(theme.id, renderer);
      // Bound browser-session cache when a viewer switches among characters.
      if (warmedDice.size > 4) {
        const oldest = warmedDice.keys().next().value!;
        warmedDice.get(oldest)!.dispose(); warmedDice.delete(oldest);
      }
    } catch (error) { renderer.dispose(); throw error; }
  }).catch(() => {}); // Disabled WebGL retains the normal roll fallback.
  return graphicsPreload;
}
export function createTrayRenderer(dice:TrayDie[],toss:Toss,theme:DiceTheme,keptSet?:number,trayArt?:THREE.Texture,fixedFaces=false,dieThemes?:readonly DiceTheme[],appearance?:DiceAppearanceTest){
  appearance ??= {molten:true,lightning:true,liquidInk:true,dmGlow:.65,denseDm:true,varisTrail:true,mossAgate:false,woodlandWake:true};
  const stage=getDiceStage(),scene=new THREE.Scene();scene.environment=stage.scene.environment;
  const trayScale=toss.trayScale??1;
  const tray=new THREE.Group();tray.scale.set(trayScale,trayScale,1);scene.add(tray);
  const camera=new THREE.PerspectiveCamera(25,15.2/10.2,.1,60*trayScale);camera.position.set(0,-8,25).multiplyScalar(trayScale);camera.lookAt(0,0,.25);
  scene.add(new THREE.HemisphereLight(0xf4ead9,0x172324,.45));
  const light=new THREE.DirectionalLight(0xfff3dd,1.5);light.position.set(-9,3,6).multiplyScalar(trayScale);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-10*trayScale,right:10*trayScale,top:8*trayScale,bottom:-8*trayScale,near:.1,far:35*trayScale});light.shadow.bias=-.0003;light.shadow.normalBias=.025;scene.add(light);
  const geometry:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number):THREE.Mesh<THREE.BufferGeometry,THREE.Material>=>{
    const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshStandardMaterial({color,roughness:.86,envMapIntensity:.18});
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;tray.add(mesh);geometry.push(g);materials.push(m);return mesh;
  };
  // The plinth and inset floor are separate solids, so the artwork cannot flatten
  // the silhouette or paint over the visible outside edge of the tray.
  box(0,0,-.30,15.05,10.05,.44,0x100e13);
  const floor=box(0,0,-.17,14.4,9.4,.3,0x182a27);
  const felt=document.createElement('canvas');felt.width=felt.height=128;
  const feltCtx=felt.getContext('2d')!;feltCtx.fillStyle='#1b3029';feltCtx.fillRect(0,0,128,128);
  for(let k=0;k<6000;k++){feltCtx.fillStyle=k%2?'#ffffff08':'#00000012';feltCtx.fillRect((k*73)%128,Math.floor(k*41.7)%128,1,1);}
  const feltMap=new THREE.CanvasTexture(felt);feltMap.colorSpace=THREE.SRGBColorSpace;feltMap.wrapS=feltMap.wrapT=THREE.RepeatWrapping;feltMap.repeat.set(10,7);textures.push(feltMap);
  if(trayArt){trayArt.anisotropy=stage.renderer.capabilities.getMaxAnisotropy();textures.push(trayArt);}
  const feltMaterial=new THREE.MeshStandardMaterial({map:trayArt??feltMap,roughness:.94,metalness:0,bumpMap:feltMap,bumpScale:.012,envMapIntensity:.35});materials.push(feltMaterial);floor.material=feltMaterial;
  const trim=theme.id.startsWith('dm-')?0x9ba5b1:theme.id==='fighter'?0xa27632:theme.id==='ranger'?0x784825:theme.id==='sorcerer'?0x454956:0x49413a;
  const rim=theme.id.startsWith('dm-')?0x171b23:theme.id==='fighter'?0x111116:theme.id==='ranger'?0x241207:theme.id==='sorcerer'?0x22080e:0x160904;
  for(const [x,y,w,h] of [[-7.2,0,.4,9.8],[7.2,0,.4,9.8],[0,-4.7,14.8,.4],[0,4.7,14.8,.4]]){
    const wall=box(x,y,.55,w,h,1.1,rim);
    const lining=wall.material as THREE.MeshStandardMaterial;
    lining.bumpMap=feltMap;lining.bumpScale=.022;lining.roughness=.72;
    // A lower fillet and a narrower cap expose the vertical lining between them.
    box(x,y,.09,w>.5?w:w+.10,h>.5?h:h+.10,.16,rim);
    box(x,y,1.10,w,h,.12,rim);
    const lip=box(x,y,1.18,w>.5?w:w*.35,h>.5?h:h*.35,.045,trim);
    const metal=lip.material as THREE.MeshStandardMaterial;metal.metalness=.7;metal.roughness=.5;metal.envMapIntensity=.12;
  }
  // Soft contact occlusion anchors the recessed bed even under bright tray art.
  const occlusionCanvas=document.createElement('canvas');occlusionCanvas.width=occlusionCanvas.height=128;
  const oc=occlusionCanvas.getContext('2d')!;
  const edgeShade=oc.createLinearGradient(0,0,0,128);
  edgeShade.addColorStop(0,'#0009');edgeShade.addColorStop(.35,'#0004');edgeShade.addColorStop(1,'#0000');
  oc.fillStyle=edgeShade;oc.fillRect(0,0,128,128);
  const occlusionMap=new THREE.CanvasTexture(occlusionCanvas);textures.push(occlusionMap);
  for(const [x,y,w,h,rotation] of [[0,4.49,14,.48,0],[0,-4.49,14,.48,Math.PI],[-6.99,0,9,.48,Math.PI/2],[6.99,0,9,.48,-Math.PI/2]]){
    const g=new THREE.PlaneGeometry(w,h),m=new THREE.MeshBasicMaterial({map:occlusionMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,.004);mesh.rotation.z=rotation;tray.add(mesh);geometry.push(g);materials.push(m);
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(32,32,4,32,32,32);gradient.addColorStop(0,'#000a');gradient.addColorStop(1,'#0000');c.fillStyle=gradient;c.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);textures.push(texture);
  const shadows=dice.map(()=>{const g=new THREE.PlaneGeometry(2,2),m=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(g,m);scene.add(mesh);geometry.push(g);materials.push(m);return mesh;});
  const handles=dice.map((d,i)=>{const dieTheme=dieThemes?.[i]??theme;const h=createMaterialDie(d.sides,dieTheme,!!d.crit,!!d.tens,!!d.ones);h.setMossAgate(!!appearance?.mossAgate);h.setEnchantedAmber(!!appearance?.enchantedAmber);h.setMoltenCracks(!!appearance?.molten);h.setInternalLightning(!!appearance?.lightning);h.setInnerGlow(appearance?.dmGlow??0);h.setLiquidInk(!!appearance?.liquidInk);h.setDenseResin(!!appearance?.denseDm);h.setFaceValues(fixedFaces?Array.from({length:d.sides},(_,j)=>d.tens?j*10:d.ones?j:j+1):trayFaceValues(d,toss.topFaces[i]),fixedFaces);h.object.scale.setScalar(toss.radius*diePhysicalScale(d.sides));h.setTrayLighting(true);
    // The standard shadow pass cannot transmit resin or discard this custom
    // inlay shader's empty areas. Keep its soft contact shadow instead of an
    // opaque silhouette cast by every numbered face.
    h.object.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=!child.userData.dicePowerArt&&!(dieTheme.id.startsWith('dm-')&&!d.crit);});scene.add(h.object);return h;});
  // Rings identify the result without tinting the player's material or hiding numerals.
  const rings=dice.map(d=>{
    const g=new THREE.RingGeometry(toss.radius*diePhysicalScale(d.sides)*1.12,toss.radius*diePhysicalScale(d.sides)*1.23,64);
    const m=new THREE.MeshBasicMaterial({color:d.set===keptSet?0x39ef87:0xff5365,transparent:true,opacity:.95,depthTest:false,depthWrite:false});
    const mesh=new THREE.Mesh(g,m);mesh.renderOrder=10;mesh.visible=false;scene.add(mesh);geometry.push(g);materials.push(m);return mesh;
  });
  const a=new THREE.Quaternion(),b=new THREE.Quaternion(),projectedNumber=new THREE.Vector3();
  const rangerIndices=dice.flatMap((d,i)=>(dieThemes?.[i]??theme).id==='ranger'&&!d.crit?[i]:[]);
  // A shared floor pass receives each enclosed mote's light without adding
  // dozens of dynamic lights or shadow maps to crowded dice rolls.
  const moteLights=rangerIndices.map(()=>new THREE.Vector3());
  if(moteLights.length){
    feltMaterial.onBeforeCompile=shader=>{
      shader.uniforms.moteLights={value:moteLights};shader.uniforms.moteRadius={value:toss.radius};
      shader.vertexShader='varying vec3 moteFloorPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nmoteFloorPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=`varying vec3 moteFloorPosition;uniform vec3 moteLights[${moteLights.length}];uniform float moteRadius;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 moteIllumination=vec3(0.);
        for(int k=0;k<${moteLights.length};k++){
          vec3 offset=(moteFloorPosition-moteLights[k])/moteRadius;
          float falloff=.24/pow(1.+dot(offset,offset)*.8,2.);
          moteIllumination+=vec3(.38,1.,.08)*falloff;
        }
        outgoingLight+=diffuseColor.rgb*moteIllumination;
        #include <opaque_fragment>`);
    };
    feltMaterial.customProgramCacheKey=()=>`ranger-mote-floor-${moteLights.length}`;
  }
  const trails=appearance?.varisTrail?(appearance.woodlandWake?createWoodlandWake(scene,toss.radius,rangerIndices,trayScale):createDiceTrails(scene,toss.radius,rangerIndices,trayScale)):undefined;
  let activeCount=dice.length,liveResults:readonly (number|null)[]|undefined;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  return {
    setResults(values:readonly (number|null)[]){liveResults=values;},
    powerStates(){return handles.slice(0,activeCount).map(h=>h.powerState());},
    setActiveCount(count:number){activeCount=count;},
    trailPointCount(){return trails?.pointCount()??0;},
    trailBranchCount(){return trails?.branchCount()??0;},
    async prepare(width:number,height:number,dpr:number){
      // Launch poses start outside the camera. Warm visible dice, transmission,
      // textures and shadow passes before acknowledging readiness to the server.
      // This detached WebGL canvas is never shown during preparation.
      handles.forEach(h=>{h.object.position.set(0,0,toss.radius);h.updatePose(camera,performance.now());});
      const rw=Math.min(1440,Math.round(width*dpr)),rh=Math.round(rw*height/width);
      stage.renderer.setSize(rw,rh,false);
      const previousShadows=stage.renderer.shadowMap.enabled;stage.renderer.shadowMap.enabled=true;
      try {await stage.renderer.compileAsync(scene,camera);stage.renderer.render(scene,camera);}
      finally {stage.renderer.shadowMap.enabled=previousShadows;}
    },
    setKeptSet(set:number|undefined){keptSet=set;rings.forEach((ring,i)=>(ring.material as THREE.MeshBasicMaterial).color.set(dice[i].set===set?0x39ef87:0xff5365));},
    numberPosition(index:number){
      const point=handles[index].resultPosition(projectedNumber);
      point.project(camera);
      return {x:(point.x+1)/2,y:(1-point.y)/2};
    },
    draw(ctx:CanvasRenderingContext2D,width:number,height:number,dpr:number,elapsed:number,now:number){
      const frame=Math.min(toss.frameCount-1,elapsed/toss.step),i=Math.floor(frame),j=Math.min(i+1,toss.frameCount-1),t=frame-i;
      handles.forEach((h,k)=>{
        h.object.visible=k<activeCount;shadows[k].visible=k<activeCount;
        if(k>=activeCount){rings[k].visible=false;return;}
        const x=(i*dice.length+k)*7,y=(j*dice.length+k)*7,f=toss.frames;
        h.object.position.set(THREE.MathUtils.lerp(f[x],f[y],t),THREE.MathUtils.lerp(f[x+1],f[y+1],t),THREE.MathUtils.lerp(f[x+2],f[y+2],t));
        a.fromArray(f,x+3);b.fromArray(f,y+3);h.object.quaternion.slerpQuaternions(a,b,t);
        const die=dice[k];
        const value=liveResults?liveResults[k]:elapsed>=(toss.settleTimes[k]??toss.duration)?die.value:null;
        const tensIndex=die.tens?k:k-1,tens=liveResults?.[tensIndex],ones=liveResults?.[tensIndex+1];
        const percentile=liveResults&& (die.tens||die.ones)?tens!=null&&ones!=null?((tens-1)*10+ones-1)||100:undefined:die.percentileValue;
        h.setRollResult((die.tens||die.ones)&&percentile===undefined?null:value, value==null?undefined:percentile);
        h.setReducedMotion(reduced.matches);h.updatePose(camera,now);
        shadows[k].visible=!h.powerState().broken;
        const ring=rings[k];ring.visible=keptSet!==undefined&&elapsed>=toss.duration;ring.position.set(h.object.position.x,h.object.position.y,.015);
        const shadow=shadows[k];shadow.position.set(h.object.position.x,h.object.position.y,.006);
        const dieRadius=toss.radius*diePhysicalScale(dice[k].sides);
        const clearance=Math.max(0,h.object.position.z-dieRadius*.65);
        shadow.scale.setScalar(dieRadius*(1.0+clearance*.18));(shadow.material as THREE.MeshBasicMaterial).opacity=Math.max(.15,.9-clearance*.18);
      });
      rangerIndices.forEach((index,k)=>handles[index].innerLightPosition(moteLights[k]));
      trails?.update(handles.map(h=>h.object),now);
      const rw=Math.min(1440,Math.round(width*dpr)),rh=Math.round(rw*height/width);
      if(stage.renderer.domElement.width!==rw||stage.renderer.domElement.height!==rh)stage.renderer.setSize(rw,rh,false);
      const previousShadows=stage.renderer.shadowMap.enabled;stage.renderer.shadowMap.enabled=true;
      stage.renderer.render(scene,camera);stage.renderer.shadowMap.enabled=previousShadows;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.drawImage(stage.renderer.domElement,0,0,width,height);
    },
    dispose(){trails?.dispose();light.shadow.dispose();handles.forEach(h=>h.dispose());geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();}
  };
}
