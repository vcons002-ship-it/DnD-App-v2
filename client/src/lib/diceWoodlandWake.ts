import * as THREE from 'three';

type Particle={kind:number;x:number;y:number;z:number;vx:number;vy:number;born:number;life:number;seed:number;size:number;angle:number};
/** A short airborne wake; fixed shared meshes keep it bounded for crowded rolls. */
export function createWoodlandWake(scene:THREE.Scene,radius:number,indices:number[],trayScale=1){
 const capacity=Math.max(1,indices.length*20),particles:Particle[]=[],last=new Map<number,{x:number;y:number;time:number;travel:number}>();
 let sequence=0;
 const random=(seed:number)=>{const v=Math.sin(seed*127.13+31.7)*43758.5453;return v-Math.floor(v);};
 const leafPositions:number[]=[],uv:number[]=[],faces:number[]=[];
 for(let j=0;j<=10;j++)for(const side of [-1,0,1]){
  const t=j/10,w=Math.pow(Math.sin(t*Math.PI),.85)*.24*(j%2?.94:1);
  leafPositions.push(side*w,t-.5,.11*Math.sin(t*Math.PI)-Math.abs(side)*.07*Math.sin(t*Math.PI)+side*.035*Math.sin(t*6));uv.push((side+1)/2,t);
 }
 for(let j=0;j<10;j++)for(let k=0;k<2;k++){const a=j*3+k,b=a+3;faces.push(a,b,a+1,a+1,b,b+1);}
 const leafGeometry=new THREE.BufferGeometry();leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute(leafPositions,3));leafGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));leafGeometry.setIndex(faces);leafGeometry.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
 const ctx=canvas.getContext('2d')!,image=ctx.createImageData(128,256);
 for(let y=0;y<256;y++)for(let x=0;x<128;x++){
  const spine=Math.exp(-Math.pow((x-64)/2.1,2)),branch=Math.exp(-Math.pow(Math.sin((y-Math.abs(x-64)*1.15)*.16)*9,2));
  const grain=Math.sin(x*13.1+y*7.3)*Math.sin(x*3.9-y*12.1),v=88+spine*65+branch*24+grain*8;
  image.data.set([v*.83,v,v*.67,255],(y*128+x)*4);
 }
 ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 function material(m:THREE.MeshStandardMaterial){
  m.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float wakeFade;varying float particleFade;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nparticleFade=wakeFade;');
   shader.fragmentShader='varying float particleFade;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=particleFade;');
  };m.customProgramCacheKey=()=> 'woodland-wake-fade-v1';return m;
 }
 const leafMaterial=material(new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.016,roughness:.78,metalness:0,envMapIntensity:.14,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
 const seedGeometry=new THREE.SphereGeometry(1,5,4);seedGeometry.scale(.26,1,.25);
 const seedMaterial=material(new THREE.MeshStandardMaterial({color:'#ae9360',roughness:.83,envMapIntensity:.1,transparent:true,depthWrite:false}));
 function layer(geometry:THREE.BufferGeometry,mat:THREE.Material){
  const fade=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('wakeFade',fade);
  const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return {mesh,fade};
 }
 const leaves=layer(leafGeometry,leafMaterial),seeds=layer(seedGeometry,seedMaterial);
 leaves.mesh.setColorAt(0,new THREE.Color('#577141')); // Warm the instance-color shader before the toss.
 const glow=document.createElement('canvas');glow.width=glow.height=32;const gc=glow.getContext('2d')!,gradient=gc.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'#ffffe9');gradient.addColorStop(.15,'#e5ffc9cc');gradient.addColorStop(1,'#caff9b00');gc.fillStyle=gradient;gc.fillRect(0,0,32,32);
 const glowMap=new THREE.CanvasTexture(glow),moteGeometry=new THREE.BufferGeometry(),motePositions=new Float32Array(capacity*3),moteColors=new Float32Array(capacity*3);
 moteGeometry.setAttribute('position',new THREE.BufferAttribute(motePositions,3).setUsage(THREE.DynamicDrawUsage));moteGeometry.setAttribute('color',new THREE.BufferAttribute(moteColors,3).setUsage(THREE.DynamicDrawUsage));
 const moteMaterial=new THREE.PointsMaterial({map:glowMap,size:radius*.14,vertexColors:true,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
 const motes=new THREE.Points(moteGeometry,moteMaterial);motes.frustumCulled=false;scene.add(motes);
 const transform=new THREE.Object3D(),color=new THREE.Color();
 function emit(x:number,y:number,vx:number,vy:number,now:number){
  const seed=++sequence,speed=Math.hypot(vx,vy),nx=-vy/Math.max(.001,speed),ny=vx/Math.max(.001,speed),jitter=(random(seed)-.5)*radius*.4;
  const kind=seed%5===0?1:seed%3===0?2:0;
  particles.push({kind,x:x+nx*jitter-vx*.018,y:y+ny*jitter-vy*.018,z:radius*.12,vx:vx*.10+nx*(random(seed+1)-.5)*radius,vy:vy*.10+ny*(random(seed+1)-.5)*radius,born:now,life:650+random(seed+2)*400,seed,size:radius*(kind===0?.26+random(seed+3)*.13:.07),angle:Math.atan2(vy,vx)});
 }
 return {
  pointCount(){return particles.length;},
  branchCount(){return leaves.mesh.count;}, // Existing preview counter counts visible leaves.
  update(poses:THREE.Object3D[],now:number){
   for(const index of indices){
    const p=poses[index].position,previous=last.get(index),dt=previous?Math.max(.001,(now-previous.time)/1000):0;
    const dx=previous?p.x-previous.x:0,dy=previous?p.y-previous.y:0,distance=Math.hypot(dx,dy);
    let travel=previous?.travel??0;
    if(previous&&dt<.15&&distance<radius*3&&p.z<radius*2.7&&Math.abs(p.x)<7*trayScale-radius*.15&&Math.abs(p.y)<4.5*trayScale-radius*.1&&distance/dt>radius*.8){
     travel+=distance;let emitted=0;
     while(travel>radius*.40&&emitted++<2){travel-=radius*.40;emit(p.x,p.y,dx/dt,dy/dt,now);}
    }else travel=0;
    last.set(index,{x:p.x,y:p.y,time:now,travel});
   }
   while(particles.length&&(now-particles[0].born>particles[0].life||particles.length>capacity))particles.shift();
   let leafCount=0,seedCount=0,moteCount=0;
   for(const p of particles){
    const age=(now-p.born)/p.life;if(age>=1)continue;
    const seconds=(now-p.born)/1000,ease=(1-Math.exp(-seconds*2))/2,swirl=seconds*5+p.seed;
    const curl=Math.sin(seconds*4)*radius*.20;
    const x=p.x+p.vx*ease+Math.cos(p.angle+Math.PI/2)*curl+Math.sin(swirl)*radius*.025;
    const y=p.y+p.vy*ease+Math.sin(p.angle+Math.PI/2)*curl+Math.cos(swirl)*radius*.025;
    const z=p.z+Math.sin(age*Math.PI)*radius*(.22+random(p.seed+6)*.3);
    const alpha=Math.min(1,age/.10)*Math.pow(1-age,1.25);
    if(p.kind===2){motePositions.set([x,y,z],moteCount*3);moteColors.set([alpha*.48,alpha*.62,alpha*.22],moteCount*3);moteCount++;continue;}
    const target=p.kind===0?leaves:seeds,slot=p.kind===0?leafCount++:seedCount++;
    transform.position.set(x,y,z);transform.rotation.set(Math.sin(swirl)*.75,seconds*(p.seed%2?3:-3),p.angle+seconds*(random(p.seed+5)-.5)*5);transform.scale.setScalar(p.size);transform.updateMatrix();target.mesh.setMatrixAt(slot,transform.matrix);target.fade.setX(slot,alpha);
    if(p.kind===0){color.setHSL(.20+random(p.seed+4)*.10,.22+random(p.seed+8)*.23,.29+random(p.seed+7)*.13);target.mesh.setColorAt(slot,color);}
   }
   for(const target of [leaves,seeds]){target.mesh.count=target===leaves?leafCount:seedCount;target.mesh.instanceMatrix.needsUpdate=true;target.fade.needsUpdate=true;if(target.mesh.instanceColor)target.mesh.instanceColor.needsUpdate=true;}
   moteGeometry.setDrawRange(0,moteCount);moteGeometry.attributes.position.needsUpdate=true;moteGeometry.attributes.color.needsUpdate=true;
  },
  dispose(){scene.remove(leaves.mesh,seeds.mesh,motes);leaves.mesh.dispose();seeds.mesh.dispose();leafGeometry.dispose();seedGeometry.dispose();moteGeometry.dispose();leafMaterial.dispose();seedMaterial.dispose();moteMaterial.dispose();map.dispose();glowMap.dispose();particles.length=0;last.clear();}
 };
}
