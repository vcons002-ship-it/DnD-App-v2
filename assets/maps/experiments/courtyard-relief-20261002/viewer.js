import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {wallContours,pointInRing} from '../../../../shared/wallGeometry.ts';

const host=document.querySelector('#viewport'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#242a30');scene.add(new THREE.AmbientLight(0xffffff,.65));
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,6,-4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:15});sun.shadow.bias=-.00015;sun.shadow.normalBias=.002;scene.add(sun);
renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.8;
const camera=new THREE.PerspectiveCamera(38,1,.01,30);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;
controls.minDistance=1;controls.maxDistance=10;controls.maxPolarAngle=Math.PI*.49;
const [data,walls]=await Promise.all([fetch('relief.json').then(r=>r.json()),fetch('walls.json').then(r=>r.json())]);
const texture=await new THREE.TextureLoader().loadAsync('original.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const mapWidth=3,mapDepth=3*data.height/data.width,feetToWorld=mapWidth/(data.width/data.gridSizePx*data.feetPerSquare);
const map=new THREE.Group();scene.add(map);
const flat=new THREE.Mesh(new THREE.PlaneGeometry(mapWidth,mapDepth),new THREE.MeshBasicMaterial({map:texture}));flat.rotation.x=-Math.PI/2;map.add(flat);
const groundMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
const levelGround=new THREE.Mesh(new THREE.PlaneGeometry(mapWidth,mapDepth),groundMaterial);levelGround.rotation.x=-Math.PI/2;levelGround.position.y=.0001;levelGround.receiveShadow=true;levelGround.name='Original_flat_floor';map.add(levelGround);
const grid=new THREE.PlaneGeometry(mapWidth,mapDepth,data.terrainWidth-1,data.terrainHeight-1);grid.rotateX(-Math.PI/2);
const terrain=new THREE.Mesh(grid,groundMaterial);terrain.receiveShadow=true;terrain.name='Original_map_relief';map.add(terrain);
const wallGroup=new THREE.Group();wallGroup.name='Mask_walls';map.add(wallGroup);
const rings=walls.map(wallContours);
function insideWall(x,y){const p={x,y};return rings.some(r=>pointInRing(p,r[0])&&!r.slice(1).some(h=>pointInRing(p,h)));}
function elevationAt(x,y){const px=Math.min(data.terrainWidth-1,Math.max(0,Math.round(x/data.width*(data.terrainWidth-1)))),py=Math.min(data.terrainHeight-1,Math.max(0,Math.round(y/data.height*(data.terrainHeight-1))));return data.heights[py*data.terrainWidth+px];}
function wallHeightAt(x,y){let height=0;for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2)height=Math.max(height,elevationAt(x+dx,y+dy));return height>=6?height:data.wallHeightFt;}
const topMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
const stoneTexture=await new THREE.TextureLoader().loadAsync('stone-side.png');stoneTexture.colorSpace=THREE.SRGBColorSpace;stoneTexture.wrapS=stoneTexture.wrapT=THREE.RepeatWrapping;
const sideMaterial=new THREE.MeshStandardMaterial({map:stoneTexture,roughness:.97,metalness:0});
const wallStats=[];
for(let index=0;index<walls.length;index++){
 const paths=rings[index].map(r=>r.map(p=>new THREE.Vector2((p.x/data.width-.5)*mapWidth,(.5-p.y/data.height)*mapDepth)));
 const shape=new THREE.Shape(paths[0]);for(const hole of paths.slice(1))shape.holes.push(new THREE.Path(hole));
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false});
 const position=geometry.attributes.position,uv=geometry.attributes.uv;let maxHeight=0;
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
  const px=(x/mapWidth+.5)*data.width,py=(.5-y/mapDepth)*data.height;
  const height=wallHeightAt(px,py);maxHeight=Math.max(maxHeight,height);position.setZ(i,z*height*feetToWorld);
  // Caps retain exact map coordinates. Vertical side UVs are assigned below.
  uv.setXY(i,x/mapWidth+.5,y/mapDepth+.5);
 }
 for(const group of geometry.groups)if(group.materialIndex===1){
  for(let i=group.start;i<group.start+group.count;i++){
   // Tile a real strip of original stone cap art over each vertical face.
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
   const normal=geometry.attributes.normal;
   uv.setXY(i,(Math.abs(normal.getX(i))>.5?y:x)/(feetToWorld*data.stoneTileWidthFt),z/(feetToWorld*data.stoneTileHeightFt));
  }
 }
 geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,[topMaterial,sideMaterial]);mesh.rotation.x=-Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Mask_wall_'+index;
 wallGroup.add(mesh);wallStats.push({id:walls[index].id,maxHeightFt:maxHeight,triangles:position.count/3});
}
const groundHeights=[];
for(let y=0;y<data.terrainHeight;y++)for(let x=0;x<data.terrainWidth;x++){
 const px=x/(data.terrainWidth-1)*data.width,py=y/(data.terrainHeight-1)*data.height;
 const height=data.heights[y*data.terrainWidth+x];
 groundHeights.push(insideWall(px,py)||height>=6?0:height);
}
let mode='walls',auto=false;
function update(){
 const wallScale=Number(document.querySelector('#wallHeight').value),groundScale=Number(document.querySelector('#terrainHeight').value);
 flat.visible=mode==='flat';levelGround.visible=mode==='walls';terrain.visible=mode==='relief';wallGroup.visible=mode!=='flat';wallGroup.scale.y=wallScale;
 const position=grid.attributes.position;
 for(let i=0;i<position.count;i++)position.setY(i,(mode==='relief'?groundHeights[i]*groundScale*feetToWorld:0)+.0001);
 position.needsUpdate=true;grid.computeVertexNormals();grid.computeBoundingSphere();
 document.querySelector('#wallValue').textContent=(wallScale*8).toFixed(1)+' ft typical';document.querySelector('#terrainValue').textContent=groundScale.toFixed(2)+'×';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 status.textContent=mode==='flat'?'Original map image on a flat surface.':mode==='walls'?`${walls.length} mask-derived wall pieces over the original map. Open passages are retained.`:'Mask-derived walls plus elevation-map relief for furniture, rubble and ground. No map pixels were repainted.';
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;update();});
document.querySelectorAll('input[type=range]').forEach(input=>input.oninput=update);
function frame(view='angle'){controls.target.set(0,.10,0);camera.position.set(view==='angle'?1.2:0,view==='overhead'?4:view==='low'?.8:2,view==='overhead'?.001:view==='low'?4.2:2.5);controls.update();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>frame(b.dataset.view));
document.querySelector('#rotate').onclick=e=>{auto=!auto;e.target.textContent=auto?'Pause rotation':'Rotate map';};
document.querySelector('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else host.requestFullscreen();};
document.querySelector('#download').onclick=async()=>{
 const glb=await new GLTFExporter().parseAsync(map,{binary:true,onlyVisible:true});
 const url=URL.createObjectURL(new Blob([glb],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download='courtyard-'+mode+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.zoom=Math.min(1,camera.aspect/2);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);resize();update();frame();
document.body.dataset.ready='true';window.relief={scene,map,camera,controls,wallStats,groundHeights,rings,insideWall,feetToWorld};
let previous=performance.now();renderer.setAnimationLoop(now=>{
 const delta=Math.min((now-previous)/1000,.05);previous=now;
 if(auto){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.26);camera.position.copy(controls.target).add(offset);}
 controls.update();renderer.render(scene,camera);
});
