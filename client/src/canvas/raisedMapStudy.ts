import {Mesh,MeshStandardMaterial,Float32BufferAttribute,Vector3,Material,Texture,type Scene,type Group} from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {visionContains,type PlayerVision} from '../../../shared/playerVision';

/** Disposable courtyard study only. Callers require an explicit preview build
 * flag and URL option; ordinary builds never load this geometry or its assets.
 * The server's saved walls, movement and player vision remain authoritative. */
export function createRaisedMapStudy(scene:Scene,host:HTMLElement,invalidate:()=>void){
 let asset:GLTF|undefined,root:Group|undefined,mapId:string|undefined,current:string|undefined,disposed=false;
 const surfaces:{visibility:Float32BufferAttribute;points:{x:number;y:number}[]}[]=[];let visionKey='';
 void fetch('/uploads/courtyard-study.json').then(r=>{if(!r.ok)throw Error('Missing courtyard study');return r.json();}).then(async metadata=>{
  const gltf=await new GLTFLoader().loadAsync('/uploads/courtyard-study.glb');asset=gltf;
  if(disposed){release();return;}
  mapId=metadata.mapId;root=gltf.scene;
  root.traverse(node=>{
   // The ordinary map/grid/annotations remain in Konva. Only raised surfaces
   // participate in the same depth buffer as the real character miniatures.
   if(node.name==='Original_flat_floor')node.visible=false;
   if(node instanceof Mesh&&node.name!=='Original_flat_floor'){node.castShadow=false;node.receiveShadow=true;node.layers.enable(1);
    for(const material of Array.isArray(node.material)?node.material:[node.material])if(material instanceof MeshStandardMaterial){material.envMapIntensity=.08;
     material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float studyVisible; varying float studyVisibility;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n studyVisibility=studyVisible;');
      shader.fragmentShader='varying float studyVisibility;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n if(studyVisibility<.5)discard;');
     };material.customProgramCacheKey=()=> 'raised-map-study-visibility-v1';
    }
   }
  });
  root.scale.setScalar(metadata.width/3);root.position.set(metadata.width/2,0,metadata.height/2);
  root.updateMatrixWorld(true);
  root.traverse(node=>{if(node instanceof Mesh&&node.name!=='Original_flat_floor'){
   const p=node.geometry.attributes.position,points=[];
   for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);points.push({x:v.x,y:v.z});}
   const visibility=new Float32BufferAttribute(new Float32Array(p.count).fill(0),1);node.geometry.setAttribute('studyVisible',visibility);surfaces.push({visibility,points});
  }});
  root.visible=current===mapId;scene.add(root);host.dataset.raisedMapStudy='ready';invalidate();
 }).catch(error=>{if(!disposed){host.dataset.raisedMapStudy='failed';console.warn('Raised map study unavailable',error);invalidate();}});
 function release(){
  if(!asset)return;const geometry=new Set<Mesh['geometry']>(),materials=new Set<Material>(),textures=new Set<Texture>();
  asset.scene.traverse(node=>{if(node instanceof Mesh){geometry.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof Texture)textures.add(v);}}});
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)t.image.close();});asset=undefined;
 }
 return {sync(id:string|undefined){current=id;if(root)root.visible=id===mapId;},
  update(vision:PlayerVision|undefined,position?:(id:string)=>{x:number;y:number}|undefined){
   if(!root?.visible)return;
   const origins=vision?.origins.map(o=>({...o,...position?.(o.id)}));
   const key=JSON.stringify([!!vision,vision?.heavy,vision?.daylight,origins?.map(o=>[Math.round(o.x/4),Math.round(o.y/4)]),vision?.lights]);if(key===visionKey)return;visionKey=key;
   const adjusted=vision?{...vision,origins:origins!}:undefined,cache=new Map<string,number>();
   for(const surface of surfaces){surface.points.forEach((p,i)=>{
    const cell=Math.round(p.x/3)+','+Math.round(p.y/3);let visible=cache.get(cell);
    if(visible===undefined){
     // Test the front edge of a wall cap toward a personal vision origin,
     // instead of testing inside opaque masonry. Hidden-room walls stay hidden.
     visible=!adjusted||adjusted.origins.some(o=>{const d=Math.hypot(o.x-p.x,o.y-p.y),offset=Math.min(24,Math.max(0,d-.5));return visionContains({...adjusted,origins:[o]}, {x:p.x+(o.x-p.x)*offset/Math.max(d,1),y:p.y+(o.y-p.y)*offset/Math.max(d,1)}.x,p.y+(o.y-p.y)*offset/Math.max(d,1));})?1:0;cache.set(cell,visible);
    }surface.visibility.setX(i,visible);
   });surface.visibility.needsUpdate=true;}
  },dispose(){disposed=true;if(root)scene.remove(root);release();}};
}
