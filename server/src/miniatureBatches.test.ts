import {describe,it,expect} from 'vitest';
import {BoxGeometry,Color,Group,Mesh,MeshStandardMaterial,Scene,Vector2,Vector3,Vector4} from 'three';
import {createMiniatureBatches,type BatchFigure} from '../../client/src/canvas/miniatureBatches.js';

describe('static miniature batching',()=>{
  const figures=(scene:Scene):BatchFigure[]=>{
    const geometry=new BoxGeometry();
    return [0,1,2,3].map(i=>{
      const root=new Group(),center=new Group(),material=new MeshStandardMaterial({color:i%2?'red':'blue'});
      material.userData.batchSource='same-authored-material';
      const mesh=new Mesh(geometry,material);mesh.layers.enable(1);mesh.layers.enable(5);mesh.castShadow=true;
      mesh.userData.outlineId=i+1;
      mesh.userData.bodySlot=i+10;
      center.add(mesh);root.add(center);root.position.x=i*3;root.rotation.y=i*.2;scene.add(root);
      return {root,eligible:true,lighting:{signature:'same lamps',uniforms:{torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:Array.from({length:8},()=>new Vector4())},torchColors:{value:Array.from({length:8},()=>new Vector3())}}} as any};
    });
  };
  it('retains independent colors and transforms and casts directional shadows from instances',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    expect(batches.update(items)).toEqual({batches:1,instances:4});
    const batch=scene.children.find(n=>n.name==='batched-miniatures') as any;
    expect(batch.castShadow).toBe(true);expect(batch.layers.isEnabled(5)).toBe(true);
    expect(Array.from(batch.geometry.getAttribute('instanceOutline').array).slice(0,4)).toEqual([1,2,3,4]);
    expect(Array.from(batch.geometry.getAttribute('instanceBodySlot').array).slice(0,4)).toEqual([10,11,12,13]);
    for(let i=0;i<4;i++){
      const mesh=items[i].root.children[0].children[0] as Mesh;
      expect(mesh.castShadow).toBe(true);expect(mesh.layers.mask).toBe(0);
      expect(batch.instanceMatrix.array[i*16+12]).toBe(i*3);
      const color=new Color();batch.getColorAt(i,color);expect(color.equals((mesh.material as MeshStandardMaterial).color)).toBe(true);
    }
    items[0].root.position.x=50;batches.update(items);expect(batch.instanceMatrix.array[12]).toBe(50);
    (items[0].root.children[0].children[0] as Mesh).userData.outlineId=6;
    batches.update(items);expect(batch.geometry.getAttribute('instanceOutline').getX(0)).toBe(6);
    (items[0].root.children[0].children[0] as Mesh).userData.bodySlot=20;
    batches.update(items);expect(batch.geometry.getAttribute('instanceBodySlot').getX(0)).toBe(20);
    const version=batch.geometry.getAttribute('instanceBodySlot').version;
    batches.update(items);expect(batch.geometry.getAttribute('instanceBodySlot').version).toBe(version);
    batches.dispose();expect(scene.children.some(n=>n.name==='batched-miniatures')).toBe(false);
    expect((items[0].root.children[0].children[0] as Mesh).layers.isEnabled(0)).toBe(true);
  });
  it('excludes ineligible figures while batching even two figures with different lights',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    items[0].eligible=false;items[1].root.visible=false;
    expect(batches.update(items)).toEqual({batches:1,instances:2});
    items[0].eligible=true;items[1].root.visible=true;
    (items[0].lighting as any).signature='other room lamp';
    expect(batches.update(items)).toEqual({batches:1,instances:4});
    expect(batches.update(items,false)).toEqual({batches:0,instances:0});
    for(const item of items)expect((item.root.children[0].children[0] as Mesh).layers.isEnabled(0)).toBe(true);
    batches.dispose();
  });
  it('retains independent per-instance source colors, shadow slots and darkvision and updates them without rebuilding a batch',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    items.forEach((f,i)=>{f.lighting.signature='lamp'+i;const u=f.lighting.uniforms;
      u.torchCount.value=i+1;u.darkvisionDetail.value=i%2;
      u.torchPositions.value[0].set(i,2,3,4);u.torchColors.value[0].set(.1*i,.2,.3);u.torchShadowSlots.value[0]=i-2;});
    batches.update(items);const batch=scene.getObjectByName('batched-miniatures') as any;
    const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'uniform float torchShadowSlots[8]; uniform float darkvisionDetail; uniform int torchCount; uniform vec4 torchPositions[8]; uniform vec3 torchColors[8]; torchPositions[torchIndex]; torchColors[torchIndex]; torchShadowSlots[torchIndex]; torchCount; darkvisionDetail;'};
    batch.material.onBeforeCompile(shader,{});const tex=(shader.uniforms as any).batchTorches.value,data=tex.image.data,width=tex.image.width;
    for(let i=0;i<4;i++){expect(data[i*width*4]).toBe(i+1);expect(data[i*width*4+1]).toBe(i%2);
      expect(data[(i*width+1)*4]).toBe(i);expect(data[(i*width+9)*4+3]).toBe(i-2);}
    const version=tex.version;items[0].lighting.uniforms.torchPositions.value[0].x=42;batches.update(items);
    expect(scene.getObjectByName('batched-miniatures')).toBe(batch);expect(data[4]).toBe(42);expect(tex.version).toBeGreaterThan(version);
    const stable=tex.version;batches.update(items);expect(tex.version).toBe(stable);batches.dispose();
  });
  it('uses shared light uniforms on modest presets and never groups different source selections',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    items[0].lighting.signature=items[1].lighting.signature='left';items[2].lighting.signature=items[3].lighting.signature='right';
    expect(batches.update(items,true,false,false)).toEqual({batches:0,instances:0});
    items[2].lighting.signature='left';
    expect(batches.update(items,true,false,false)).toEqual({batches:1,instances:3});
    const meshes=scene.children.filter(n=>n.name==='batched-miniatures') as any[];
    for(const mesh of meshes){const shader={uniforms:{},vertexShader:'',fragmentShader:''};mesh.material.onBeforeCompile(shader,{});
      expect((shader.uniforms as any).batchTorches).toBeUndefined();expect((shader.uniforms as any).torchPositions).toBeDefined();}
    batches.dispose();
  });
  it('keeps separate ground sample positions for Low instances even in one shared draw',()=>{
    const scene=new Scene(),items=figures(scene),batches=createMiniatureBatches(scene);
    items.forEach((f,i)=>{f.lighting.uniforms.torchGroundPoint={value:new Vector2(i*30,100+i)};});
    expect(batches.update(items,true,false,false)).toEqual({batches:1,instances:4});
    const batch=scene.getObjectByName('batched-miniatures') as any,points=batch.geometry.getAttribute('instanceGroundPoint');
    expect(Array.from(points.array)).toEqual([0,100,30,101,60,102,90,103]);
    items[1].lighting.uniforms.torchGroundPoint!.value.set(44,55);batches.update(items,true,false,false);
    expect(points.getX(1)).toBe(44);expect(points.getY(1)).toBe(55);
    const version=points.version;batches.update(items,true,false,false);expect(points.version).toBe(version);
    batches.dispose();
  });
});
