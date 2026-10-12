import * as THREE from 'three';
import {createDiceLeafArt} from './diceLeafArt';

let swirlSequence=0;

export function createDiceLeafSwirl(root:THREE.Group,radius:number){
 const {geometry,map}=createDiceLeafArt(),count=12,phase=swirlSequence++*2.399963;
 const material=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.016,
  roughness:.72,metalness:0,envMapIntensity:.2,emissive:'#346311',emissiveIntensity:.42,
  side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.count=0;mesh.frustumCulled=false;
 mesh.name='maximum-leaf-swirls';mesh.userData.dicePowerArt=true;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
 const transform=new THREE.Object3D(),color=new THREE.Color(),firstPosition=new THREE.Vector3();
 for(let i=0;i<count;i++){color.setHSL(.21+(i%4)*.023,.43,.47+(i%3)*.035);mesh.setColorAt(i,color);}
 return {
  reset(){mesh.count=0;},
  state(){return {leaves:mesh.count,leafPosition:firstPosition.toArray()};},
  update(now:number,maximum:boolean,age:number,reduced:boolean){
   mesh.count=maximum&&!reduced?count:0;if(!mesh.count)return;
   material.opacity=THREE.MathUtils.smoothstep(age,.15,.65)*.95;
   const time=now/1000;
   for(let i=0;i<count;i++){
    // Two loose swirls, with differing orbit radii, lift and flutter.
    const seed=i*2.399963+phase,a=time*(1.35+(i%3)*.14)+seed;
    const orbit=radius*(1.24+.12*(i%3)+.09*Math.sin(time*1.2+seed));
    const x=Math.cos(a)*orbit,y=Math.sin(a)*orbit;
    const z=radius*(.22+Math.sin(a*.8+seed)*.42+Math.cos(a*1.5)*.13);
    transform.position.set(x,y,z);
    transform.rotation.set(.6*Math.sin(time*3.2+seed),time*1.8+seed,a+Math.PI/2);
    transform.scale.setScalar(radius*(.25+(i%3)*.045));transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    if(i===0)firstPosition.copy(transform.position);
   }
   mesh.instanceMatrix.needsUpdate=true;
  },
  dispose(){root.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();map.dispose();},
 };
}
