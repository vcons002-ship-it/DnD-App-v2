import {describe,it,expect} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3} from 'three';
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
});
