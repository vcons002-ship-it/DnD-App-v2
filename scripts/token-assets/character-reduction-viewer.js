import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const data=await(await fetch('viewer-data.json')).json();
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),cache=new Map();
const load=async url=>{if(!cache.has(url))cache.set(url,loader.loadAsync(url));return cache.get(url);};
function resources(root){const set=new Set();root?.traverse(n=>{if(n.geometry)set.add(n.geometry);for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){set.add(m);for(const value of Object.values(m))if(value?.isTexture)set.add(value);}});return set;}
function release(root,live){for(const resource of resources(root))if(!live.has(resource)){resource.dispose();if(resource.isTexture&&resource.image?.close)resource.image.close();}}
const panes=[...document.querySelectorAll('.viewport')].map(el=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#171d24');
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;el.append(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(32,1,.01,100);camera.position.set(0,2.5,5);
 const control=new OrbitControls(camera,renderer.domElement);control.target.set(0,1,0);control.minDistance=1;control.maxDistance=10;control.enablePan=false;
 scene.add(new THREE.HemisphereLight('#eaf0ff','#5c5246',2));
 for(const [pos,intensity] of [[[3,6,4],3],[[-3,3,-3],1.5]]){const light=new THREE.DirectionalLight('#fff3df',intensity);light.position.set(...pos);scene.add(light);}
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#272d32',roughness:1}));plane.rotation.x=-Math.PI/2;plane.position.y=-.004;scene.add(plane);
 const grid=new THREE.GridHelper(200,200,'#4b5158','#363d44');scene.add(grid);
 return {el,scene,renderer,camera,control,model:null};
});
let syncing=false;
function render(){for(const p of panes){const w=p.el.clientWidth,h=p.el.clientHeight;p.renderer.setSize(w,h,false);p.camera.aspect=w/h;p.camera.updateProjectionMatrix();p.renderer.render(p.scene,p.camera);}}
for(const p of panes)p.control.addEventListener('change',()=>{if(syncing)return;syncing=true;for(const other of panes)if(other!==p){other.camera.position.copy(p.camera.position);other.camera.quaternion.copy(p.camera.quaternion);other.control.target.copy(p.control.target);other.control.update();}syncing=false;render();});
new ResizeObserver(render).observe(document.querySelector('.views'));
let revision=0;
async function show(){
 const own=++revision,id=document.querySelector('#character').value,profile=document.querySelector('#profile').value;
 document.querySelector('#status').textContent='Loading models…';document.body.dataset.ready='false';
 const source=data.originals.find(x=>x.id===id),candidate=data.candidates.find(x=>x.id===id&&x.profile===profile);
 const gltfs=await Promise.all([load(source.filename),load(candidate.filename)]);if(own!==revision)return;
 const oldModels=panes.map(p=>p.model);
 for(let i=0;i<panes.length;i++){
  const p=panes[i];if(p.model)p.scene.remove(p.model);
  const model=gltfs[i].scene.clone(true),def=i===0?source:candidate;
  model.position.set(...def.baseCenter.map(x=>-x));
  const root=new THREE.Group();root.scale.setScalar(1/def.baseDiameter);root.add(model);p.model=root;p.scene.add(root);
  if(def.baseTextureUrl){const texture=await new THREE.TextureLoader().loadAsync(def.baseTextureUrl);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;model.traverse(n=>{if(n.isMesh&&n.name==='Druk_Base_Earthy_Stone_Moss_Top'){n.material=n.material.clone();n.material.map=texture;n.material.color.set('#ffffff');n.material.vertexColors=false;n.material.needsUpdate=true;}});}
 }
 const live=new Set(panes.flatMap(p=>[...resources(p.model)]));
 for(const old of oldModels)release(old,live);
 const keep=new Set([source.filename,candidate.filename]);
 for(const [url,promise] of cache)if(!keep.has(url)){cache.delete(url);promise.then(g=>release(g.scene,live));}
 document.querySelector('#left-info').textContent=`Original · ${source.triangles.toLocaleString()} triangles · ${(source.bytes/1e6).toFixed(2)} MB`;
 document.querySelector('#right-info').textContent=`${profile==='light'?'Lighter':'Conservative'} copy · ${candidate.triangles.toLocaleString()} triangles · ${(candidate.bytes/1e6).toFixed(2)} MB`;
 document.querySelector('#status').textContent='Drag either model to rotate both. Pinch or scroll to zoom. Textures are unchanged.';
 render();document.body.dataset.ready='true';
}
document.querySelector('#character').onchange=show;document.querySelector('#profile').onchange=show;
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=()=>{
 const face=button.dataset.angle==='face';let head;
 panes[0].model?.traverse(n=>{if(!head&&/head|face/i.test(n.name))head=n;});
 const center=head?new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()):new THREE.Vector3(0,1.8,0);
 const target=face?center.toArray():[0,1,0];
 const pos=face?[center.x,center.y,center.z+1.1]:{front:[0,1,5],tilt:[0,4.2,4.2],overhead:[0,6,.001],back:[0,2,-5]}[button.dataset.angle];
 syncing=true;for(const p of panes){p.camera.position.set(...pos);p.control.target.set(...target);p.control.update();}syncing=false;render();
};
window.addEventListener('keydown',e=>{if(e.key==='r')document.querySelector('[data-angle=tilt]').click();});
show().catch(e=>{document.querySelector('#status').textContent=e.message;console.error(e);});
