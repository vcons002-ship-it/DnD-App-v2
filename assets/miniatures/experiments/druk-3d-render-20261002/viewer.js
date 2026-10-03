import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const host=document.querySelector('#viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#20252b');
const pmrem=new THREE.PMREMGenerator(renderer);
const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x555963,2));
const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-3,6,5);light.castShadow=true;
light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-5;light.shadow.camera.right=5;light.shadow.camera.top=5;light.shadow.camera.bottom=-5;light.shadow.bias=-.0001;scene.add(light);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#383e44',roughness:.8,metalness:0}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.005;floor.receiveShadow=true;scene.add(floor);
const camera=new THREE.PerspectiveCamera(35,1,.02,100);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;
controls.minDistance=1;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;
let auto=false,selection='both';const groups=[];
function resize(){const width=host.clientWidth,height=host.clientHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.zoom=selection==='both'?Math.min(1,camera.aspect/1.7):1;camera.updateProjectionMatrix();}
document.querySelectorAll('[data-model]').forEach(button=>button.onclick=()=>{
  selection=button.dataset.model;
  groups.forEach((group,index)=>{group.visible=selection==='both'||selection===String(index);group.position.x=selection==='both'?(index===0?-1.05:1.05):0;});
  document.querySelectorAll('.labels>div').forEach((label,index)=>{label.style.display=selection==='both'||selection===String(index)?'block':'none';label.style.width=selection==='both'?'50%':'100%';});
  resize();frame();
});
function frame(mode='front'){
  controls.target.set(0,mode==='face'?1.35:.85,0);
  camera.position.set(0,mode==='overhead'?5:mode==='tilted'?3.3:mode==='face'?1.45:1.05,mode==='overhead'?.001:mode==='tilted'?2.5:mode==='face'?2.3:3.8);
  controls.update();
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>frame(button.dataset.view));
document.querySelector('#rotate').onclick=event=>{auto=!auto;event.target.textContent=auto?'Pause rotation':'Rotate together';};
const status=document.querySelector('#status');
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
const metadata=await(await fetch('comparison.json')).json();
const measurements=[];
await Promise.all(metadata.models.map(async(def,index)=>{
  const gltf=await loader.loadAsync(def.url),model=gltf.scene;
  model.scale.setScalar(1/def.baseDiameter);
  model.position.set(-def.baseCenter[0]/def.baseDiameter,-def.baseCenter[1]/def.baseDiameter,-def.baseCenter[2]/def.baseDiameter);
  const group=new THREE.Group();group.add(model);group.position.x=index===0?-1.05:1.05;groups[index]=group;
  group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});scene.add(group);
  const bounds=new THREE.Box3().setFromObject(group);measurements.push({id:def.id,min:bounds.min.toArray(),max:bounds.max.toArray()});
}));
status.textContent='Both actual GLBs loaded. Drag to orbit; pinch or scroll to zoom.';
document.body.dataset.ready='true';window.comparison={scene,camera,controls,measurements};
frame();
new ResizeObserver(resize).observe(host);resize();
let previous=performance.now();
renderer.setAnimationLoop(now=>{
  if(auto){const delta=Math.min(.05,(now-previous)/1000),offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.25);camera.position.copy(controls.target).add(offset);}
  previous=now;controls.update();renderer.render(scene,camera);
});
