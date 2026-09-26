import * as THREE from 'three';
import {createMaterialDie,getDiceStage} from './materialDice';
import {trayFaceValues,type Toss,type TrayDie} from './diceTrayTypes';
import type {DiceTheme} from '../../../shared/diceThemes';

export async function loadTrayTexture(themeId:string){
  if(!['fighter','ranger','sorcerer'].includes(themeId))return undefined;
  try{const t=await new THREE.TextureLoader().loadAsync(`/art/dice-trays/${themeId}-v1.webp`);t.colorSpace=THREE.SRGBColorSpace;return t;}catch{return undefined;}
}
export function createTrayRenderer(dice:TrayDie[],toss:Toss,theme:DiceTheme,keptSet?:number,trayArt?:THREE.Texture){
  const stage=getDiceStage(),scene=new THREE.Scene();scene.environment=stage.scene.environment;
  const camera=new THREE.PerspectiveCamera(25,15.2/10.2,.1,60);camera.position.set(0,0,25);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xf4ead9,0x172324,.65));
  const light=new THREE.DirectionalLight(0xfff3dd,1.5);light.position.set(-6,6,10);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-10,right:10,top:8,bottom:-8,near:.1,far:35});light.shadow.bias=-.0003;light.shadow.normalBias=.025;scene.add(light);
  const geometry:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number):THREE.Mesh<THREE.BufferGeometry,THREE.Material>=>{
    const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshStandardMaterial({color,roughness:.86,envMapIntensity:.18});
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);geometry.push(g);materials.push(m);return mesh;
  };
  const floor=box(0,0,-.17,14.4,9.4,.3,0x182a27);
  const felt=document.createElement('canvas');felt.width=felt.height=128;
  const feltCtx=felt.getContext('2d')!;feltCtx.fillStyle='#1b3029';feltCtx.fillRect(0,0,128,128);
  for(let k=0;k<6000;k++){feltCtx.fillStyle=k%2?'#ffffff08':'#00000012';feltCtx.fillRect((k*73)%128,Math.floor(k*41.7)%128,1,1);}
  const feltMap=new THREE.CanvasTexture(felt);feltMap.colorSpace=THREE.SRGBColorSpace;feltMap.wrapS=feltMap.wrapT=THREE.RepeatWrapping;feltMap.repeat.set(10,7);textures.push(feltMap);
  if(trayArt){trayArt.anisotropy=stage.renderer.capabilities.getMaxAnisotropy();textures.push(trayArt);}
  const feltMaterial=new THREE.MeshStandardMaterial({map:trayArt??feltMap,roughness:.94,metalness:0,bumpMap:feltMap,bumpScale:.012,envMapIntensity:.35});materials.push(feltMaterial);floor.material=feltMaterial;
  const trim=theme.id==='fighter'?0xa27632:theme.id==='ranger'?0x784825:theme.id==='sorcerer'?0x9a9daa:0x49413a;
  const rim=theme.id==='fighter'?0x111116:theme.id==='ranger'?0x241207:theme.id==='sorcerer'?0x22080e:0x160904;
  for(const [x,y,w,h] of [[-7.2,0,.4,9.8],[7.2,0,.4,9.8],[0,-4.7,14.8,.4],[0,4.7,14.8,.4]]){
    box(x,y,.55,w,h,1.1,rim);
    const lip=box(x,y,1.12,w>.5?w:w*.8,h>.5?h:h*.8,.08,trim);
    const metal=lip.material as THREE.MeshStandardMaterial;metal.metalness=.8;metal.roughness=.25;metal.envMapIntensity=1.2;
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(32,32,4,32,32,32);gradient.addColorStop(0,'#000a');gradient.addColorStop(1,'#0000');c.fillStyle=gradient;c.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);textures.push(texture);
  const shadows=dice.map(()=>{const g=new THREE.PlaneGeometry(2,2),m=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(g,m);scene.add(mesh);geometry.push(g);materials.push(m);return mesh;});
  const handles=dice.map((d,i)=>{const h=createMaterialDie(d.sides,theme,!!d.crit,!!d.tens,!!d.ones);h.setFaceValues(trayFaceValues(d,toss.topFaces[i]));h.object.scale.setScalar(toss.radius);h.object.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=true;});scene.add(h.object);return h;});
  // Rings identify the result without tinting the player's material or hiding numerals.
  const rings=dice.map(d=>{
    const g=new THREE.RingGeometry(toss.radius*1.12,toss.radius*1.23,64);
    const m=new THREE.MeshBasicMaterial({color:d.set===keptSet?0x39ef87:0xff5365,transparent:true,opacity:.95,depthTest:false,depthWrite:false});
    const mesh=new THREE.Mesh(g,m);mesh.renderOrder=10;mesh.visible=false;scene.add(mesh);geometry.push(g);materials.push(m);return mesh;
  });
  const a=new THREE.Quaternion(),b=new THREE.Quaternion(),projectedNumber=new THREE.Vector3();
  return {
    numberPosition(index:number){
      const point=projectedNumber.copy(handles[index].object.position);point.z+=toss.radius*.65;
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
      const rw=Math.min(1440,Math.round(width*dpr)),rh=Math.round(rw*height/width);
      if(stage.renderer.domElement.width!==rw||stage.renderer.domElement.height!==rh)stage.renderer.setSize(rw,rh,false);
      const previousShadows=stage.renderer.shadowMap.enabled;stage.renderer.shadowMap.enabled=true;
      stage.renderer.render(scene,camera);stage.renderer.shadowMap.enabled=previousShadows;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.drawImage(stage.renderer.domElement,0,0,width,height);
    },
    dispose(){light.shadow.dispose();handles.forEach(h=>h.dispose());geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();}
  };
}
