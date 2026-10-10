import {Mesh,Sprite,SkinnedMesh,InstancedMesh,type BufferAttribute,type InterleavedBufferAttribute,type Camera,type Scene,type WebGLRenderTarget} from 'three';

/** A screen-space body mask depends on pose, visibility and camera, not light.
 * Preserve its exact pixels during flicker; motion/animation refreshes them in
 * the same frame, without a timed cache that could trail behind a camera turn. */
export function createMiniatureMaskCache(){
  let previous='',updates=0;
  return {
    needsRender(target:WebGLRenderTarget,scene:Scene,camera:Camera){
      camera.updateMatrixWorld();
      scene.updateMatrixWorld(true);
      const bodies:unknown[]=[];
      scene.traverseVisible(node=>{
        if(!(node instanceof Mesh||node instanceof Sprite)||!((node.layers.mask&((1<<1)|(1<<6)))))return;
        if(node instanceof InstancedMesh&&node.count===0)return;
        const geometry=node.geometry;
        bodies.push([node.uuid,node.layers.mask,node.matrixWorld.elements,geometry.uuid,
          geometry.getAttribute('position')?.version,geometry.index?.version,geometry.drawRange,geometry.groups,
          geometry.morphTargetsRelative,geometry.morphAttributes.position?.map((a:BufferAttribute|InterleavedBufferAttribute)=>'data' in a?a.data.version:a.version),
          node instanceof Mesh?node.morphTargetInfluences:undefined,
          node instanceof SkinnedMesh?node.skeleton.bones.map(b=>b.matrixWorld.elements):undefined,
          // Torch fixtures can upload unchanged matrices while their flames
          // flicker. Compare actual active instances, not the upload counter.
          node instanceof InstancedMesh?[node.count,Array.from(node.instanceMatrix.array.slice(0,node.count*16))]:undefined,
          // Mirrors use their captured alpha silhouette; changing that texture
          // invalidates it even if their world transform remains identical.
          node instanceof Sprite?[node.center.toArray(),node.material.map?.uuid,node.material.map?.version]:undefined]);
      });
      const key=JSON.stringify([target.width,target.height,camera.uuid,
        camera.projectionMatrix.elements,camera.matrixWorld.elements,bodies]);
      const changed=key!==previous;
      previous=key;if(changed)updates++;
      return changed;
    },
    get updates(){return updates;},
  };
}
