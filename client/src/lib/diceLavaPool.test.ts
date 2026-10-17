import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createDiceLavaPool} from './diceLavaPool';

describe('Druk lava overlays',()=>{
 it('draws rising effects after the transparent floor layers while retaining solid-object occlusion',()=>{
  const root=new THREE.Group(),pool=createDiceLavaPool(root);
  try{
   pool.start(new THREE.Vector3(0,0,.7),.85,0,42);pool.update(4000,1.2,true);
   const surface=root.getObjectByName('lava-pool') as THREE.Mesh;
   const flame=root.getObjectByName('lava-flame') as THREE.Mesh;
   const smoke=root.getObjectByName('lava-smoke') as THREE.InstancedMesh;
   const splat=root.getObjectByName('lava-splatter') as THREE.Mesh;
   // Depth sorting alone let the floor paint over upright translucent art.
   expect(flame.renderOrder).toBeGreaterThan(surface.renderOrder);
   expect(smoke.renderOrder).toBeGreaterThan(flame.renderOrder);
   expect(splat.renderOrder).toBeGreaterThan(surface.renderOrder);
   for(const mesh of [flame,smoke]){
    const mat=mesh.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);expect(mat.depthWrite).toBe(false);
    expect(mat.depthTest).toBe(true); // Do not make smoke show through tray walls.
   }
  }finally{pool.dispose();}
  expect(root.children).toHaveLength(0);
 });

 it('keeps a bounded, continuously rising plume and clears it with the pool',()=>{
  const root=new THREE.Group(),pool=createDiceLavaPool(root);
  try{
   pool.start(new THREE.Vector3(0,0,.7),.85,0,42);pool.update(4000,1.2,true);
   const smoke=root.getObjectByName('lava-smoke') as THREE.InstancedMesh;
   const mat=smoke.material as THREE.ShaderMaterial;
   expect(smoke.count).toBeLessThanOrEqual(8);
   const poses=smoke.instanceMatrix.array.slice();
   pool.update(4300,1.5,true);
   expect(smoke.instanceMatrix.array).not.toEqual(poses);
   const alpha=smoke.geometry.getAttribute('smokeOpacity');
   expect(Array.from(alpha.array).some(v=>v>0)).toBe(true);
   expect(Array.from(alpha.array).every(v=>v>=0&&v<=1)).toBe(true);
   pool.update(6000,3.2,false);
   expect(smoke.visible).toBe(false);expect(mat.uniforms.strength.value).toBe(0);
   pool.clear();expect(pool.visible()).toBe(false);
  }finally{pool.dispose();}
 });
});
