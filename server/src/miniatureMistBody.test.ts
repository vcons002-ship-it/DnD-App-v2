import {describe,it,expect} from 'vitest';
import {BoxGeometry,CylinderGeometry,Group,Mesh,MeshBasicMaterial} from 'three';
import {measureMistBody,mistBodyInMap} from '../../client/src/canvas/miniatureMistBody.js';

describe('lower-body mist footprint',()=>{
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
});
