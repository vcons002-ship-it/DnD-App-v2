import {describe,it,expect} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3,InstancedMesh,Matrix4} from 'three';
import {createMiniatureMovePreviewGeometry} from '../../client/src/canvas/miniatureMovePreview.js';
describe('baked movement silhouettes',()=>{
 it('preserves the model in token-local coordinates while reducing its material groups to one draw',()=>{
  const root=new Group(),centered=new Group(),model=new Group();root.add(centered);centered.add(model);
  root.position.set(100,0,250);root.scale.setScalar(3);root.rotation.y=.7;centered.position.set(-2,0,-3);
  const geometry=new BoxGeometry(),material=new MeshBasicMaterial(),a=new Mesh(geometry,material),b=new Mesh(geometry,material);
  a.position.set(2,1,3);b.position.set(4,2,6);model.add(a,b);model.rotation.y=.2;
  const source=geometry.getAttribute('position').array.slice(),merged=createMiniatureMovePreviewGeometry(centered),world=new Vector3();
  const points=merged.getAttribute('position');let i=0;
  for(const mesh of [a,b])for(let j=0;j<geometry.index!.count;j++){
   const expected=mesh.localToWorld(new Vector3().fromBufferAttribute(geometry.getAttribute('position'),geometry.index!.getX(j)));
   world.fromBufferAttribute(points,i++);root.localToWorld(world);expect(world.distanceTo(expected)).toBeLessThan(.00001);
  }
  expect(merged.groups).toEqual([]);expect(geometry.getAttribute('position').array).toEqual(source);
  expect(points.count).toBe(geometry.index!.count*2);merged.dispose();geometry.dispose();material.dispose();
 });
 it('excludes hidden/outline meshes, respects draw ranges and includes every instanced part',()=>{
  const root=new Group(),source=new Group(),g=new BoxGeometry(),m=new MeshBasicMaterial();root.add(source);
  g.setDrawRange(0,6);const visible=new InstancedMesh(g,m,2);visible.setMatrixAt(1,new Matrix4().makeTranslation(5,0,0));source.add(visible);
  const hidden=new Mesh(g,m);hidden.visible=false;source.add(hidden);const outline=new Mesh(g,m);outline.name='disposition-outline';source.add(outline);
  const merged=createMiniatureMovePreviewGeometry(source),p=merged.getAttribute('position');expect(p.count).toBe(12);
  expect(p.getX(6)-p.getX(0)).toBeCloseTo(5);merged.dispose();g.dispose();m.dispose();
 });
});
