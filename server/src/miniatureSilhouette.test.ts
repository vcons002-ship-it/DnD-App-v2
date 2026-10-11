import {describe,it,expect} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshBasicMaterial,OrthographicCamera,Scene,Vector3,WebGLRenderTarget} from 'three';
import {centeredMiniatureOutlineBounds,isMiniatureWeaponPart,mergeOutlineRects} from '../../client/src/canvas/miniatureSilhouetteOutline.js';
import {createMiniatureMaskCache} from '../../client/src/canvas/miniatureMaskCache.js';
describe('silhouette mask reuse',()=>{
 it('softens authored weapon parts without dimming merged bodies',()=>{
  expect(isMiniatureWeaponPart('DrukV7_Approved_BoneSword')).toBe(true);
  expect(isMiniatureWeaponPart('VarisV5_Right_Generated_Weapon')).toBe(true);
  expect(isMiniatureWeaponPart('VanecV4_Multiview_Staff_Dense')).toBe(true);
  expect(isMiniatureWeaponPart('Mercenary_Sword_Body')).toBe(false);
  expect(isMiniatureWeaponPart('Vanec_Refined_Head')).toBe(false);
 });
 it('centers outline bounds once without moving the model or clipping its head',()=>{
  const model=new Group(),mesh=new Mesh(new BoxGeometry(2,4,2),new MeshBasicMaterial());
  mesh.position.set(.1,1,.2);model.add(mesh);model.position.x=.3;
  const before=model.position.clone(),bounds=centeredMiniatureOutlineBounds(model,[.4,-1,.2]);
  expect(model.position.equals(before)).toBe(true);
  const placed=new Group();placed.position.set(-.4,1,-.2);placed.add(model);
  const actual=new Box3().setFromObject(placed);
  expect(bounds.min.distanceTo(actual.min)).toBeLessThan(1e-6);
  expect(bounds.max.distanceTo(actual.max)).toBeLessThan(1e-6);
  expect(bounds.min.y).toBe(0);expect(bounds.max.y).toBe(4);
  expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0);
  mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();
 });
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
