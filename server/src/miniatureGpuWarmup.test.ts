import {afterEach,it,expect,vi} from 'vitest';
import {BoxGeometry,DirectionalLight,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,Vector4} from 'three';
import {warmMiniatureGpuBuffers} from '../../client/src/canvas/miniatureGpuWarmup.js';

afterEach(()=>vi.unstubAllGlobals());
function fixture(){
  const scene=new Scene(),camera=new PerspectiveCamera(),root=new Group(),light=new DirectionalLight();
  const meshes=Array.from({length:2},()=>new Mesh(new BoxGeometry(),new MeshBasicMaterial()));
  root.add(...meshes);scene.add(light);root.visible=false;
  const scissor=new Vector4(10,20,300,200);
  const renderer={autoClear:true,shadowMap:{autoUpdate:true,needsUpdate:true},scissorTest:false,
    getScissor:(out:Vector4)=>out.copy(scissor),getScissorTest:()=>renderer.scissorTest,
    setScissor:(a:Vector4|number,b?:number,c?:number,d?:number)=>{if(a instanceof Vector4)scissor.copy(a);else scissor.set(a,b!,c!,d!)},
    setScissorTest:(value:boolean)=>{renderer.scissorTest=value},render:vi.fn(()=>{
      expect(scissor.toArray()).toEqual([0,0,0,0]);
      expect(camera.layers.mask).toBe(1<<30);expect(light.layers.mask).toBe(1|(1<<30));
      expect(renderer.autoClear).toBe(false);expect(renderer.shadowMap.needsUpdate).toBe(false);
      expect(root.visible).toBe(true);
      expect(meshes.filter(m=>m.layers.test(camera.layers))).toHaveLength(1);
    })};
  return{scene,camera,root,light,meshes,renderer,scissor};
}
it('uploads one mesh per frame without painting pixels or altering the live view',async()=>{
  const f=fixture(),frame=vi.fn(cb=>{cb(0);return 1});vi.stubGlobal('requestAnimationFrame',frame);
  await warmMiniatureGpuBuffers(f.renderer as any,f.root,f.camera,f.scene,()=>false);
  expect(frame).toHaveBeenCalledTimes(2);expect(f.renderer.render).toHaveBeenCalledTimes(2);
  expect(f.root.parent).toBeNull();expect(f.root.visible).toBe(false);
  expect(f.camera.layers.mask).toBe(1);expect(f.light.layers.mask).toBe(1);
  expect(f.meshes.every(m=>m.layers.mask===1&&m.frustumCulled)).toBe(true);
  expect(f.renderer.autoClear).toBe(true);expect(f.renderer.scissorTest).toBe(false);
  expect(f.renderer.shadowMap).toEqual({autoUpdate:true,needsUpdate:true});
  expect(f.scissor.toArray()).toEqual([10,20,300,200]);
});
it('cancels superseded detail without submitting a draw',async()=>{
  const f=fixture();vi.stubGlobal('requestAnimationFrame',(cb:(time:number)=>void)=>{cb(0);return 1});
  await warmMiniatureGpuBuffers(f.renderer as any,f.root,f.camera,f.scene,()=>true);
  expect(f.renderer.render).not.toHaveBeenCalled();expect(f.root.parent).toBeNull();
});
it('restores render state and parent even if an upload fails',async()=>{
  const f=fixture();f.scene.add(f.root);
  vi.stubGlobal('requestAnimationFrame',(cb:(time:number)=>void)=>{cb(0);return 1});
  f.renderer.render.mockImplementation(()=>{throw Error('upload failed')});
  await expect(warmMiniatureGpuBuffers(f.renderer as any,f.root,f.camera,f.scene,()=>false)).rejects.toThrow('upload failed');
  expect(f.root.parent).toBe(f.scene);expect(f.root.visible).toBe(false);
  expect(f.camera.layers.mask).toBe(1);expect(f.light.layers.mask).toBe(1);
  expect(f.renderer.autoClear).toBe(true);expect(f.scissor.toArray()).toEqual([10,20,300,200]);
});
