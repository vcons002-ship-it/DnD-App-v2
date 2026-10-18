import {Box3,BufferGeometry,Matrix4,Mesh,Object3D,Vector3} from 'three';

/** Replace recognized round bases in world space, independently of baked mesh
 * origins, upload wrappers and up-axis rotations. Preserve any intentional hover
 * above the previous support surface. Body/attachment world transforms move once. */
export function refitPewterPedestal(scene:Object3D,diameter:number,buildGeometry:()=>BufferGeometry):Mesh[]{
  if(scene.userData.pewterPedestalSeated)return [];
  scene.updateWorldMatrix(true,true);
  const bases:Mesh[]=[],bodies:Mesh[]=[];
  scene.traverse(node=>{if(node instanceof Mesh)(node.name.endsWith('_round_base')?bases:bodies).push(node);});
  if(!bases.length)return [];
  const bodyWorld=bodies.map(node=>({node,world:node.matrixWorld.clone()}));
  const surfaces=bases.map(node=>{
    const box=new Box3().setFromObject(node),center=box.getCenter(new Vector3()),radius=diameter/2;
    let innerTop=-Infinity;const positions=node.geometry.getAttribute('position'),p=new Vector3();
    for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      if(Math.hypot(p.x-center.x,p.z-center.z)<radius*.8)innerTop=Math.max(innerTop,p.y);
    }
    const oldSurface=Number.isFinite(innerTop)?innerTop:box.max.y;
    return {node,center,floor:box.min.y,lift:box.min.y+.1125*diameter-oldSurface};
  });
  const ordered=surfaces.map(s=>s.lift).sort((a,b)=>a-b),lift=ordered[Math.floor(ordered.length/2)];
  // Assign desired world transforms from snapshots so nested mesh nodes do not
  // inherit a second lift from a mesh parent. Base nodes themselves are not moved.
  const inverse=new Matrix4();
  for(const {node,world}of bodyWorld){
    world.elements[13]+=lift;
    node.parent?.updateWorldMatrix(true,false);
    const local=node.parent?inverse.copy(node.parent.matrixWorld).invert().multiply(world):world;
    local.decompose(node.position,node.quaternion,node.scale);node.updateMatrix();node.updateWorldMatrix(false,false);
  }
  scene.updateWorldMatrix(true,true);
  for(const {node,center,floor}of surfaces){
    const geometry=buildGeometry();
    geometry.applyMatrix4(new Matrix4().makeTranslation(center.x,floor+.0275*diameter,center.z));
    geometry.applyMatrix4(new Matrix4().copy(node.matrixWorld).invert());
    node.geometry.dispose();node.geometry=geometry;
  }
  scene.userData.pewterPedestalSeated=true;scene.updateWorldMatrix(true,true);return bases;
}
