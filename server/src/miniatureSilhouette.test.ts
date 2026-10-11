import {describe,it,expect} from 'vitest';
import {BoxGeometry,Mesh,MeshBasicMaterial,OrthographicCamera,Scene,WebGLRenderTarget} from 'three';
import {mergeOutlineRects} from '../../client/src/canvas/miniatureSilhouetteOutline.js';
import {createMiniatureMaskCache} from '../../client/src/canvas/miniatureMaskCache.js';
describe('silhouette mask reuse',()=>{
 it('merges overlapping borders while leaving empty screen space unprocessed',()=>{
  expect(mergeOutlineRects([{x:0,y:0,width:10,height:10},{x:30,y:0,width:10,height:10},{x:8,y:0,width:25,height:10}])).toEqual([{x:0,y:0,width:40,height:10}]);
  expect(mergeOutlineRects([{x:0,y:0,width:10,height:10},{x:30,y:0,width:10,height:10}])).toHaveLength(2);
 });
 it('refreshes affinity changes but reuses the pose mask between identical frames',()=>{
  const cache=createMiniatureMaskCache(),scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,.1,10),target=new WebGLRenderTarget(20,20);
  const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.layers.enable(1);scene.add(mesh);
  expect(cache.needsRender(target,scene,camera)).toBe(true);expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.userData.outlineId=2;expect(cache.needsRender(target,scene,camera)).toBe(true);
  expect(cache.needsRender(target,scene,camera)).toBe(false);
  mesh.position.x=.2;expect(cache.needsRender(target,scene,camera)).toBe(true);
  target.dispose();mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();
 });
});
