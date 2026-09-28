import {Mesh,Object3D,Vector3} from 'three';

type Definition={baseDiameter:number;baseCenter:readonly [number,number,number]};
export type MistBody={x:number;z:number;radiusX:number;radiusZ:number;height:number;source:'geometry'|'fallback';samples:number};
const cache=new WeakMap<Object3D,MistBody>();

/** Measure the resting body mesh from feet through head once, before outlines or UI are added.
 * A small ellipse is sufficient for a wake; this is not per-triangle physics. */
export function measureMistBody(model:Object3D,definition:Definition):MistBody{
  const cached=cache.get(model);if(cached)return cached;
  const meshes:Mesh[]=[];
  model.updateWorldMatrix(true,true);
  model.traverse(node=>{
    if(!(node instanceof Mesh)||!node.geometry.getAttribute('position'))return;
    let label='';for(let parent:Object3D|null=node;parent&&parent!==model;parent=parent.parent)label+=' '+parent.name;
    if(/base|pedestal|rim|sword|handaxe|weapon|staff|quiver|arrow|bow/i.test(label))return;
    meshes.push(node);
  });
  const count=meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.getAttribute('position').count),0);
  const stride=Math.max(1,Math.ceil(count/24000)),point=new Vector3(),points:Vector3[]=[];
  for(const mesh of meshes){
    const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
    const start=mesh.geometry.drawRange.start,end=Math.min(index?.count??position.count,start+mesh.geometry.drawRange.count);
    for(let i=start;i<end;i+=stride){
      point.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
      if(Number.isFinite(point.x+point.y+point.z))points.push(point.clone());
    }
  }
  const d=definition.baseDiameter;
  const foot=points.reduce((min,p)=>Math.min(min,p.y),Infinity);
  // Exclude the plinth contact; include legs, torso, arms and head. Robust
  // bounds suppress stray accessory vertices in combined meshes.
  const lower=points.filter(p=>p.y>=foot+d*.06);
  const ys=points.map(p=>p.y).sort((a,b)=>a-b);
  const height=Math.max(d*.3,(ys[Math.floor((ys.length-1)*.995)]??(definition.baseCenter[1]+d*1.6))-definition.baseCenter[1]);
  let result:MistBody={x:0,z:0,radiusX:d*.22,radiusZ:d*.16,height,source:'fallback',samples:lower.length};
  if(lower.length>=12){
    const xs=lower.map(p=>p.x).sort((a,b)=>a-b),zs=lower.map(p=>p.z).sort((a,b)=>a-b);
    const lo=Math.floor((lower.length-1)*.02),hi=Math.ceil((lower.length-1)*.98);
    result={x:(xs[lo]+xs[hi])/2-definition.baseCenter[0],z:(zs[lo]+zs[hi])/2-definition.baseCenter[2],
      radiusX:Math.max(d*.04,(xs[hi]-xs[lo])/2),radiusZ:Math.max(d*.04,(zs[hi]-zs[lo])/2),height,source:'geometry',samples:lower.length};
  }
  cache.set(model,result);return result;
}

/** Preserve the measured offset and footprint as the miniature scales/turns. */
export function mistBodyInMap(body:MistBody,x:number,y:number,facing:number,scale:number){
  const c=Math.cos(facing),s=Math.sin(facing);
  return {x:x+(body.x*c+body.z*s)*scale,y:y+(-body.x*s+body.z*c)*scale,
    radiusX:body.radiusX*scale,radiusY:body.radiusZ*scale,height:body.height*scale,facing};
}
