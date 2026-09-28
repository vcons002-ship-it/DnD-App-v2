import {describe,it,expect} from 'vitest';
import {BoxGeometry,CylinderGeometry,Group,Mesh,MeshBasicMaterial} from 'three';
import {measureMistBody,mistBodyInMap} from '../../client/src/canvas/miniatureMistBody.js';

describe('whole-body mist envelope',()=>{
  it('measures the legs independently of a wide base and long weapon',()=>{
    const model=new Group(),material=new MeshBasicMaterial();
    for(const x of [-.25,.25]){
      const leg=new Mesh(new BoxGeometry(.3,1,.4,1,8,1),material);leg.name='leg';leg.position.set(x,.5,.15);model.add(leg);
    }
    const base=new Mesh(new CylinderGeometry(2,2,.2),material);base.name='Decorative_Base';model.add(base);
    const sword=new Mesh(new BoxGeometry(8,3,.3),material);sword.name='Approved_BoneSword';model.add(sword);
    const body=measureMistBody(model,{baseDiameter:4,baseCenter:[0,0,0]});
    expect(body.source).toBe('geometry');
    expect(body.radiusX*2).toBeCloseTo(.8);
    expect(body.radiusZ*2).toBeCloseTo(.4);
    expect(body.x).toBeCloseTo(0);expect(body.z).toBeCloseTo(.15);
    const turned=mistBodyInMap(body,100,200,Math.PI/2,10);
    expect(turned.x).toBeCloseTo(101.5);expect(turned.y).toBeCloseTo(200);
    expect(turned.radiusX).toBeCloseTo(4);expect(turned.radiusY).toBeCloseTo(2);
    model.traverse(node=>{if(node instanceof Mesh)node.geometry.dispose();});material.dispose();
  });
  it('includes the torso and head while excluding the decorative base and weapon',()=>{
    const model=new Group(),material=new MeshBasicMaterial();
    for(const [name,w,h,d,y] of [['legs',.8,1,.4,.5],['torso',1.4,1,.8,1.5],['head',.6,.6,.6,2.3]] as const){
      const mesh=new Mesh(new BoxGeometry(w,h,d,2,4,2),material);mesh.name=name;mesh.position.y=y;model.add(mesh);
    }
    const sword=new Mesh(new BoxGeometry(10,12,10),material);sword.name='sword';model.add(sword);
    const base=new Mesh(new CylinderGeometry(4,4,.2),material);base.name='base';model.add(base);
    const body=measureMistBody(model,{baseDiameter:4,baseCenter:[0,0,0]});
    expect(body.radiusX*2).toBeCloseTo(1.4);expect(body.radiusZ*2).toBeCloseTo(.8);
    expect(body.height).toBeCloseTo(2.6);
    expect(mistBodyInMap(body,0,0,0,10).height).toBeCloseTo(26);
    model.traverse(node=>{if(node instanceof Mesh)node.geometry.dispose();});material.dispose();
  });

  it('ignores a broad unnamed plinth using its base material',()=>{
    const model=new Group(),bodyMaterial=new MeshBasicMaterial(),baseMaterial=new MeshBasicMaterial();
    baseMaterial.name='dark_pewter_base';
    const bodyMesh=new Mesh(new BoxGeometry(.8,2,.5,2,8,2),bodyMaterial);bodyMesh.position.y=1;model.add(bodyMesh);
    const plinth=new Mesh(new CylinderGeometry(3,3,.7,40),baseMaterial);plinth.position.y=.2;model.add(plinth);
    const body=measureMistBody(model,{baseDiameter:6,baseCenter:[0,0,0]});
    expect(body.radiusX*2).toBeCloseTo(.8);expect(body.radiusZ*2).toBeCloseTo(.5);
    model.traverse(node=>{if(node instanceof Mesh)node.geometry.dispose();});bodyMaterial.dispose();baseMaterial.dispose();
  });

  it('does not substitute the base diameter when no body geometry exists',()=>{
    const model=new Group(),material=new MeshBasicMaterial();
    const base=new Mesh(new CylinderGeometry(4,4,1),material);base.name='base';model.add(base);
    const body=measureMistBody(model,{baseDiameter:8,baseCenter:[0,0,0]});
    expect(body.radiusX).toBe(0);expect(body.radiusZ).toBe(0);expect(body.height).toBe(0);
    base.geometry.dispose();material.dispose();
  });

});
