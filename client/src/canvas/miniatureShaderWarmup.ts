import {Color, InstancedMesh, DataTexture, DoubleSide, Float32BufferAttribute, FrontSide, Group, Light, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector4, type Camera, type Scene, type WebGLRenderer} from 'three';
import {createMiniatureTorchLighting} from './miniatureTorchLighting';

/** Compile common body/pewter shaders before an encounter is revealed. These
 * probes contain no creature art or encounter information and are never drawn.
 * Keep their materials alive so Three retains the linked programs for reuse. */
export function createMiniatureShaderWarmup(renderer:WebGLRenderer, torchLighting:ReturnType<typeof createMiniatureTorchLighting>){
  const root=new Group(),geometry=new PlaneGeometry(1,1);
  geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(12).fill(1),3));
  const texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1);
  texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
  const materials=[
    new MeshStandardMaterial({map:texture,side:FrontSide}),
    new MeshStandardMaterial({map:texture,side:DoubleSide}),
    new MeshStandardMaterial({map:texture,bumpMap:texture,vertexColors:true}),
  ];
  for(const material of materials){
    torchLighting.attach(material);
    const batched=material.clone();batched.onBeforeCompile=material.onBeforeCompile;
    const cache=material.customProgramCacheKey();batched.customProgramCacheKey=()=>cache+'-batched';
    const instanced=new InstancedMesh(geometry,batched,1);instanced.setColorAt(0,new Color(0xffffff));instanced.receiveShadow=true;instanced.layers.set(30);root.add(instanced);
    const mesh=new Mesh(geometry,material);mesh.receiveShadow=true;
    mesh.frustumCulled=false;mesh.layers.set(30);root.add(mesh);
  }
  let lastKey='',disposed=false;
  return {
    update(camera:Camera,scene:Scene,shadowKey:string){
      if(disposed||shadowKey===lastKey)return;
      lastKey=shadowKey;
      // Lighting configuration can change between maps; recompile then, never
      // for a camera move or new token. Actual instances still await compileAsync.
      void renderer.compileAsync(root,camera,scene).then(()=>{
        if(disposed||shadowKey!==lastKey)return;
        // Linking alone leaves uniform/attribute setup until the first draw.
        // Finish that setup with zero pixel coverage on the same output target
        // (an offscreen target would select a different tone-mapping shader).
        const scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest();
        const layers=camera.layers.mask,autoClear=renderer.autoClear;
        const shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
        const lights:{light:Light;mask:number}[]=[];
        scene.traverse(node=>{if(node instanceof Light){lights.push({light:node,mask:node.layers.mask});node.layers.enable(30);}});
        try{
          scene.add(root);camera.layers.set(30);renderer.autoClear=false;
          renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
          renderer.setScissorTest(true);renderer.setScissor(0,0,0,0);
          renderer.render(scene,camera);
        }finally{
          scene.remove(root);camera.layers.mask=layers;renderer.autoClear=autoClear;
          renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;
          renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
          for(const {light,mask} of lights)light.layers.mask=mask;
        }
      }).catch(error=>{
        if(!disposed){lastKey='';console.warn('Miniature shader warmup unavailable',error);}
      });
    },
    dispose(){disposed=true;root.traverse(node=>{if(node instanceof InstancedMesh){node.dispose();(node.material as MeshStandardMaterial).dispose();}});materials.forEach(m=>m.dispose());geometry.dispose();texture.dispose();},
  };
}
