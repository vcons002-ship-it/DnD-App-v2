import {type Group,type Object3D,Quaternion,Vector3} from 'three';

/** Source art with no pose animation is immutable. Retain its local matrices;
 * moving the outer token root still updates every descendant world matrix. */
export function retainMiniatureLocalTransforms(model:Object3D){
  model.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
}

/** Keep stationary roots clean instead of propagating identical matrices through
 * every body part on every render pass. Accessories remain ordinarily animated. */
export function createMiniatureTransform(root:Group){
  root.matrixAutoUpdate=false;
  const position=new Vector3(Infinity,Infinity,Infinity),scale=new Vector3(),rotation=new Quaternion();
  return ()=>{
    if(position.equals(root.position)&&scale.equals(root.scale)&&rotation.equals(root.quaternion))return false;
    position.copy(root.position);scale.copy(root.scale);rotation.copy(root.quaternion);root.updateMatrix();
    // Publish the whole body before lantern/head anchor queries. localToWorld
    // updates the root alone and clears its dirty flag; a later scene update
    // would then leave retained descendant matrices at the previous position.
    root.updateWorldMatrix(true,true);
    return true;
  };
}
