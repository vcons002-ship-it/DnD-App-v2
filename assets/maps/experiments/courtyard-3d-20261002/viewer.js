import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const host=document.querySelector('#viewport');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#252a30');
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x939096,2));
const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(-1,3,2);scene.add(light);
const camera=new THREE.PerspectiveCamera(35,1,.001,30);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=.4;controls.maxDistance=5;
controls.maxPolarAngle=Math.PI*.49;
const groups={};let auto=false;
const loader=new GLTFLoader();
await Promise.all(['generated','original-top'].map(async name=>{
 const gltf=await loader.loadAsync(name+'.glb');groups[name]=gltf.scene;scene.add(gltf.scene);
}));
const texture=await new THREE.TextureLoader().loadAsync('original.png');texture.colorSpace=THREE.SRGBColorSpace;
const original=new THREE.Mesh(new THREE.PlaneGeometry(1,832/1216),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
original.rotation.x=-Math.PI/2;groups.original=original;scene.add(original);
function select(name){for(const [key,group]of Object.entries(groups))group.visible=key===name;
 document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===name)));
 document.querySelector('#status').textContent={generated:'Reconstructed 3D map with its generated multi-view texture.','original-top':'Same 3D geometry; original map art projected onto upward-facing surfaces. Sides retain the generated texture.',original:'Original 2D map, unchanged, on a flat plane.'}[name];
}
function frame(view){controls.target.set(0,.10,0);camera.position.set(view==='angle'?.95:0,view==='low'?.40:view==='overhead'?2.1:1.25,view==='overhead'?.001:view==='low'?1.9:1.35);controls.update();}
document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>select(b.dataset.model));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>frame(b.dataset.view));
document.querySelector('#rotate').onclick=e=>{auto=!auto;e.target.textContent=auto?'Pause rotation':'Rotate map';};
document.querySelector('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else host.requestFullscreen();};
function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.zoom=Math.min(1,camera.aspect/1.1);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);resize();select('generated');frame('angle');
document.body.dataset.ready='true';window.mapPreview={scene,camera,controls,groups,select,frame};
let last=performance.now();renderer.setAnimationLoop(now=>{
 const delta=Math.min((now-last)/1000,.05);last=now;
 if(auto){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.28);camera.position.copy(controls.target).add(offset);}
 controls.update();renderer.render(scene,camera);
});
