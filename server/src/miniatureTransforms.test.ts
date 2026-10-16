import {describe,it,expect} from 'vitest';
import {Group,Scene,Mesh,BoxGeometry,MeshBasicMaterial,Vector3} from 'three';
import {createMiniatureTransform,retainMiniatureLocalTransforms} from '../../client/src/canvas/miniatureTransforms.js';

describe('retained miniature transforms',()=>{
  it('reuses fixed local matrices and refreshes every descendant when the token moves, rotates or scales',()=>{
    const root=new Group(),model=new Group(),body=new Mesh(new BoxGeometry(),new MeshBasicMaterial());
    model.position.y=2;body.position.x=1;model.add(body);root.add(model);
    retainMiniatureLocalTransforms(model);const update=createMiniatureTransform(root);
    expect(update()).toBe(true);root.updateMatrixWorld();expect(update()).toBe(false);
    const before=body.matrixWorld.clone();root.position.x=8;root.rotation.y=Math.PI/2;root.scale.setScalar(2);
    expect(update()).toBe(true);root.updateMatrixWorld();
    expect(new Vector3().setFromMatrixPosition(body.matrixWorld).toArray()).toEqual([8,4,-2]);
    expect(body.matrixWorld.equals(before)).toBe(false);expect(update()).toBe(false);
    body.geometry.dispose();(body.material as MeshBasicMaterial).dispose();
  });
  it('keeps the body with its lantern when an anchor query runs before the scene draw',()=>{
    const scene=new Scene();scene.matrixAutoUpdate=false;scene.matrixWorldAutoUpdate=false;
    const root=new Group(),model=new Group(),body=new Mesh(new BoxGeometry(),new MeshBasicMaterial());
    body.position.y=2;model.add(body);root.add(model);scene.add(root);
    retainMiniatureLocalTransforms(model);const update=createMiniatureTransform(root);
    update();scene.updateMatrixWorld();
    for(const x of [2,5,9]){
      root.position.x=x;expect(update()).toBe(true);
      // The carried-lantern pass asks for its world anchor before rendering.
      // localToWorld updates the root and consumes its world-dirty flag.
      const lamp=root.localToWorld(new Vector3(0,3,0));
      scene.updateMatrixWorld();
      expect(new Vector3().setFromMatrixPosition(body.matrixWorld).x).toBe(lamp.x);
      expect(update()).toBe(false);
    }
    body.geometry.dispose();(body.material as MeshBasicMaterial).dispose();
  });
});
