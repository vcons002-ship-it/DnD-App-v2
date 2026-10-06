import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Sprout={x:number;y:number;angle:number;born:number;scale:number};
/** A bounded instanced botanical wake: curved stems, folded leaves and thorns. */
export function createTrailBranches(scene:THREE.Scene,radius:number){
 const capacity=24,lifetime=1450,pieces:THREE.BufferGeometry[]=[];
 function piece(source:THREE.BufferGeometry,color:THREE.ColorRepresentation,position?:THREE.Vector3,rotation=0){
  const g=source.index?source.toNonIndexed():source;g.rotateZ(rotation);if(position)g.translate(position.x,position.y,position.z);
  const values=new Float32Array(g.attributes.position.count*3),c=new THREE.Color(color);
  for(let j=0;j<values.length;j+=3)c.toArray(values,j);
  g.setAttribute('color',new THREE.BufferAttribute(values,3));pieces.push(g);
  if(g!==source)source.dispose();
 }
 const stem=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,.03),new THREE.Vector3(.08,.23,.07),new THREE.Vector3(-.03,.52,.13),new THREE.Vector3(.05,.8,.20)]);
 piece(new THREE.TubeGeometry(stem,7,.014,5,false),'#6c8c34');
 function leaf(){
  // Folded blade with tapered ends; its ridge and tilted surface catch light.
  const p=[[0,0,0],[-.10,.12,.022],[-.11,.25,.045],[0,.39,.075],[.11,.25,.045],[.10,.12,.022],[0,.19,.092]];
  const vertices:number[]=[],uv:number[]=[];
  for(const [a,b,c] of [[0,1,6],[1,2,6],[2,3,6],[3,4,6],[4,5,6],[5,0,6]])for(const i of [a,b,c]){vertices.push(...p[i]);uv.push(p[i][0]+.5,p[i][1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
 }
 for(const [x,y,z,angle] of [[.06,.23,.08,1.12],[-.02,.48,.14,-1.06],[.05,.72,.20,.10]]){
  piece(leaf(),'#50b957',new THREE.Vector3(x,y,z),angle);
  const ridge=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,.006),new THREE.Vector3(0,.19,.095),new THREE.Vector3(0,.37,.073)]);
  piece(new THREE.TubeGeometry(ridge,3,.005,3,false),'#b8d572',new THREE.Vector3(x,y,z),angle);
 }
 for(const [x,y,z,angle] of [[.075,.34,.115,.8],[-.04,.61,.175,-.65]]){
  const thorn=new THREE.ConeGeometry(.038,.20,5);thorn.rotateX(Math.PI/2);thorn.rotateY(angle);
  piece(thorn,'#ae9651',new THREE.Vector3(x,y,z));
 }
 const geometry=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());
 const fade=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('sproutFade',fade);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.03,transparent:true,depthWrite:false,side:THREE.DoubleSide,emissive:'#082412',emissiveIntensity:.5});
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float sproutFade;\nvarying float leafFade;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nleafFade=sproutFade;');
  shader.fragmentShader='varying float leafFade;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=leafFade;');
 };
 material.customProgramCacheKey=()=> 'varis-trail-sprouts-v1';
 const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
 const sprouts:Sprout[]=[],transform=new THREE.Object3D();
 let last:{x:number;y:number}|undefined,sequence=0;
 return {
  count(){return sprouts.length;},
  update(position:THREE.Vector3,now:number){
   if(position.z<radius*1.45&&Math.abs(position.x)<6.8&&Math.abs(position.y)<4.4){
    if(!last)last={x:position.x,y:position.y};
    const dx=position.x-last.x,dy=position.y-last.y,distance=Math.hypot(dx,dy);
    if(distance>radius*.50){
     // A rethrow does not draw a branch across the jump back to the entry edge.
     if(distance<radius*3){
      const side=sequence++%2?Math.PI:0,jitter=Math.sin(sequence*17.13)*.27;
      sprouts.push({x:position.x,y:position.y,born:now,angle:Math.atan2(dy,dx)+side+jitter,scale:.65+(Math.sin(sequence*8.7)+1)*.15});
     }
     last={x:position.x,y:position.y};
    }
   }
   while(sprouts.length&&(now-sprouts[0].born>lifetime||sprouts.length>capacity))sprouts.shift();
   sprouts.forEach((s,i)=>{
    const age=(now-s.born)/lifetime,growth=THREE.MathUtils.smoothstep(age,0,.11),alpha=1-THREE.MathUtils.smoothstep(age,.42,1);
    transform.position.set(s.x,s.y,.027);transform.rotation.set(0,0,s.angle+Math.sin(age*4+s.born)*.045);
    transform.scale.setScalar(radius*s.scale*growth*(.7+.3*alpha));transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);fade.setX(i,alpha);
   });
   mesh.count=sprouts.length;mesh.instanceMatrix.needsUpdate=true;fade.needsUpdate=true;
  },
  dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}
 };
}
