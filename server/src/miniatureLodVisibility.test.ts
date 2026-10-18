import {it,expect} from 'vitest';
import {Box3,Matrix4,OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import {createMiniatureLodVisibility} from '../../client/src/canvas/miniatureLodVisibility.js';

const bounds=new Box3(new Vector3(-1,0,-1),new Vector3(1,6,1));
it('does not promote models outside a zoomed viewport or behind its camera',()=>{
  const camera=new PerspectiveCamera(45,1,.1,100);
  camera.position.set(0,3,10);camera.lookAt(0,3,0);
  const visibility=createMiniatureLodVisibility();visibility.update(camera);
  expect(visibility.contains(bounds,new Matrix4())).toBe(true);
  expect(visibility.contains(bounds,new Matrix4().makeTranslation(30,0,0))).toBe(false);
  expect(visibility.contains(bounds,new Matrix4().makeTranslation(0,0,30))).toBe(false);
  camera.position.set(30,3,10);camera.lookAt(30,3,0);visibility.update(camera);
  expect(visibility.contains(bounds,new Matrix4())).toBe(false);
  expect(visibility.contains(bounds,new Matrix4().makeTranslation(30,0,0))).toBe(true);
});
it('counts a figure whose base is out of view but head intersects the viewport',()=>{
  const camera=new OrthographicCamera(-5,5,5,-5,.1,100);
  camera.position.set(0,0,10);camera.lookAt(0,0,0);
  const visibility=createMiniatureLodVisibility();visibility.update(camera);
  expect(visibility.contains(bounds,new Matrix4().makeTranslation(0,-10,0))).toBe(true);
  expect(visibility.contains(bounds,new Matrix4().makeTranslation(0,-12,0))).toBe(false);
});
it('tracks rotated, scaled model bounds and overhead camera rotation',()=>{
  const camera=new OrthographicCamera(-5,5,5,-5,.1,100);
  camera.position.set(0,20,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const visibility=createMiniatureLodVisibility();visibility.update(camera);
  const matrix=new Matrix4().makeRotationY(Math.PI/3).scale(new Vector3(2,2,2));
  expect(visibility.contains(bounds,matrix)).toBe(true);
  expect(visibility.contains(bounds,matrix.setPosition(30,0,0))).toBe(false);
});
