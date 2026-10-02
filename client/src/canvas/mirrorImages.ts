import {Box3,CanvasTexture,Color,Group,HemisphereLight,DirectionalLight,Mesh,OrthographicCamera,Scene,Sprite,SpriteMaterial,Vector3,WebGLRenderTarget,WebGLRenderer,SRGBColorSpace, type Camera, type Texture} from 'three';
import {MIRROR_IMAGE_SPREAD} from '../../../shared/linkedSpells';

/** Raster copies of the actual loaded figure. They borrow its geometry and
 * textures only while capturing; each ghost then costs one transparent quad.
 * No raycasts, outlines, shadow casting, or separate model downloads. */
export function createMirrorImages(model:Group,root:Group,renderer:WebGLRenderer,environment:()=>Texture|null,diameter:number) {
  const ghosts=new Group();ghosts.name='mirror-image-duplicates';root.add(ghosts);
  const material=new SpriteMaterial({transparent:true,opacity:.38,depthWrite:false,toneMapped:false,color:new Color('#c8d8ff')});
  const visibilityMaterial=new SpriteMaterial({depthWrite:false,toneMapped:false,alphaTest:.01});
  // Preserve the image's alpha silhouette, while marking its personal/shared
  // visibility independently of the colors of the captured costume.
  visibilityMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb=diffuse;');
  };
  const copies=Array.from({length:3},()=>{const s=new Sprite(material);s.raycast=()=>{};ghosts.add(s);return s;});
  let texture:CanvasTexture|undefined,key='';
  function update(count:number,camera:Camera,shared:boolean,hidden:boolean) {
    ghosts.visible=count>0;
    // Transparent ghosts must not enter the opaque personal-depth pass: its
    // override material would turn an alpha-cut figure into a solid rectangle.
    copies.forEach((s,i)=>{s.visible=i<count;s.layers.set(0);s.layers.enable(6);if(shared)s.layers.enable(4);});
    visibilityMaterial.color.setRGB(shared?0:1,1,1);
    if(!count)return;
    material.opacity=hidden?.2:.38;
    // Capture only after view/facing changes appreciably, never every idle frame.
    const direction=camera.getWorldDirection(new Vector3()).negate().applyAxisAngle(new Vector3(0,1,0),-root.rotation.y);
    const captureKey=[Math.round(Math.atan2(direction.x,direction.z)*6),Math.round(direction.y*8)].join(':');
    if(texture&&key===captureKey)return;
    const scene=new Scene();scene.environment=environment();
    const figure=model.clone(true);
    figure.traverse(node=>{node.layers.set(0);if(node instanceof Mesh){node.castShadow=false;node.receiveShadow=false;}});
    const remove:Mesh[]=[];figure.traverse(node=>{if(node instanceof Mesh&&node.name==='disposition-outline')remove.push(node);});
    remove.forEach(n=>n.removeFromParent());scene.add(figure);
    scene.add(new HemisphereLight('#ffffff','#737785',2));
    const light=new DirectionalLight('#fff1dd',3);light.position.set(-3,6,4);scene.add(light);
    figure.updateMatrixWorld(true);
    const box=new Box3().setFromObject(figure),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
    const extent=Math.max(size.length()*.55,diameter*.65);
    const capture=new OrthographicCamera(-extent,extent,extent,-extent,.01,extent*8);
    capture.position.copy(center).addScaledVector(direction,extent*4);capture.lookAt(center);capture.updateMatrixWorld();
    const target=new WebGLRenderTarget(512,512,{depthBuffer:true});
    const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new Color()),oldAlpha=renderer.getClearAlpha(),oldShadow=renderer.shadowMap.enabled;
    try {
      renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,capture);
      const pixels=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(target,0,0,512,512,pixels);
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext('2d')!,data=ctx.createImageData(512,512);
      for(let y=0;y<512;y++)data.data.set(pixels.subarray((511-y)*512*4,(512-y)*512*4),y*512*4);
      ctx.putImageData(data,0,0);texture?.dispose();texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;material.map=texture;material.needsUpdate=true;visibilityMaterial.map=texture;visibilityMaterial.needsUpdate=true;
      copies.forEach((s,i)=>{const angle=i*Math.PI*2/3;s.position.copy(center).add(new Vector3(Math.cos(angle)*diameter*MIRROR_IMAGE_SPREAD,diameter*.03,Math.sin(angle)*diameter*MIRROR_IMAGE_SPREAD));s.scale.set(extent*2,extent*2,1);});
      key=captureKey;
    } finally {renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);renderer.shadowMap.enabled=oldShadow;target.dispose();}
  }
  return {update,setVisibilityPass(enabled:boolean){copies.forEach(s=>{s.material=enabled?visibilityMaterial:material;});},dispose(){ghosts.removeFromParent();texture?.dispose();material.dispose();visibilityMaterial.dispose();}};
}
