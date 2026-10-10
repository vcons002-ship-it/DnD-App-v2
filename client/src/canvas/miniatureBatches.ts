import {DynamicDrawUsage,InstancedMesh,Mesh,MeshBasicMaterial,MeshStandardMaterial,type Group,type Material,type Scene,type Vector3,type Vector4} from 'three';
type Lighting={signature:string;uniforms:{torchCount:{value:number};darkvisionDetail:{value:number};torchShadowSlots:{value:number[]};torchPositions:{value:Vector4[]};torchColors:{value:Vector3[]};[key:string]:{value:unknown}}};
export type BatchFigure={root:Group;lighting:Lighting;eligible:boolean};
type Member={mesh:Mesh;material:MeshBasicMaterial|MeshStandardMaterial;lighting:Lighting;layers:number};
type Bucket={mesh:InstancedMesh;capacity:number;uniforms:Lighting['uniforms'];members:Mesh[];layers:number};

/** Color and directional shadows use the visible instances. Local point-light
 * shadows use independent proxies; source meshes on layer 7 are never relied on. */
export function createMiniatureBatches(scene:Scene){
  const buckets=new Map<string,Bucket>(),suppressed=new Map<Mesh,number>();
  const meshes=new WeakMap<Group,Mesh[]>();
  const restore=()=>{for(const [mesh,layers] of suppressed)mesh.layers.mask=layers;suppressed.clear();};
  const remove=(b:Bucket)=>{scene.remove(b.mesh);b.mesh.dispose();(b.mesh.material as Material).dispose();};
  const copyLights=(to:Lighting['uniforms'],from:Lighting['uniforms'])=>{
    to.torchCount.value=from.torchCount.value;to.darkvisionDetail.value=from.darkvisionDetail.value;
    for(let i=0;i<8;i++){
      to.torchPositions.value[i].copy(from.torchPositions.value[i]);to.torchColors.value[i].copy(from.torchColors.value[i]);
      to.torchShadowSlots.value[i]=from.torchShadowSlots.value[i];
    }
  };
  return {restore,
    update(figures:readonly BatchFigure[],enabled=true){
      restore();
      const groups=new Map<string,Member[]>();
      if(enabled)for(const figure of figures){
        if(!figure.eligible||!figure.root.visible)continue;
        let source=meshes.get(figure.root);
        if(!source){source=[];figure.root.children[0]?.traverse(node=>{if(node instanceof Mesh)source!.push(node);});meshes.set(figure.root,source);}
        figure.root.updateWorldMatrix(true,true);
        // A transparent primitive keeps the whole figure on its original path.
        if(source.some(m=>Array.isArray(m.material)||!(m.material instanceof MeshStandardMaterial||m.material instanceof MeshBasicMaterial)||m.material.opacity<1||(m.material.transparent&&m.name!=='disposition-outline')||(m as Mesh&{isSkinnedMesh?:boolean}).isSkinnedMesh||m.morphTargetInfluences?.length))continue;
        for(const mesh of source){
          const material=mesh.material as Member['material'];if(!mesh.visible||!material.visible)continue;
          const outline=mesh.name==='disposition-outline';
          const key=JSON.stringify([mesh.geometry.uuid,outline?'outline':material.userData.batchSource,mesh.layers.mask,mesh.renderOrder,mesh.receiveShadow,mesh.castShadow,material.opacity,outline?'':figure.lighting.signature]);
          const members=groups.get(key)??[];members.push({mesh,material,lighting:figure.lighting,layers:mesh.layers.mask});groups.set(key,members);
        }
      }
      const active=new Set<string>();let instances=0;
      for(const [key,members] of groups){
        if(members.length<3)continue;
        active.add(key);const first=members[0];let bucket=buckets.get(key);
        if(!bucket||bucket.capacity<members.length){
          if(bucket)remove(bucket);
          const capacity=2**Math.ceil(Math.log2(members.length)),material=first.material.clone();
          material.color.set(0xffffff);
          const src=first.lighting.uniforms;
          const uniforms={...src,torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:src.torchPositions.value.map(v=>v.clone())},torchColors:{value:src.torchColors.value.map(v=>v.clone())}};
          const hook=first.material.onBeforeCompile,cache=first.material.customProgramCacheKey();
          material.onBeforeCompile=function(shader,renderer){hook.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);};
          material.customProgramCacheKey=()=>cache+'-batched';
          const mesh=new InstancedMesh(first.mesh.geometry,material,capacity);mesh.name='batched-miniatures';
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.layers.mask=first.layers;mesh.receiveShadow=first.mesh.receiveShadow;mesh.castShadow=first.mesh.castShadow;mesh.renderOrder=first.mesh.renderOrder;
          bucket={mesh,capacity,uniforms,members:[],layers:first.layers};buckets.set(key,bucket);scene.add(mesh);
        }
        copyLights(bucket.uniforms,first.lighting.uniforms);
        let matrixChanged=bucket.mesh.count!==members.length,colorChanged=false;
        bucket.mesh.count=members.length;
        const data=bucket.mesh.instanceMatrix.array;
        for(let i=0;i<members.length;i++){
          const member=members[i],elements=member.mesh.matrixWorld.elements;
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
        if(colorChanged&&bucket.mesh.instanceColor)bucket.mesh.instanceColor.needsUpdate=true;
        instances+=members.length;
      }
      for(const [key,bucket] of buckets)if(!active.has(key)){remove(bucket);buckets.delete(key);}
      return {batches:buckets.size,instances};
    },
    dispose(){restore();for(const bucket of buckets.values())remove(bucket);buckets.clear();},
  };
}
