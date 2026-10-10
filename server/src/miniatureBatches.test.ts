import {describe,it,expect} from 'vitest';
import {BoxGeometry,Color,Group,Mesh,MeshStandardMaterial,Scene,Vector3,Vector4} from 'three';
import {createMiniatureBatches,type BatchFigure} from '../../client/src/canvas/miniatureBatches.js';

describe('static miniature batching',()=>{
  const figures=(scene:Scene):BatchFigure[]=>{
    const geometry=new BoxGeometry();
    return [0,1,2,3].map(i=>{
      const root=new Group(),center=new Group(),material=new MeshStandardMaterial({color:i%2?'red':'blue'});
      material.userData.batchSource='same-authored-material';
      const mesh=new Mesh(geometry,material);mesh.layers.enable(1);mesh.layers.enable(5);mesh.castShadow=true;
      center.add(mesh);root.add(center);root.position.x=i*3;root.rotation.y=i*.2;scene.add(root);
      return {root,eligible:true,lighting:{signature:'same lamps',uniforms:{torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:Array.from({length:8},()=>new Vector4())},torchColors:{value:Array.from({length:8},()=>new Vector3())}}} as any};
    });
  };
  it('retains independent colors and transforms and casts directional shadows from instances',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    expect(batches.update(items)).toEqual({batches:1,instances:4});
    const batch=scene.children.find(n=>n.name==='batched-miniatures') as any;
    expect(batch.castShadow).toBe(true);expect(batch.layers.isEnabled(5)).toBe(true);
    for(let i=0;i<4;i++){
      const mesh=items[i].root.children[0].children[0] as Mesh;
      expect(mesh.castShadow).toBe(true);expect(mesh.layers.mask).toBe(1<<7);
      expect(batch.instanceMatrix.array[i*16+12]).toBe(i*3);
      const color=new Color();batch.getColorAt(i,color);expect(color.equals((mesh.material as MeshStandardMaterial).color)).toBe(true);
    }
    items[0].root.position.x=50;batches.update(items);expect(batch.instanceMatrix.array[12]).toBe(50);
    batches.dispose();expect(scene.children.some(n=>n.name==='batched-miniatures')).toBe(false);
    expect((items[0].root.children[0].children[0] as Mesh).layers.isEnabled(0)).toBe(true);
  });
  it('keeps hidden, shared-sight, animated eligibility and incompatible lights on separate paths',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    items[0].eligible=false;items[1].root.visible=false;
    expect(batches.update(items)).toEqual({batches:0,instances:0});
    items[0].eligible=true;items[1].root.visible=true;
    (items[0].lighting as any).signature='other room lamp';
    expect(batches.update(items)).toEqual({batches:1,instances:3});
    expect((items[0].root.children[0].children[0] as Mesh).layers.isEnabled(0)).toBe(true);
    expect(batches.update(items,false)).toEqual({batches:0,instances:0});
    for(const item of items)expect((item.root.children[0].children[0] as Mesh).layers.isEnabled(0)).toBe(true);
    batches.dispose();
  });
});
