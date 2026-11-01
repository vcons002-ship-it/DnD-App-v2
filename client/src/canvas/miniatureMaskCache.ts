import {Mesh,Sprite,SkinnedMesh,InstancedMesh,type BufferAttribute,type InterleavedBufferAttribute,type Camera,type Scene,type WebGLRenderTarget,type Object3D} from 'three';

/** Compare exact numeric contents without serializing whole instance/bone buffers. */
function retainNumbers(previous:number[],values:ArrayLike<number>,length=values.length){
  let changed=previous.length!==length;
  for(let i=0;i<length;i++)if(previous[i]!==values[i]){previous[i]=values[i];changed=true;}
  previous.length=length;return changed;
}

/** A screen-space body mask depends on pose, visibility and camera, not light.
 * Preserve its exact pixels during flicker; motion/animation refreshes them in
 * the same frame, without a timed cache that could trail behind a camera turn. */
export function createMiniatureMaskCache(){
  let previousCamera='',updates=0,visible=new Set<Object3D>();
  const cameraProjection:number[]=[],cameraWorld:number[]=[];
  const retained=new WeakMap<Object3D,{key:string;matrix:number[];instances:number[];bones:number[];morph:number[]}>();
  return {
    needsRender(target:WebGLRenderTarget,scene:Scene,camera:Camera,worldMatricesCurrent=false){
      camera.updateMatrixWorld();
      if(!worldMatricesCurrent)scene.updateMatrixWorld(true);
      const nextVisible=new Set<Object3D>();
      const cameraKey=`${target.width}:${target.height}:${camera.uuid}`;
      let changed=cameraKey!==previousCamera;previousCamera=cameraKey;
      if(retainNumbers(cameraProjection,camera.projectionMatrix.elements))changed=true;
      if(retainNumbers(cameraWorld,camera.matrixWorld.elements))changed=true;
      scene.traverseVisible(node=>{
        if(!(node instanceof Mesh||node instanceof Sprite)||!((node.layers.mask&((1<<1)|(1<<6)))))return;
        if(node instanceof InstancedMesh&&node.count===0)return;
        const geometry=node.geometry;
        nextVisible.add(node);if(!visible.has(node))changed=true;
        let entry=retained.get(node);
        if(!entry){entry={key:'',matrix:[],instances:[],bones:[],morph:[]};retained.set(node,entry);}
        const key=`${node.layers.mask}:${geometry.uuid}:${node.userData.outlineId??''}:${node.userData.bodySlot??''}:${geometry.getAttribute('instanceBodySlot')?.version??''}:${geometry.getAttribute('instanceOutline')?.version??''}:${geometry.getAttribute('position')?.version??''}:${geometry.index?.version??''}:${geometry.drawRange.start},${geometry.drawRange.count}:${geometry.groups.length}:${geometry.morphTargetsRelative?1:0}:${geometry.morphAttributes.position?.map((a:BufferAttribute|InterleavedBufferAttribute)=>'data' in a?a.data.version:a.version).join(',')??''}:${node instanceof Sprite?`${node.center.x},${node.center.y}:${node.material.map?.uuid??''}:${node.material.map?.version??''}`:''}`;
        if(key!==entry.key){entry.key=key;changed=true;}
        if(retainNumbers(entry.matrix,node.matrixWorld.elements))changed=true;
        if(retainNumbers(entry.morph,node instanceof Mesh?node.morphTargetInfluences??[]:[]))changed=true;
        // An unchanged upload counter does not guarantee unchanged pixels, and
        // fixture animation can upload identical transforms. Compare actual data.
        if(node instanceof InstancedMesh&&retainNumbers(entry.instances,node.instanceMatrix.array,node.count*16))changed=true;
        if(node instanceof SkinnedMesh){
          let i=0;
          for(const bone of node.skeleton.bones)for(const value of bone.matrixWorld.elements){if(entry.bones[i]!==value){entry.bones[i]=value;changed=true;}i++;}
          if(entry.bones.length!==i){entry.bones.length=i;changed=true;}
        }
      });
      if(nextVisible.size!==visible.size)changed=true;
      visible=nextVisible;if(changed)updates++;
      return changed;
    },
    get updates(){return updates;},
  };
}
