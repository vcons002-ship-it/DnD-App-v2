import {Light,Mesh,Vector4,type Camera,type Group,type Scene,type WebGLRenderer} from 'three';

/** compileAsync links shaders but does not upload vertex/index buffers. Submit
 * one mesh per browser frame with zero pixel coverage, on the real output
 * target/lighting. The old figure keeps rendering while its replacement warms. */
export async function warmMiniatureGpuBuffers(renderer:WebGLRenderer,root:Group,camera:Camera,scene:Scene,cancelled:()=>boolean){
  const meshes:Mesh[]=[];root.traverse(node=>{if(node instanceof Mesh&&node.visible)meshes.push(node)});
  for(const mesh of meshes){
    await new Promise<void>(resolve=>(globalThis as unknown as {requestAnimationFrame:(callback:()=>void)=>number}).requestAnimationFrame(()=>resolve()));
    if(cancelled())return;
    const scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest();
    const layers=camera.layers.mask,autoClear=renderer.autoClear,visible=root.visible;
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
    const parent=root.parent,masks=new Map<import('three').Object3D,number>();
    root.traverse(node=>{masks.set(node,node.layers.mask);node.layers.mask=0});
    const lights:{light:Light;mask:number}[]=[];
    scene.traverse(node=>{if(node instanceof Light){lights.push({light:node,mask:node.layers.mask});node.layers.enable(30)}});
    const culled=mesh.frustumCulled;
    try{
      root.visible=true;mesh.layers.set(30);mesh.frustumCulled=false;
      scene.add(root);camera.layers.set(30);renderer.autoClear=false;
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      renderer.setScissorTest(true);renderer.setScissor(0,0,0,0);
      renderer.render(scene,camera);
    }finally{
      scene.remove(root);if(parent)parent.add(root);
      root.visible=visible;mesh.frustumCulled=culled;
      for(const[node,mask]of masks)node.layers.mask=mask;
      camera.layers.mask=layers;renderer.autoClear=autoClear;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;
      renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      for(const{light,mask}of lights)light.layers.mask=mask;
    }
  }
}
