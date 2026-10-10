import {BackSide,FrontSide,BufferAttribute,BufferGeometry,Mesh,MeshBasicMaterial,DoubleSide,SkinnedMesh,type Material,type Object3D,type Side} from 'three';

/** Per-renderer cache; geometry reduction runs off the UI thread, once per asset. */
export function createShadowProxies(invalidate:()=>void){
  const material=new MeshBasicMaterial({side:DoubleSide});
  material.shadowSide=BackSide;
  const materials=new Map<Side,MeshBasicMaterial>([[BackSide,material]]),meshMaterials=new WeakMap<Mesh,Material>();
  const geometries=new Map<BufferGeometry,{geometry:BufferGeometry;version:number}>();
  const proxies=new Map<Mesh,Mesh>();
  const jobs=new Map<number,{geometry:BufferGeometry;entry:{geometry:BufferGeometry;version:number}}>();
  let worker:Worker|undefined,workerFailed=false,nextId=0,disposed=false;
  let previousRoots:readonly Object3D[]=[];
  const failWorker=()=>{workerFailed=true;worker?.terminate();worker=undefined;jobs.clear();};
  const reduce=(source:BufferGeometry,entry:{geometry:BufferGeometry;version:number},deforming:boolean)=>{
    const fullCount=source.index?.count??source.getAttribute('position')?.count??0;
    if(workerFailed||typeof Worker==='undefined'||source.drawRange.start!==0||source.drawRange.count<fullCount)return;
    const position=source.getAttribute('position');if(!position||position.count<1024)return;
    try{
      worker??=new Worker(new URL('./shadowMesh.worker.ts',import.meta.url),{type:'module'});
      worker.onerror=failWorker;
      worker.onmessage=(e:MessageEvent<{id:number;indices:Uint32Array}>)=>{
        const job=jobs.get(e.data.id);if(!job||disposed)return;jobs.delete(e.data.id);
        job.entry.geometry.setIndex(new BufferAttribute(e.data.indices,1));job.entry.geometry.setDrawRange(0,Infinity);job.entry.version++;invalidate();
      };
      const contiguous=position instanceof BufferAttribute&&position.itemSize===3&&!position.normalized&&position.array instanceof Float32Array;
      const positions=contiguous?(position.array as Float32Array).slice():new Float32Array(position.count*3);
      if(!contiguous)for(let i=0;i<position.count;i++){positions[i*3]=position.getX(i);positions[i*3+1]=position.getY(i);positions[i*3+2]=position.getZ(i);}
      const index=source.getIndex(),indices=new Uint32Array(index?index.count:position.count);
      for(let i=0;i<indices.length;i++)indices[i]=index?index.getX(i):i;
      const id=++nextId;jobs.set(id,{geometry:source,entry});
      worker.postMessage({id,indices,positions,deforming},[indices.buffer,positions.buffer]);
    }catch{failWorker();}
  };
  return {
    get(node:Object3D){
      if(!(node instanceof Mesh)||!node.castShadow)return null;
      let proxy=proxies.get(node),entry=geometries.get(node.geometry);
      if(!entry){
        const geometry=new BufferGeometry();
        for(const name of ['position','normal','skinIndex','skinWeight'])if(node.geometry.hasAttribute(name))geometry.setAttribute(name,node.geometry.getAttribute(name));
        geometry.morphAttributes=node.geometry.morphAttributes;geometry.morphTargetsRelative=node.geometry.morphTargetsRelative;
        geometry.setIndex(node.geometry.index);geometry.boundingBox=node.geometry.boundingBox;geometry.boundingSphere=node.geometry.boundingSphere;
        geometry.setDrawRange(node.geometry.drawRange.start,node.geometry.drawRange.count);
        entry={geometry,version:0};geometries.set(node.geometry,entry);
        reduce(node.geometry,entry,node instanceof SkinnedMesh||!!node.geometry.morphAttributes.position?.length);
      }
      if(!proxy){
        proxy=node.clone(false);proxy.geometry=entry.geometry;proxy.material=material;
        const originals=Array.isArray(node.material)?node.material:[node.material];
        const sides=originals.map(m=>m.shadowSide??(m.side===FrontSide?BackSide:m.side===BackSide?FrontSide:DoubleSide));
        const side=sides.includes(DoubleSide)?DoubleSide:sides[0]??BackSide;
        let cubeMaterial=materials.get(side);
        if(!cubeMaterial){cubeMaterial=new MeshBasicMaterial({side:DoubleSide});cubeMaterial.shadowSide=side;materials.set(side,cubeMaterial);}
        meshMaterials.set(proxy,cubeMaterial);
        proxy.name='shadow-only-proxy';proxy.matrixAutoUpdate=false;proxy.frustumCulled=node.frustumCulled;proxy.castShadow=true;proxy.receiveShadow=false;proxy.layers.set(0);
        if(proxy instanceof SkinnedMesh)proxy.bindMode='detached';
        proxies.set(node,proxy);
      }
      proxy.matrix.copy(node.matrixWorld);proxy.matrixWorld.copy(node.matrixWorld);proxy.visible=true;
      proxy.morphTargetInfluences=node.morphTargetInfluences;
      if(node instanceof SkinnedMesh)node.skeleton.update();
      return {mesh:proxy,version:entry.version,originalTriangles:(node.geometry.index?.count??node.geometry.getAttribute('position').count)/3,triangles:(entry.geometry.index?.count??entry.geometry.getAttribute('position').count)/3};
    },
    get state(){return {shadowProxyJobs:jobs.size,shadowProxyGeometries:geometries.size};},
    release(roots:readonly Object3D[]){
      if(roots.length===previousRoots.length&&roots.every((root,i)=>root===previousRoots[i]))return;
      previousRoots=[...roots];
      const active=new Set<Mesh>();for(const root of roots)root.traverse(n=>{if(n instanceof Mesh)active.add(n);});
      for(const [node,proxy] of proxies)if(!active.has(node)){proxy.removeFromParent();proxies.delete(node);}
    },
    restoreCubeMaterial(mesh:Mesh){mesh.material=meshMaterials.get(mesh)??material;},
    dispose(){disposed=true;worker?.terminate();jobs.clear();proxies.clear();for(const m of materials.values())m.dispose();materials.clear();for(const entry of geometries.values())entry.geometry.dispose();geometries.clear();},
  };
}
