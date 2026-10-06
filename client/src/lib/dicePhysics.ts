import {diceCollider} from '../../../shared/diceCollider.js';
import {handTumble} from '../../../shared/diceLaunch.js';
import {recordDiceImpacts,type DiceImpact} from '../../../shared/diceImpacts.js';
import { Body, Box, ConvexPolyhedron, GSSolver, Vec3, World, Material, ContactMaterial } from 'cannon-es';
import { dieMesh, faceForwardMesh } from '../../../shared/diceGeometry.js';

import {type TrayDie,type Toss,type DiceEntrySide} from './diceTrayTypes.js';
export {physicalDice,trayFaceValues} from './diceTrayTypes.js';
// Solver masses use grams and lengths use a uniform scale for stable contacts;
// gravity and velocity are converted from SI by the same metresPerUnit factor.
// A 16 mm acrylic d6 is the reference, regardless of visual pool scaling.
export const STANDARD_GRAVITY=9.80665;
// Slightly reduced gravity gives the presentation a longer bounce arc.
export const TRAY_GRAVITY=STANDARD_GRAVITY*.9;
export const ACRYLIC_DENSITY=1190; // kg/m^3; ACRYLITE material data.
export const REFERENCE_D6_EDGE=.016;
export function diceMassKg(vertices:Vec3[],faces:number[][]){
  let volume=0;
  for(const face of faces)for(let j=1;j<face.length-1;j++){
    volume+=vertices[face[0]].dot(vertices[face[j]].cross(vertices[face[j+1]]))/6;
  }
  return Math.abs(volume)*ACRYLIC_DENSITY;
}
export function simulateToss(dice:TrayDie[],seed:number,entrySide:DiceEntrySide='left'):Toss {
  // Pick a readable physical trajectory before playback. Server results are
  // untouched; no visible teleport or forced final orientation is involved.
  let failure:unknown;
  for(let attempt=0;attempt<8;attempt++)try {
    return simulateCandidate(dice,(seed+Math.imul(attempt,2654435761))>>>0,entrySide);
  } catch(error) { failure=error; }
  throw failure;
}
function simulateCandidate(dice:TrayDie[],seed:number,entrySide:DiceEntrySide):Toss {
  if(dice.length>40 || dice.some(d=>![4,6,8,10,12,20].includes(d.sides)))throw new Error('Roll requires result summary');
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  // The responsive tray accommodates the pool; each physical d6 remains 16 mm.
  const cols=Math.max(1,Math.ceil(Math.sqrt(dice.length*1.5))),rows=Math.max(1,Math.ceil(dice.length/cols));
  const radius=Math.min(1.5,1.8/Math.pow(Math.max(1,dice.length),.25),5.6/cols,3.2/rows)*Math.min(1,Math.sqrt(12/Math.max(1,dice.length)));
  const metresPerUnit=(REFERENCE_D6_EDGE*Math.sqrt(3)/2)/radius;
  const world=new World({gravity:new Vec3(0,0,-TRAY_GRAVITY/metresPerUnit),allowSleep:true});
  (world.solver as GSSolver).iterations=80;
  (world.solver as GSSolver).tolerance=1e-10;
  // Ordinary rigid-body contacts: one consistent surface profile. These are
  // conventional coefficients, not measurements of a particular tray.
  world.defaultContactMaterial.friction=.065;
  world.defaultContactMaterial.restitution=.79;
  const dieMaterial=new Material('die'),wallMaterial=new Material('wall');
  world.addContactMaterial(new ContactMaterial(dieMaterial,dieMaterial,{friction:.09,restitution:.76}));
  // Smooth wall lining prevents tapered dice from gripping a wall while spinning.
  // Keep floor friction and wall rebound unchanged.
  world.addContactMaterial(new ContactMaterial(dieMaterial,wallMaterial,{friction:0,restitution:.88}));
  const walls=new Set<Body>();let wallHits=0;
  const box=(x:number,y:number,z:number,hx:number,hy:number,hz:number)=>{const b=new Body({mass:0,shape:new Box(new Vec3(hx,hy,hz)),position:new Vec3(x,y,z),material:z>0?wallMaterial:undefined});world.addBody(b);if(z>0)walls.add(b);return b;};
  box(0,0,-.2,7.2,4.7,.2);
  const edgeWalls={left:box(-7.2,0,3,.2,4.7,3),right:box(7.2,0,3,.2,4.7,3),
    bottom:box(0,-4.7,3,7.4,.2,3),top:box(0,4.7,3,7.4,.2,3)};
  // Incoming dice bypass the exterior walls until they cross into the bed.
  for(const wall of Object.values(edgeWalls))wall.collisionFilterGroup=2;
  const direction=new Vec3(entrySide==='left'?1:entrySide==='right'?-1:0,entrySide==='bottom'?1:entrySide==='top'?-1:0,0);
  const cross=new Vec3(-direction.y,direction.x,0);
  const extent=direction.x?7:4.5;
  const crossExtent=direction.x?4.5:7;
  const lanes=Math.min(dice.length,Math.max(1,Math.floor((crossExtent*2-radius*2)/(radius*2.2))+1));
  const releases=dice.map(()=>0);
  const throwAngle=Math.PI/6; // A shared diagonal heading, relative to the roller's edge.
  const meshes=dice.map(d=>faceForwardMesh(dieMesh(d.sides)));
  const bodies=dice.map((die,i)=>{
    const shape=diceCollider(die.sides,radius);
    const {vertices,faces}=shape;
    const body=new Body({mass:diceMassKg(vertices.map(v=>v.scale(metresPerUnit)),faces)*1000,material:dieMaterial,shape,linearDamping:.01,angularDamping:.01,allowSleep:true,sleepSpeedLimit:.3,sleepTimeLimit:.5});
    // Release one handful together. Separate rows vertically so simultaneous
    // dice begin clear of each other instead of overlapping at the entry edge.
    const lane=(i%lanes)-(lanes-1)/2;
    const angle=throwAngle+lane/Math.max(1,lanes-1)*.10;
    // Offset the launch point so the diagonal crosses the same clear entry lane.
    // Otherwise outer dice can strike the outside of a side wall before entering.
    const approach=radius+.005/metresPerUnit;
    body.position.copy(direction.scale(-extent-approach).vadd(cross.scale(lane*radius*2.2-Math.tan(angle)*(approach+radius))));
    body.position.z=(.045+random()*.005)/metresPerUnit+Math.floor(i/lanes)*radius*2.2;
    body.collisionFilterMask=1; // Cross the entry wall before enabling containment.
    body.quaternion.setFromEuler(random()*6.28,random()*6.28,random()*6.28);
    // Parallel diagonal paths with a small outward fan avoid dice aiming into
    // each other. Keep the total launch speed, gravity and contacts unchanged.
    const speed=(.55+random()*.15)/metresPerUnit;
    body.velocity.copy(direction.scale(Math.cos(angle)*speed).vadd(cross.scale(Math.sin(angle)*speed)));
    body.velocity.z=(random()*.04-.02)/metresPerUnit;
    body.angularVelocity.copy(handTumble(body.velocity,random));
    body.addEventListener('collide',(event:{body:Body})=>{if(walls.has(event.body))wallHits++;});
    return body;
  });
  const frames:number[]=[];const step=1/480;
  // Every genuine strike (die/wall/floor, speed, place) for the playback's clatter.
  const impacts:DiceImpact[]=[];let ticks=0;
  recordDiceImpacts(bodies,walls,metresPerUnit,()=>(ticks+1)*step,impacts);
  const capture=()=>bodies.forEach(b=>frames.push(b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w));
  capture();
  let released=0;
  const settleTimes=bodies.map(()=>0);
  for(;ticks<5760;ticks++){
    while(released<bodies.length && releases[released]<=ticks*step)world.addBody(bodies[released++]);
    for(let i=0;i<released;i++)if(bodies[i].position.dot(direction)>-extent+radius)bodies[i].collisionFilterMask=3;
    world.step(step);
    bodies.forEach((body,i)=>{if(i>=released||body.sleepState!==Body.SLEEPING)settleTimes[i]=(ticks+1)*step;});
    capture();
    // Keep a fully stationary final frame after the last body enters sleep.
    if(ticks>480&&released===bodies.length&&bodies.every(b=>b.sleepState===Body.SLEEPING)){capture();ticks+=2;break;}
  }
  if(!bodies.every(b=>b.sleepState===Body.SLEEPING))throw new Error('Dice did not settle within the tray simulation limit');
  for(const body of bodies){
    const shape=body.shapes[0] as ConvexPolyhedron;
    const bottom=Math.min(...shape.vertices.map(v=>body.quaternion.vmult(v).z+body.position.z));
    if(bottom>radius*.04 || Math.abs(body.position.x)>7 || Math.abs(body.position.y)>4.5)
      throw new Error('Unreadable stacked or escaped dice pose');
  }
  const topFaces=bodies.map((body,i)=>{
    let best=-Infinity,top=0;
    meshes[i].faces.forEach((face,index)=>{
      const [a,b,c]=face.map(j=>new Vec3(...meshes[i].vertices[j]));
      const normal=b.vsub(a).cross(c.vsub(a));if(normal.dot(a)<0)normal.negate(normal);normal.normalize();
      const z=body.quaternion.vmult(normal).z;
      if(z>best){best=z;top=index;}
    });return top;
  });
  return {settleTimes,wallHits,frames:new Float32Array(frames),frameCount:ticks+1,step,radius,topFaces,duration:ticks*step,impacts};
}
