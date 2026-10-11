import {DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,Mesh,MeshBasicMaterial,MeshStandardMaterial,type Group,type Material,type Scene} from 'three';
import {createMiniatureBatchLighting,createMiniatureSharedLighting,type MiniatureLightUniforms} from './miniatureBatchLighting.js';
type Lighting={signature:string;uniforms:MiniatureLightUniforms};
export type BatchFigure={root:Group;lighting:Lighting;eligible:boolean};
type Member={mesh:Mesh;material:MeshBasicMaterial|MeshStandardMaterial;lighting:Lighting;layers:number};
type Bucket={mesh:InstancedMesh;capacity:number;lighting:ReturnType<typeof createMiniatureBatchLighting>|ReturnType<typeof createMiniatureSharedLighting>;members:Mesh[];layers:number};

/** Color and directional shadows use the visible instances. Local point-light
 * shadows use independent proxies; source meshes on layer 7 are never relied on. */
export function createMiniatureBatches(scene:Scene){
  const buckets=new Map<string,Bucket>(),suppressed=new Map<Mesh,number>();
  const meshes=new WeakMap<Group,Mesh[]>();
  const restore=()=>{for(const [mesh,layers] of suppressed)mesh.layers.mask=layers;suppressed.clear();};
  const remove=(b:Bucket)=>{scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.dispose();b.lighting.dispose();(b.mesh.material as Material).dispose();};
  return {restore,
    update(figures:readonly BatchFigure[],enabled=true,worldMatricesCurrent=false,perInstanceLighting=true){
      restore();
      const groups=new Map<string,Member[]>();
      if(enabled)for(const figure of figures){
        if(!figure.eligible||!figure.root.visible)continue;
        let source=meshes.get(figure.root);
        if(!source){source=[];figure.root.children[0]?.traverse(node=>{if(node instanceof Mesh)source!.push(node);});meshes.set(figure.root,source);}
        if(!worldMatricesCurrent)figure.root.updateWorldMatrix(true,true);
        // A transparent primitive keeps the whole figure on its original path.
        if(source.some(m=>Array.isArray(m.material)||!(m.material instanceof MeshStandardMaterial||m.material instanceof MeshBasicMaterial)||m.material.opacity<1||(m.material.transparent&&m.name!=='disposition-outline')||(m as Mesh&{isSkinnedMesh?:boolean}).isSkinnedMesh||m.morphTargetInfluences?.length))continue;
        for(const mesh of source){
          const material=mesh.material as Member['material'];if(!mesh.visible||!material.visible)continue;
          const outline=mesh.name==='disposition-outline';
          const key=JSON.stringify([mesh.geometry.uuid,outline?'outline':material.userData.batchSource,mesh.layers.mask,mesh.renderOrder,mesh.receiveShadow,mesh.castShadow,material.opacity,perInstanceLighting?'rows':figure.lighting.signature]);
          const members=groups.get(key)??[];members.push({mesh,material,lighting:figure.lighting,layers:mesh.layers.mask});groups.set(key,members);
        }
      }
      const active=new Set<string>();let instances=0;
      for(const [key,members] of groups){
        if(members.length<(perInstanceLighting?2:3))continue;
        active.add(key);const first=members[0];let bucket=buckets.get(key);
        if(!bucket||bucket.capacity<members.length){
          if(bucket)remove(bucket);
          const capacity=2**Math.ceil(Math.log2(members.length)),material=first.material.clone();
          material.color.set(0xffffff);
          material.onBeforeCompile=first.material.onBeforeCompile;
          material.customProgramCacheKey=first.material.customProgramCacheKey;
          const lighting=perInstanceLighting?createMiniatureBatchLighting(capacity):createMiniatureSharedLighting(first.lighting.uniforms);lighting.attach(material);
          // Per-instance affinity IDs share the body-mask pass, not color lighting.
          const geometry=first.mesh.geometry.clone();
          geometry.setAttribute('instanceOutline',new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));
          geometry.setAttribute('instanceTorchRow',new InstancedBufferAttribute(Float32Array.from({length:capacity},(_,i)=>i),1));
          geometry.setAttribute('instanceGroundPoint',new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage));
          const mesh=new InstancedMesh(geometry,material,capacity);mesh.name='batched-miniatures';
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.layers.mask=first.layers;mesh.receiveShadow=first.mesh.receiveShadow;mesh.castShadow=first.mesh.castShadow;mesh.renderOrder=first.mesh.renderOrder;
          bucket={mesh,capacity,lighting,members:[],layers:first.layers};buckets.set(key,bucket);scene.add(mesh);
        }
        let matrixChanged=bucket.mesh.count!==members.length,colorChanged=false,outlineChanged=false,groundChanged=false;
        const outlines=bucket.mesh.geometry.getAttribute('instanceOutline') as InstancedBufferAttribute;
        const groundPoints=bucket.mesh.geometry.getAttribute('instanceGroundPoint') as InstancedBufferAttribute;
        bucket.mesh.count=members.length;
        const data=bucket.mesh.instanceMatrix.array;
        for(let i=0;i<members.length;i++){
          const member=members[i],elements=member.mesh.matrixWorld.elements;
          bucket.lighting.write(i,member.lighting.uniforms);
          const ground=member.lighting.uniforms.torchGroundPoint?.value;
          const gx=Math.fround(ground?.x??0),gy=Math.fround(ground?.y??0);
          if(groundPoints.getX(i)!==gx||groundPoints.getY(i)!==gy){groundPoints.setXY(i,gx,gy);groundChanged=true;}
          const outlineId=member.mesh.userData.outlineId??0;
          if(outlines.getX(i)!==outlineId){outlines.setX(i,outlineId);outlineChanged=true;}
          // Compare in the GPU buffer's Float32 precision. A fixed absolute
          // epsilon treated stationary fractional map positions as movement,
          // uploading identical matrices and invalidating depth every frame.
          if(bucket.members[i]!==member.mesh||elements.some((v,j)=>Math.fround(v)!==data[i*16+j])){
            bucket.mesh.setMatrixAt(i,member.mesh.matrixWorld);matrixChanged=true;
          }
          const colors=bucket.mesh.instanceColor?.array,color=member.material.color;
          if(!colors||Math.abs(colors[i*3]-color.r)>1e-6||Math.abs(colors[i*3+1]-color.g)>1e-6||Math.abs(colors[i*3+2]-color.b)>1e-6){bucket.mesh.setColorAt(i,color);colorChanged=true;}
          suppressed.set(member.mesh,member.layers);member.mesh.layers.set(7);
        }
        bucket.members=members.map(m=>m.mesh);
        if(matrixChanged){bucket.mesh.instanceMatrix.needsUpdate=true;bucket.mesh.computeBoundingSphere();}
        if(outlineChanged)outlines.needsUpdate=true;
        if(groundChanged)groundPoints.needsUpdate=true;
        if(colorChanged&&bucket.mesh.instanceColor)bucket.mesh.instanceColor.needsUpdate=true;
        bucket.lighting.flush();
        instances+=members.length;
      }
      for(const [key,bucket] of buckets)if(!active.has(key)){remove(bucket);buckets.delete(key);}
      return {batches:buckets.size,instances};
    },
    dispose(){restore();for(const bucket of buckets.values())remove(bucket);buckets.clear();},
  };
}
