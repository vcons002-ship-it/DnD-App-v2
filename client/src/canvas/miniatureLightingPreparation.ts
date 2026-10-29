import {Mesh,type Object3D,type Camera,type DirectionalLight,type Scene,type WebGLRenderer} from 'three';

/** Prepare both directional-shadow configurations while the body is still a
 * loading placeholder. Dungeon/day transitions then reuse linked programs.
 * compileAsync submits synchronously and waits asynchronously; restore scene
 * flags before yielding so an existing scene never draws temporary settings. */
export async function prepareMiniatureLighting(renderer:WebGLRenderer,root:Object3D,camera:Camera,scene:Scene,key:DirectionalLight){
 const enabled=renderer.shadowMap.enabled,casts=key.castShadow,receivers:{mesh:Mesh;receive:boolean}[]=[];
 root.traverse(node=>{if(node instanceof Mesh)receivers.push({mesh:node,receive:node.receiveShadow});});
 const pending:Promise<unknown>[]=[];
 try{
  pending.push(renderer.compileAsync(root,camera,scene));
  for(const state of [{enabled:true,casts:true},{enabled:true,casts:false},{enabled:false,casts:false}]){
   renderer.shadowMap.enabled=state.enabled;key.castShadow=state.casts;
   for(const {mesh} of receivers)mesh.receiveShadow=true;
   pending.push(renderer.compileAsync(root,camera,scene));
  }
 }finally{
  renderer.shadowMap.enabled=enabled;key.castShadow=casts;
  for(const {mesh,receive} of receivers)mesh.receiveShadow=receive;
 }
 await Promise.all(pending);
}
