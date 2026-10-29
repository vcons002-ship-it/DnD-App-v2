import {expect,it,vi} from 'vitest';
import {DirectionalLight,Group,Mesh,BoxGeometry,MeshStandardMaterial,PerspectiveCamera,Scene} from 'three';
import {prepareMiniatureLighting} from '../../client/src/canvas/miniatureLightingPreparation.js';
it('submits shadow variants before yielding and restores live lighting while they compile',async()=>{
 const root=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial()),scene=new Scene(),key=new DirectionalLight(),camera=new PerspectiveCamera();root.add(mesh);scene.add(key);key.castShadow=false;mesh.receiveShadow=false;
 const states:unknown[]=[],done:(()=>void)[]=[];
 const renderer={shadowMap:{enabled:false},compileAsync:vi.fn(()=>{states.push([renderer.shadowMap.enabled,key.castShadow,mesh.receiveShadow]);return new Promise<void>(resolve=>done.push(resolve));})};
 const result=prepareMiniatureLighting(renderer as any,root,camera,scene,key);
 expect(states).toEqual([[false,false,false],[true,true,true],[true,false,true],[false,false,true]]);
 expect(renderer.shadowMap.enabled).toBe(false);expect(key.castShadow).toBe(false);expect(mesh.receiveShadow).toBe(false);
 done.forEach(resolve=>resolve());await result;
});
it('restores scene flags if submission throws',async()=>{
 const root=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial()),key=new DirectionalLight();root.add(mesh);key.castShadow=true;
 const renderer={shadowMap:{enabled:true},compileAsync:vi.fn().mockResolvedValueOnce(undefined).mockImplementation(()=>{throw Error('compile failed');})};
 await expect(prepareMiniatureLighting(renderer as any,root,new PerspectiveCamera(),new Scene(),key)).rejects.toThrow('compile failed');
 expect(renderer.shadowMap.enabled).toBe(true);expect(key.castShadow).toBe(true);expect(mesh.receiveShadow).toBe(false);
});
