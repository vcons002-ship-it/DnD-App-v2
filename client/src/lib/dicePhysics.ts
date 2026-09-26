import { Body, Box, ConvexPolyhedron, GSSolver, Vec3, World } from 'cannon-es';
import { dieMesh, faceForwardMesh } from '../../../shared/diceGeometry.js';

import {type TrayDie,type Toss} from './diceTrayTypes.js';
export {physicalDice,trayFaceValues} from './diceTrayTypes.js';
export function simulateToss(dice:TrayDie[],seed:number):Toss {
  if(dice.length>40 || dice.some(d=>![4,6,8,10,12,20].includes(d.sides)))throw new Error('Roll requires result summary');
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const world=new World({gravity:new Vec3(0,0,-24),allowSleep:true});
  (world.solver as GSSolver).iterations=30;
  world.defaultContactMaterial.friction=.55;
  world.defaultContactMaterial.restitution=.17;
  const box=(x:number,y:number,z:number,hx:number,hy:number,hz:number)=>world.addBody(new Body({mass:0,shape:new Box(new Vec3(hx,hy,hz)),position:new Vec3(x,y,z)}));
  box(0,0,-.2,7.2,4.7,.2);
  box(-7.2,0,3,.2,4.7,3);box(7.2,0,3,.2,4.7,3);
  box(0,-4.7,3,7.4,.2,3);box(0,4.7,3,7.4,.2,3);
  // Size the complete physical pool, including compared sets and critical dice.
  // A gentle curve keeps small rolls prominent; grid bounds leave tossing room.
  const cols=Math.max(1,Math.ceil(Math.sqrt(dice.length*1.5))),rows=Math.max(1,Math.ceil(dice.length/cols));
  const radius=Math.min(1.5,1.8/Math.pow(Math.max(1,dice.length),.25),5.6/cols,3.2/rows);
  const spacing=radius*2.25;
  const meshes=dice.map(d=>faceForwardMesh(dieMesh(d.sides)));
  const bodies=meshes.map((mesh,i)=>{
    const vertices=mesh.vertices.map(v=>new Vec3(v[0]*radius,v[1]*radius,v[2]*radius));
    const faces=mesh.faces.map(ids=>{
      const a=vertices[ids[0]],b=vertices[ids[1]],c=vertices[ids[2]];
      const n=b.vsub(a).cross(c.vsub(a));
      return n.dot(a)<0?[...ids].reverse():[...ids];
    });
    const body=new Body({mass:1,shape:new ConvexPolyhedron({vertices,faces}),linearDamping:.15,angularDamping:.24,allowSleep:true,sleepSpeedLimit:.3,sleepTimeLimit:.4});
    body.position.set(((i%cols)-(cols-1)/2)*spacing-1, (Math.floor(i/cols)-(rows-1)/2)*spacing-.4,2.3+random()*.45);
    body.quaternion.setFromEuler(random()*6.28,random()*6.28,random()*6.28);
    body.velocity.set(2.6+random()*4.55,1.3+random()*3.9,random()*.6);
    body.angularVelocity.set((random()-.5)*25,(random()-.5)*25,(random()-.5)*18);
    world.addBody(body);return body;
  });
  const frames:number[]=[];const step=1/120;
  const capture=()=>bodies.forEach(b=>frames.push(b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w));
  capture();
  let ticks=0;
  for(;ticks<1440;ticks++){
    world.step(step);capture();
    if(ticks>120&&bodies.every(b=>b.sleepState===Body.SLEEPING)){ticks++;break;}
  }
  if(!bodies.every(b=>b.sleepState===Body.SLEEPING))throw new Error('Dice did not settle within the tray simulation limit');
  const topFaces=bodies.map((body,i)=>{
    let best=-Infinity,top=0;
    meshes[i].faces.forEach((face,index)=>{
      const [a,b,c]=face.map(j=>new Vec3(...meshes[i].vertices[j]));
      const normal=b.vsub(a).cross(c.vsub(a));if(normal.dot(a)<0)normal.negate(normal);normal.normalize();
      const z=body.quaternion.vmult(normal).z;
      if(z>best){best=z;top=index;}
    });return top;
  });
  return {frames:new Float32Array(frames),frameCount:ticks+1,step,radius,topFaces,duration:ticks*step};
}
