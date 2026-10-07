import * as THREE from 'three';
import {DICE_TRAIL_LIFETIME,diceTrailFade} from './diceTrailTiming';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Sprout={x:number;y:number;angle:number;born:number;scale:number;stretch:number};
/** Shared physical bramble detail; each die only owns its instance transforms. */
export function createBotanicalTrailAssets(){
 const pieces:THREE.BufferGeometry[]=[];
 function piece(source:THREE.BufferGeometry,color:THREE.ColorRepresentation,part:number,position?:THREE.Vector3,rotation=0,tipColor?:THREE.ColorRepresentation){
  const g=source.index?source.toNonIndexed():source;g.rotateZ(rotation);if(position)g.translate(position.x,position.y,position.z);
  const values=new Float32Array(g.attributes.position.count*3),c=new THREE.Color(color);
  const tip=tipColor?new THREE.Color(tipColor):undefined,tint=new THREE.Color();
  for(let j=0;j<values.length;j+=3){
   if(tip)tint.copy(c).lerp(tip,THREE.MathUtils.smoothstep(g.attributes.uv.getX(j/3),.25,.96)).toArray(values,j);
   else c.toArray(values,j);
  }
  g.setAttribute('color',new THREE.BufferAttribute(values,3));g.setAttribute('botanicalPart',new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill(part),1));pieces.push(g);
  if(g!==source)source.dispose();
 }
 function tendril(points:number[][],width:number,color:string,part=0){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const g=new THREE.TubeGeometry(curve,12,width,width>.025?8:5,false),p=g.attributes.position;
  // Taper and slight ridges make woody stems, rather than uniform green tubes.
  for(let i=0;i<p.count;i++){
   const t=g.attributes.uv.getY(i),center=curve.getPointAt(g.attributes.uv.getX(i));
   const taper=(1-g.attributes.uv.getX(i)*.82)*(1+.12*Math.sin(t*31+g.attributes.uv.getX(i)*23));
   p.setXYZ(i,center.x+(p.getX(i)-center.x)*taper,center.y+(p.getY(i)-center.y)*taper,center.z+(p.getZ(i)-center.z)*taper);
  }
  g.computeVertexNormals();piece(g,color,part);
 }
 // Short offshoots grow directly from the main vine instead of repeated bushes.
 tendril([[0,0,.04],[.025,.16,.07],[-.035,.32,.09],[.015,.53,.11]],.032,'#53482e');
 function leaf(seed:number){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],rows=14;
  for(let j=0;j<=rows;j++)for(const side of [-1,0,1]){
   const t=j/rows,edge=side===0?0:1,width=Math.pow(Math.sin(Math.PI*t),.85)*(.105+.014*Math.sin(j*2.7+seed));
   const serration=j%2?1:.93;
   positions.push(side*width*serration*(side<0?.87:1),t*.46+edge*.012*Math.sin(j*2+seed),.065*Math.sin(Math.PI*t)-edge*.045*Math.sin(Math.PI*t)+t*t*.11+side*.025*Math.sin(t*5+seed)*Math.sin(Math.PI*t));
   uv.push((side+1)/2,t);
  }
  for(let j=0;j<rows;j++)for(let k=0;k<2;k++){const a=j*3+k,b=a+3;indices.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
 }
 for(const [x,y,z,angle,seed] of [[.02,.16,.07,1.0,1],[-.025,.34,.09,-1.20,3]]){
  const at=new THREE.Vector3(x,y,z);piece(leaf(seed).scale(.65,.65,.65),seed===3?'#52673c':'#344e2d',1,at,angle);
  const vein=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,.007),new THREE.Vector3(0,.19,.069),new THREE.Vector3(0,.35,.10),new THREE.Vector3(0,.45,.115)]);
  piece(new THREE.TubeGeometry(vein,5,.005,3,false).scale(.65,.65,.65),'#8c9153',2,at,angle);
  for(const t of [.30,.53,.72])for(const side of [-1,1]){
   const end=t+.10,width=Math.pow(Math.sin(Math.PI*end),.85)*.105*.70;
   const height=(u:number,edge:number)=>.065*Math.sin(Math.PI*u)-Math.abs(edge)*.045*Math.sin(Math.PI*u)+u*u*.11+edge*.025*Math.sin(u*5+seed)*Math.sin(Math.PI*u)+.007;
   const veinlet=new THREE.CatmullRomCurve3([new THREE.Vector3(0,t*.46,height(t,0)),new THREE.Vector3(side*width*.55,(t+.035)*.46,height(t+.035,side*.4)),new THREE.Vector3(side*width,end*.46,height(end,side*.7))]);
   piece(new THREE.TubeGeometry(veinlet,3,.0022,3,false).scale(.65,.65,.65),'#8a9a5c',1,at,angle);
  }
 }
 // Broad woody barbs project sideways so their hooked silhouettes read overhead.
 // The two root barbs attach directly to the main vine; a smaller one guards the offshoot.
 for(const [x,y,z,angle,scale] of [[0,0,.055,-.60,1],[0,.025,.06,2.60,.85],[.005,.32,.09,-1.1,.65]]){
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.06,.18,.095),new THREE.Vector3(.09,.36,.17),new THREE.Vector3(.015,.51,.18),new THREE.Vector3(-.06,.48,.14)]);
  const g=new THREE.TubeGeometry(curve,10,.085,8,false),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const t=g.attributes.uv.getX(i),center=curve.getPointAt(t),taper=Math.pow(1-t,1.15);
   p.setXYZ(i,center.x+(p.getX(i)-center.x)*taper,center.y+(p.getY(i)-center.y)*taper,center.z+(p.getZ(i)-center.z)*taper);
  }
  g.computeVertexNormals();g.scale(scale,scale,scale);piece(g,'#392e22',3,new THREE.Vector3(x,y,z),angle,'#c9bea1');
 }
 const base=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());
 const bark=document.createElement('canvas');bark.width=bark.height=128;
 const context=bark.getContext('2d')!,image=context.createImageData(128,128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const grain=Math.sin(x*.73+Math.sin(y*.047)*2)+Math.sin(x*1.91+y*.021)*.35,grit=Math.sin(x*37.3+y*91.7)*Math.sin(x*17.1-y*11.3);
  const v=128+grain*38+grit*14,i=(y*128+x)*4;image.data.set([v,v,v,255],i);
 }
 context.putImageData(image,0,0);const bump=new THREE.CanvasTexture(bark);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;
 const time={value:0};
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.90,metalness:0,envMapIntensity:.12,bumpMap:bump,bumpScale:.018,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.botanicalTime=time;
  shader.vertexShader='attribute float sproutFade; attribute float botanicalPart;\nvarying float leafFade; varying float plantPart; varying vec3 plantPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nleafFade=sproutFade;plantPart=botanicalPart;plantPosition=position;');
  shader.fragmentShader='uniform float botanicalTime; varying float leafFade; varying float plantPart; varying vec3 plantPosition;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float mottling=sin(plantPosition.x*47.+sin(plantPosition.y*31.)*2.)*sin(plantPosition.y*59.+plantPosition.z*23.);
   diffuseColor.rgb*=.90+mottling*.13;
   diffuseColor.a*=leafFade;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=plantPart>2.5?.46:plantPart>.5?.86:.90;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 originalPlantNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(normal,originalPlantNormal,plantPart>.5?.85:0.));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float veins=step(1.5,plantPart)*(1.-step(2.5,plantPart));
   float pulse=pow(max(0.,sin(plantPosition.y*10.-botanicalTime*3.+plantPosition.x*7.)),5.);
   totalEmissiveRadiance+=vec3(.10,.38,.16)*veins*(.12+pulse*.8)*leafFade;
  `);
 };
 material.customProgramCacheKey=()=> 'varis-hooked-thorns-v4';
 return {base,material,time,dispose(){base.dispose();material.dispose();bump.dispose();}};
}
/** A bounded instanced botanical wake with physical wood, foliage and thorn detail. */
export function createTrailBranches(scene:THREE.Scene,radius:number,shared?:ReturnType<typeof createBotanicalTrailAssets>){
 const assets=shared??createBotanicalTrailAssets(),capacity=16,lifetime=DICE_TRAIL_LIFETIME;
 const geometry=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(assets.base.attributes))geometry.setAttribute(name,attribute);
 const fade=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('sproutFade',fade);
 const mesh=new THREE.InstancedMesh(geometry,assets.material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
 const sprouts:Sprout[]=[],transform=new THREE.Object3D();let lastDistance:number|undefined,sequence=0;
 return {
  count(){return sprouts.length;},
  update(now:number,root?:{x:number;y:number;angle:number;distance:number},oldestRootTime=0){
   assets.time.value=now/1000;
   if(root&&(lastDistance===undefined||root.distance-lastDistance>radius*1.15)){
    const side=sequence++%2?Math.PI:0,jitter=Math.sin(sequence*17.13)*.26;
    sprouts.push({x:root.x,y:root.y,born:now,angle:root.angle+side+jitter,scale:.72+(Math.sin(sequence*8.7)+1)*.12,stretch:.85+(Math.sin(sequence*11.3)+1)*.15});
    lastDistance=root.distance;
   }
   while(sprouts.length&&(now-sprouts[0].born>lifetime||sprouts[0].born<oldestRootTime||sprouts.length>capacity))sprouts.shift();
   sprouts.forEach((s,i)=>{
    const age=(now-s.born)/lifetime,growth=THREE.MathUtils.smoothstep(age,0,.07),alpha=diceTrailFade(age),size=radius*s.scale*growth;
    transform.position.set(s.x,s.y,.027);transform.rotation.set(0,0,s.angle);
    transform.scale.set(size*s.stretch,size,size*(1.15-.25*s.stretch));transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);fade.setX(i,alpha);
   });
   mesh.count=sprouts.length;mesh.instanceMatrix.needsUpdate=true;fade.needsUpdate=true;
  },
  dispose(){scene.remove(mesh);geometry.dispose();if(!shared)assets.dispose();}
 };
}
