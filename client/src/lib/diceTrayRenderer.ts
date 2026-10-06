import * as THREE from 'three';
import {createMaterialDie,getDiceStage} from './materialDice';
import {trayFaceValues,type Toss,type TrayDie} from './diceTrayTypes';
import type {DiceTheme} from '../../../shared/diceThemes';
import {createDiceTrails} from './diceTrail';

export type DiceAppearanceTest={liquidInk?:boolean;molten?:boolean;lightning?:boolean;dmGlow?:number;denseDm?:boolean;varisTrail?:boolean};

const trayTextures=new Map<string,Promise<THREE.Texture>>();
export const warmTrayGraphics=()=>{getDiceStage();};
export async function loadTrayTexture(themeId:string){
  if(themeId.startsWith('dm-'))themeId='dm';
  if(!['fighter','ranger','sorcerer','dm'].includes(themeId))return undefined;
  try{let promise=trayTextures.get(themeId);if(!promise){promise=new THREE.TextureLoader().loadAsync(`/art/dice-trays/${themeId}-v1.webp`);trayTextures.set(themeId,promise);}const t=(await promise).clone();t.colorSpace=THREE.SRGBColorSpace;return t;}catch{trayTextures.delete(themeId);return undefined;}
}
export function createTrayRenderer(dice:TrayDie[],toss:Toss,theme:DiceTheme,keptSet?:number,trayArt?:THREE.Texture,fixedFaces=false,dieThemes?:readonly DiceTheme[],appearance?:DiceAppearanceTest){
  const stage=getDiceStage(),scene=new THREE.Scene();scene.environment=stage.scene.environment;
  const camera=new THREE.PerspectiveCamera(25,15.2/10.2,.1,60);camera.position.set(0,-8,25);camera.lookAt(0,0,.25);
  scene.add(new THREE.HemisphereLight(0xf4ead9,0x172324,.45));
  const light=new THREE.DirectionalLight(0xfff3dd,1.5);light.position.set(-6,4,9);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-10,right:10,top:8,bottom:-8,near:.1,far:35});light.shadow.bias=-.0003;light.shadow.normalBias=.025;scene.add(light);
  const geometry:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number):THREE.Mesh<THREE.BufferGeometry,THREE.Material>=>{
    const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshStandardMaterial({color,roughness:.86,envMapIntensity:.18});
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);geometry.push(g);materials.push(m);return mesh;
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
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,.004);mesh.rotation.z=rotation;scene.add(mesh);geometry.push(g);materials.push(m);
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(32,32,4,32,32,32);gradient.addColorStop(0,'#000a');gradient.addColorStop(1,'#0000');c.fillStyle=gradient;c.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);textures.push(texture);
  const shadows=dice.map(()=>{const g=new THREE.PlaneGeometry(2,2),m=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(g,m);scene.add(mesh);geometry.push(g);materials.push(m);return mesh;});
  const handles=dice.map((d,i)=>{const dieTheme=dieThemes?.[i]??theme;const h=createMaterialDie(d.sides,dieTheme,!!d.crit,!!d.tens,!!d.ones);h.setMoltenCracks(!!appearance?.molten);h.setInternalLightning(!!appearance?.lightning);h.setInnerGlow(appearance?.dmGlow??0);h.setLiquidInk(!!appearance?.liquidInk);h.setDenseResin(!!appearance?.denseDm);h.setFaceValues(fixedFaces?Array.from({length:d.sides},(_,j)=>d.tens?j*10:d.ones?j:j+1):trayFaceValues(d,toss.topFaces[i]),fixedFaces);h.object.scale.setScalar(toss.radius);
    // The standard shadow pass cannot transmit resin or discard this custom
    // inlay shader's empty areas. Keep its soft contact shadow instead of an
    // opaque silhouette cast by every numbered face.
    h.object.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=!(dieTheme.id.startsWith('dm-')&&!d.crit);});scene.add(h.object);return h;});
  // Rings identify the result without tinting the player's material or hiding numerals.
  const rings=dice.map(d=>{
    const g=new THREE.RingGeometry(toss.radius*1.12,toss.radius*1.23,64);
    const m=new THREE.MeshBasicMaterial({color:d.set===keptSet?0x39ef87:0xff5365,transparent:true,opacity:.95,depthTest:false,depthWrite:false});
    const mesh=new THREE.Mesh(g,m);mesh.renderOrder=10;mesh.visible=false;scene.add(mesh);geometry.push(g);materials.push(m);return mesh;
  });
  const a=new THREE.Quaternion(),b=new THREE.Quaternion(),projectedNumber=new THREE.Vector3();
  const trails=appearance?.varisTrail?createDiceTrails(scene,toss.radius,dice.flatMap((d,i)=>(dieThemes?.[i]??theme).id==='ranger'&&!d.crit?[i]:[])):undefined;
  return {
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
        const x=(i*dice.length+k)*7,y=(j*dice.length+k)*7,f=toss.frames;
        h.object.position.set(THREE.MathUtils.lerp(f[x],f[y],t),THREE.MathUtils.lerp(f[x+1],f[y+1],t),THREE.MathUtils.lerp(f[x+2],f[y+2],t));
        a.fromArray(f,x+3);b.fromArray(f,y+3);h.object.quaternion.slerpQuaternions(a,b,t);h.updatePose(camera,now);
        const ring=rings[k];ring.visible=keptSet!==undefined&&elapsed>=toss.duration;ring.position.set(h.object.position.x,h.object.position.y,.015);
        const shadow=shadows[k];shadow.position.set(h.object.position.x,h.object.position.y,.006);
        const clearance=Math.max(0,h.object.position.z-toss.radius*.65);
        shadow.scale.setScalar(toss.radius*(1.0+clearance*.18));(shadow.material as THREE.MeshBasicMaterial).opacity=Math.max(.15,.9-clearance*.18);
      });
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
