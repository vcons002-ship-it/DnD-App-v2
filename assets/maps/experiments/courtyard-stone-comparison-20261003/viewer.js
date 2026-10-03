import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {wallContours,pointInRing} from '../../../../shared/wallGeometry.ts';

const host=document.querySelector('#viewport'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#242a30');scene.add(new THREE.AmbientLight(0xffffff,.9));
const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(-3,6,-4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:15});sun.shadow.bias=-.00015;sun.shadow.normalBias=.002;scene.add(sun);
renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.8;
const camera=new THREE.PerspectiveCamera(38,1,.01,30);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;
controls.minDistance=.3;controls.maxDistance=10;controls.maxPolarAngle=Math.PI*.49;
const [data,walls,scenery]=await Promise.all(['relief.json','walls.json','scenery.json'].map(file=>fetch(file).then(r=>r.json())));
const texture=await new THREE.TextureLoader().loadAsync('original.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const mapWidth=3,mapDepth=3*data.height/data.width,feetToWorld=mapWidth/(data.width/data.gridSizePx*data.feetPerSquare);
const map=new THREE.Group();scene.add(map);
const flat=new THREE.Mesh(new THREE.PlaneGeometry(mapWidth,mapDepth),new THREE.MeshBasicMaterial({map:texture}));flat.rotation.x=-Math.PI/2;map.add(flat);
const groundMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
const levelGround=new THREE.Mesh(new THREE.PlaneGeometry(mapWidth,mapDepth),groundMaterial);levelGround.rotation.x=-Math.PI/2;levelGround.position.y=.0001;levelGround.receiveShadow=true;levelGround.name='Original_flat_floor';map.add(levelGround);
const wallGroup=new THREE.Group();wallGroup.name='Mask_walls';map.add(wallGroup);
const sceneryGroup=new THREE.Group();sceneryGroup.name='Raised_scenery';map.add(sceneryGroup);
const rings=walls.map(wallContours);
function insideWall(x,y){const p={x,y};return rings.some(r=>pointInRing(p,r[0])&&!r.slice(1).some(h=>pointInRing(p,h)));}
function elevationAt(x,y){const px=Math.min(data.terrainWidth-1,Math.max(0,Math.round(x/data.width*(data.terrainWidth-1)))),py=Math.min(data.terrainHeight-1,Math.max(0,Math.round(y/data.height*(data.terrainHeight-1))));return data.heights[py*data.terrainWidth+px];}
function wallHeightAt(x,y){let height=0;for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2)height=Math.max(height,elevationAt(x+dx,y+dy));return height>=6?height:data.wallHeightFt;}
const topMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
const stoneTexture=await new THREE.TextureLoader().loadAsync('old-stone.png');stoneTexture.colorSpace=THREE.SRGBColorSpace;stoneTexture.wrapS=stoneTexture.wrapT=THREE.RepeatWrapping;stoneTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const stoneMaterial=new THREE.MeshStandardMaterial({map:stoneTexture,roughness:.95,metalness:0,side:THREE.DoubleSide});
const sideMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.97,metalness:0,side:THREE.DoubleSide});
// Wall sides use one generated stone material at a fixed map scale. Scenery
// sides retain their local source strips; top caps keep original map UVs.
function raisedSurface(sourceRings,heightAt,wall=false){
 const paths=sourceRings.map(r=>r.map(p=>new THREE.Vector2((p.x/data.width-.5)*mapWidth,(.5-p.y/data.height)*mapDepth)));
 const shape=new THREE.Shape(paths[0]);for(const hole of paths.slice(1))shape.holes.push(new THREE.Path(hole));
 const cap=new THREE.ShapeGeometry(shape).toNonIndexed(),positions=[],uvs=[];let maxHeight=0;
 const add=(p,z,sample,stoneUV)=>{positions.push((p.x/data.width-.5)*mapWidth,(.5-p.y/data.height)*mapDepth,z*feetToWorld);uvs.push(...(stoneUV??[sample.x/data.width,1-sample.y/data.height]));};
 for(let i=0;i<cap.attributes.position.count;i++){
  const p={x:(cap.attributes.position.getX(i)/mapWidth+.5)*data.width,y:(.5-cap.attributes.position.getY(i)/mapDepth)*data.height};
  const height=heightAt(p.x,p.y);maxHeight=Math.max(maxHeight,height);add(p,height,p);
 }
 const capCount=positions.length/3;cap.dispose();
 const contains=p=>pointInRing(p,sourceRings[0])&&!sourceRings.slice(1).some(h=>pointInRing(p,h));
 let perimeter=0;
 for(const ring of sourceRings)for(let edge=0;edge<ring.length;edge++){
  const a=ring[edge],b=ring[(edge+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<.001)continue;
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let nx=-dy/length,ny=dx/length;
  if(!contains({x:mid.x+nx*.4,y:mid.y+ny*.4})){nx=-nx;ny=-ny;}
  const sample=(p,depth)=>{
   // Find the deepest point of a contiguous interior strip. An endpoint test
   // alone could sample across a doorway or into another disconnected cap.
   let best=null;for(let d=.5;d<=depth;d+=.5){const q={x:p.x+nx*d,y:p.y+ny*d};if(!contains(q))break;best=q;}
   if(best)return best;
   return mid;
  };
  // Short horizontal spans keep the UV strip on the cap of curved/thin walls.
  const spans=Math.max(1,Math.ceil(length/12));
  for(let i=0;i<spans;i++){
   const p={x:a.x+dx*i/spans,y:a.y+dy*i/spans},q={x:a.x+dx*(i+1)/spans,y:a.y+dy*(i+1)/spans};
   const hp=heightAt(p.x,p.y),hq=heightAt(q.x,q.y),bands=1;
   for(let j=0;j<bands;j++){
    const z0p=hp*j/bands,z1p=hp*(j+1)/bands,z0q=hq*j/bands,z1q=hq*(j+1)/bands;
    const pt=sample(p,.5),pb=sample(p,24),qt=sample(q,.5),qb=sample(q,24);
    const u0=(perimeter+length*i/spans)/data.gridSizePx*data.feetPerSquare/8,u1=(perimeter+length*(i+1)/spans)/data.gridSizePx*data.feetPerSquare/8;
    const uv=(u,z)=>wall?[u,z/8]:undefined;
    add(p,z0p,pb,uv(u0,z0p));add(q,z0q,qb,uv(u1,z0q));add(q,z1q,qt,uv(u1,z1q));
    add(p,z0p,pb,uv(u0,z0p));add(q,z1q,qt,uv(u1,z1q));add(p,z1p,pt,uv(u0,z1p));
   }
  }
  perimeter+=length;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 geometry.addGroup(0,capCount,0);geometry.addGroup(capCount,positions.length/3-capCount,1);
 geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,[topMaterial,wall?stoneMaterial:sideMaterial]);mesh.rotation.x=-Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;
 return {mesh,maxHeight,triangles:positions.length/9};
}
const wallStats=[],sceneryStats=[];
for(let index=0;index<walls.length;index++){
 const {mesh,maxHeight,triangles}=raisedSurface(rings[index],wallHeightAt,true);mesh.name='Mask_wall_'+index;wallGroup.add(mesh);
 wallStats.push({id:walls[index].id,maxHeightFt:maxHeight,triangles});
}
for(const item of scenery){
 const {mesh,triangles}=raisedSurface([item.points,...item.holes],()=>item.heightFt);mesh.name=item.id;sceneryGroup.add(mesh);
 sceneryStats.push({id:item.id,heightFt:item.heightFt,triangles});
}
let mode='relief',auto=false;
function update(){
 const wallScale=Number(document.querySelector('#wallHeight').value),groundScale=Number(document.querySelector('#terrainHeight').value);
 flat.visible=mode==='flat';levelGround.visible=mode!=='flat';wallGroup.visible=mode!=='flat';wallGroup.scale.y=wallScale;
 sceneryGroup.visible=mode==='relief';sceneryGroup.scale.y=groundScale;
 document.querySelector('#wallValue').textContent=(wallScale*8).toFixed(1)+' ft typical';document.querySelector('#terrainValue').textContent=groundScale.toFixed(2)+'×';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 status.textContent=mode==='flat'?'Original map image on a flat surface.':mode==='walls'?`${walls.length} raised wall pieces. Reusable old stone material on the sides; original art on the tops.`:`${walls.length} walls + ${scenery.length} separately raised scenery shapes (0.5–4 ft). Walls use old stone sides; item art and map tops are preserved.`;
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;update();});
document.querySelectorAll('input[type=range]').forEach(input=>input.oninput=update);
function frame(view='angle'){
 if(view==='scenery'){controls.target.set(-.65,.02,-.65);camera.position.set(-1.3,.8,.3);}
 else {controls.target.set(0,.10,0);camera.position.set(view==='angle'?1.2:0,view==='overhead'?4:view==='low'?.8:2,view==='overhead'?.001:view==='low'?4.2:2.5);}
 controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>frame(b.dataset.view));
document.querySelector('#rotate').onclick=e=>{auto=!auto;e.target.textContent=auto?'Pause rotation':'Rotate map';};
document.querySelector('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else host.requestFullscreen();};
document.querySelector('#download').onclick=async()=>{
 const glb=await new GLTFExporter().parseAsync(map,{binary:true,onlyVisible:true});
 const url=URL.createObjectURL(new Blob([glb],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download='courtyard-'+mode+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.zoom=Math.min(1,camera.aspect/2);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);resize();update();frame();
document.body.dataset.ready='true';window.relief={scene,map,camera,controls,wallStats,sceneryStats,rings,insideWall,feetToWorld};
let onScreen=true;new IntersectionObserver(([entry])=>{onScreen=entry.isIntersecting;}).observe(host);
let previous=performance.now();renderer.setAnimationLoop(now=>{
 const delta=Math.min((now-previous)/1000,.05);previous=now;if(!onScreen)return;
 if(auto){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.26);camera.position.copy(controls.target).add(offset);}
 controls.update();renderer.render(scene,camera);
});
