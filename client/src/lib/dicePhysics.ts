import { Body, Box, ConvexPolyhedron, GSSolver, Vec3, World, Material, ContactMaterial } from 'cannon-es';
import { dieMesh, faceForwardMesh } from '../../../shared/diceGeometry.js';

import {type TrayDie,type Toss} from './diceTrayTypes.js';
export {physicalDice,trayFaceValues} from './diceTrayTypes.js';
// Solver masses use grams and lengths use a uniform scale for stable contacts;
// gravity and velocity are converted from SI by the same metresPerUnit factor.
// A 16 mm acrylic d6 is the reference, regardless of visual pool scaling.
export const STANDARD_GRAVITY=9.80665;
export const ACRYLIC_DENSITY=1190; // kg/m^3; ACRYLITE material data.
export const REFERENCE_D6_EDGE=.016;
export function diceMassKg(vertices:Vec3[],faces:number[][]){
  let volume=0;
  for(const face of faces)for(let j=1;j<face.length-1;j++){
    volume+=vertices[face[0]].dot(vertices[face[j]].cross(vertices[face[j+1]]))/6;
  }
  return Math.abs(volume)*ACRYLIC_DENSITY;
}
export function simulateToss(dice:TrayDie[],seed:number):Toss {
  if(dice.length>40 || dice.some(d=>![4,6,8,10,12,20].includes(d.sides)))throw new Error('Roll requires result summary');
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  // The responsive tray accommodates the pool; each physical d6 remains 16 mm.
  const cols=Math.max(1,Math.ceil(Math.sqrt(dice.length*1.5))),rows=Math.max(1,Math.ceil(dice.length/cols));
  const radius=Math.min(1.5,1.8/Math.pow(Math.max(1,dice.length),.25),5.6/cols,3.2/rows);
  const metresPerUnit=(REFERENCE_D6_EDGE*Math.sqrt(3)/2)/radius;
  const world=new World({gravity:new Vec3(0,0,-STANDARD_GRAVITY/metresPerUnit),allowSleep:true});
  (world.solver as GSSolver).iterations=80;
  (world.solver as GSSolver).tolerance=1e-10;
  // Resting-contact stabilization: tiny impacts do not repeatedly re-bounce.
  // This is a velocity threshold on restitution, not a drag force on the roll.
  const solve=world.solver.solve.bind(world.solver);
  world.solver.solve=(dt,w)=>{
    for(const contact of w.contacts)if(Math.abs(contact.getImpactVelocityAlongNormal())*metresPerUnit<.2)contact.restitution=0;
    return solve(dt,w);
  };
  // Contact coefficients are estimates for a lined tray, not measured material data.
  // No artificial air damping or late-roll braking is applied.
  world.defaultContactMaterial.friction=.38;
  world.defaultContactMaterial.restitution=.12;
  const dieMaterial=new Material('die'),wallMaterial=new Material('wall');
  // Hard dice rebound against each other; the padded floor still absorbs energy.
  world.addContactMaterial(new ContactMaterial(dieMaterial,dieMaterial,{friction:.3,restitution:.4}));
  world.addContactMaterial(new ContactMaterial(dieMaterial,wallMaterial,{friction:.2,restitution:.7}));
  const walls=new Set<Body>();let wallHits=0;
  const box=(x:number,y:number,z:number,hx:number,hy:number,hz:number)=>{const b=new Body({mass:0,shape:new Box(new Vec3(hx,hy,hz)),position:new Vec3(x,y,z),material:z>0?wallMaterial:undefined});world.addBody(b);if(z>0)walls.add(b);return b;};
  box(0,0,-.2,7.2,4.7,.2);
  box(-7.2,0,3,.2,4.7,3);box(7.2,0,3,.2,4.7,3);
  box(0,-4.7,3,7.4,.2,3);box(0,4.7,3,7.4,.2,3);
  const spacing=radius*2.25;
  const meshes=dice.map(d=>faceForwardMesh(dieMesh(d.sides)));
  const bodies=meshes.map((mesh,i)=>{
    const vertices=mesh.vertices.map(v=>new Vec3(v[0]*radius,v[1]*radius,v[2]*radius));
    const faces=mesh.faces.map(ids=>{
      const a=vertices[ids[0]],b=vertices[ids[1]],c=vertices[ids[2]];
      const n=b.vsub(a).cross(c.vsub(a));
      return n.dot(a)<0?[...ids].reverse():[...ids];
    });
    const body=new Body({mass:diceMassKg(vertices.map(v=>v.scale(metresPerUnit)),faces)*1000,material:dieMaterial,shape:new ConvexPolyhedron({vertices,faces}),linearDamping:0,angularDamping:0,allowSleep:true,sleepSpeedLimit:.3,sleepTimeLimit:.5});
    body.position.set(((i%cols)-(cols-1)/2)*spacing-1, (Math.floor(i/cols)-(rows-1)/2)*spacing-.4,(.04+random()*.01)/metresPerUnit);
    body.quaternion.setFromEuler(random()*6.28,random()*6.28,random()*6.28);
    // Vary speed and fan across the tray so the pool does not travel as one block.
    body.velocity.set((1.2+random()*.3)/metresPerUnit,(random()-.5)*.3/metresPerUnit,(random()*.04-.02)/metresPerUnit);
    body.angularVelocity.set((random()-.5)*25,(random()-.5)*25,(random()-.5)*18);
    body.addEventListener('collide',(event:{body:Body})=>{if(walls.has(event.body))wallHits++;});
    world.addBody(body);return body;
  });
  const frames:number[]=[];const step=1/480;
  const capture=()=>bodies.forEach(b=>frames.push(b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w));
  capture();
  let ticks=0;
  const motionWindow:number[][]=[];
  for(;ticks<5760;ticks++){
    // A lined tray has a finite contact patch. Coulomb rolling/spin resistance
    // supplies the contact torque missing from ideal point-contact polyhedra.
    // Coefficient .01 is an explicit surface estimate, not a measured constant.
    const contactLoads=new Map<Body,number>();
    for(const contact of world.contacts)for(const body of [contact.bi,contact.bj])if(body.mass>0)
      contactLoads.set(body,(contactLoads.get(body)??0)+Math.max(0,contact.multiplier));
    for(const [body,normalLoad] of contactLoads){
      const speed=body.angularVelocity.length();
      if(speed>0 && body.sleepState!==Body.SLEEPING){
        const axis=body.angularVelocity.scale(1/speed);
        const inverseInertia=axis.dot(body.invInertiaWorld.vmult(axis));
        const torque=Math.min(.01*normalLoad*radius,speed/(step*Math.max(inverseInertia,1e-12)));
        body.torque.vadd(axis.scale(-torque),body.torque);
      }
    }
    world.step(step);
    // Sleep a resting contact island together, avoiding mutual wake-ups from
    // sub-millimetre solver jitter. This never slows a moving die.
    motionWindow.push(bodies.map(b=>(b.velocity.length()+b.angularVelocity.length()*radius)*metresPerUnit));
    if(motionWindow.length>60)motionWindow.shift();
    if(motionWindow.length===60 && bodies.every((_,i)=>motionWindow.reduce((sum,frame)=>sum+frame[i],0)/60<.005))bodies.forEach(b=>b.sleep());
    capture();
    // Keep a fully stationary final frame after the last body enters sleep.
    if(ticks>480&&bodies.every(b=>b.sleepState===Body.SLEEPING)){capture();ticks+=2;break;}
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
  return {wallHits,frames:new Float32Array(frames),frameCount:ticks+1,step,radius,topFaces,duration:ticks*step};
}
