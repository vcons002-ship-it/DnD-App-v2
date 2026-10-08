import {diceCollider} from './diceCollider.js';
import {releaseHandfulDie} from './diceLaunch.js';
import {diceTrayLayoutForPool,REFERENCE_D6_EDGE,diePhysicalScale} from './diceTrayLayout.js';
import {recordDiceImpacts,type DiceImpact} from './diceImpacts.js';
import { Body, Box, ConvexPolyhedron, GSSolver, Vec3, World, Material, ContactMaterial } from 'cannon-es';
import { dieMesh, faceForwardMesh } from './diceGeometry.js';
import {LIVE_DICE_PRESENTATION_RATE,LIVE_DICE_REROLL_WAIT_SECONDS} from './liveDiceTypes.js';

import {type TrayDie,type DiceEntrySide} from './diceTrayTypes.js';
export {physicalDice,trayFaceValues} from './diceTrayTypes.js';
// Solver masses use grams and lengths use a uniform scale for stable contacts;
// gravity and velocity are converted from SI by the same metresPerUnit factor.
// A 17.6 mm acrylic d6 is the reference, regardless of visual pool scaling.
export const STANDARD_GRAVITY=9.80665;
// Slightly reduced gravity gives the presentation a longer bounce arc.
export const TRAY_GRAVITY=STANDARD_GRAVITY*.9;
export const ACRYLIC_DENSITY=1190; // kg/m^3; ACRYLITE material data.
export {REFERENCE_D6_EDGE};
export function diceMassKg(vertices:Vec3[],faces:number[][]){
  let volume=0;
  for(const face of faces)for(let j=1;j<face.length-1;j++){
    volume+=vertices[face[0]].dot(vertices[face[j]].cross(vertices[face[j+1]]))/6;
  }
  return Math.abs(volume)*ACRYLIC_DENSITY;
}

export function createLiveWorld(initialDice:TrayDie[],seed:number,entrySide:DiceEntrySide='bottom',capacity=initialDice.length) {
  const dice=[...initialDice];
  if(capacity<dice.length||capacity>40)throw new Error('Unsupported physical dice capacity');
  if(dice.length>40 || dice.some(d=>![4,6,8,10,12,20].includes(d.sides)))throw new Error('Unsupported physical dice pool');
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  // The responsive tray accommodates the pool; each physical d6 remains 17.6 mm.
  const layout=diceTrayLayoutForPool(capacity),radius=layout.radius,trayScale=layout.scale;
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
  box(0,0,-.2,layout.halfWidth,layout.halfHeight,.2);
  const edgeWalls={left:box(-layout.halfWidth,0,3,.2*trayScale,layout.halfHeight,3),right:box(layout.halfWidth,0,3,.2*trayScale,layout.halfHeight,3),
    bottom:box(0,-layout.halfHeight,3,7.4*trayScale,.2*trayScale,3),top:box(0,layout.halfHeight,3,7.4*trayScale,.2*trayScale,3)};
  // Only the entry rim is bypassed while a die enters. Side and far walls
  // remain solid, including when incoming dice collide near a corner.
  for(const [side,wall] of Object.entries(edgeWalls))wall.collisionFilterGroup=side===entrySide?4:2;
  const direction=new Vec3(entrySide==='left'?1:entrySide==='right'?-1:0,entrySide==='bottom'?1:entrySide==='top'?-1:0,0);
  const cross=new Vec3(-direction.y,direction.x,0);
  const extent=direction.x?layout.innerHalfWidth:layout.innerHalfHeight;
  const crossExtent=direction.x?layout.innerHalfHeight:layout.innerHalfWidth;
  const meshes=dice.map(d=>faceForwardMesh(dieMesh(d.sides)));
  const faceNormals=meshes.map(mesh=>mesh.faces.map(ids=>{
    const [a,b,c]=ids.map(k=>new Vec3(...mesh.vertices[k])),n=b.vsub(a).cross(c.vsub(a));
    if(n.dot(a)<0)n.negate(n);n.normalize();return n;
  }));
  const launchRadius=radius*Math.max(1,...dice.map(d=>diePhysicalScale(d.sides)));
  const makeBody=(die:TrayDie,i:number,count:number)=>{
    const shape=diceCollider(die.sides,radius*diePhysicalScale(die.sides));
    const {vertices,faces}=shape;
    const body=new Body({mass:diceMassKg(vertices.map(v=>v.scale(metresPerUnit)),faces)*1000,material:dieMaterial,shape,linearDamping:.01,angularDamping:.01,allowSleep:true,sleepSpeedLimit:.3,sleepTimeLimit:.5});
    releaseHandfulDie(body,i,count,launchRadius,trayScale,extent,crossExtent,metresPerUnit,TRAY_GRAVITY/metresPerUnit,direction,cross,random);
    body.collisionFilterMask=3;
    body.addEventListener('collide',(event:{body:Body})=>{if(walls.has(event.body))wallHits++;});
    return body;
  };
  const bodies=dice.map((die,i)=>makeBody(die,i,dice.length));

  bodies.forEach(body=>world.addBody(body));
  // Strikes since the last drain — each published frame carries its own, so the
  // clients' clatter follows the server's actual collisions.
  const pendingImpacts:DiceImpact[]=[];let elapsedForImpacts=0;
  const registerImpacts=recordDiceImpacts(bodies,walls,metresPerUnit,()=>elapsedForImpacts,pendingImpacts,layout.halfWidth);
  const launch=bodies.map(b=>({position:b.position.clone(),velocity:b.velocity.clone(),spin:b.angularVelocity.clone()}));
  const age=bodies.map(()=>0),rerolls=bodies.map(()=>0),values:(number|null)[]=bodies.map(()=>null);
  // Resting contact impulses can keep Cannon awake even when a readable face
  // holds still. Judge that tiny numerical jitter by displacement over time,
  // not a velocity spike on one solver step. Never adjust the result orientation.
  const stable=bodies.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone(),since:0,face:null as number|null}));
  const step=1/480;
  let elapsed=0;
  function readable(i:number):number|null {
    const b=bodies[i],shape=b.shapes[0] as ConvexPolyhedron;
    let bottom=Infinity;
    for(const v of shape.vertices)bottom=Math.min(bottom,b.quaternion.vmult(v).z+b.position.z);
    if(Math.abs(bottom)>radius*.08 || Math.abs(b.position.x)>layout.innerHalfWidth || Math.abs(b.position.y)>layout.innerHalfHeight)return null;
    let highest=-Infinity,second=-Infinity,face=0;
    faceNormals[i].forEach((normal,j)=>{
      const up=b.quaternion.vmult(normal).z*(dice[i].sides===4?-1:1);
      if(up>highest){second=highest;highest=up;face=j;}else second=Math.max(second,up);
    });
    return highest>(dice[i].sides===10?.65:.96) && highest-second>.025 ? face+1 : null;
  }
  function reroll(i:number) {
    const b=bodies[i],initial=launch[i];
    b.position.copy(initial.position);b.position.z+=(random()*.3);
    b.previousPosition.copy(b.position);b.interpolatedPosition.copy(b.position);
    b.quaternion.setFromEuler(random()*6.28,random()*6.28,random()*6.28);
    b.velocity.copy(initial.velocity.scale(.9+random()*.2));b.angularVelocity.copy(initial.spin.scale(.8+random()*.4));
    b.force.setZero();b.torque.setZero();b.collisionFilterMask=3;b.aabbNeedsUpdate=true;b.wakeUp();
    age[i]=0;values[i]=null;rerolls[i]++;
    stable[i].face=null;stable[i].since=0;
  }
  function advance(seconds:number) {
    const steps=Math.max(1,Math.round(seconds/step));
    for(let n=0;n<steps;n++){
      for(const [i,b] of bodies.entries())if(b.position.dot(direction)>-extent+radius*diePhysicalScale(dice[i].sides))b.collisionFilterMask=7;
      elapsedForImpacts=elapsed+step;world.step(step);elapsed+=step;
      bodies.forEach((b,i)=>{
        if(b.type===Body.STATIC)return;
        if(values[i]!==null&&b.sleepState!==Body.SLEEPING)age[i]=0;
        age[i]+=step;
        const face=readable(i),rest=stable[i];
        const q=rest.rotation,r=b.quaternion,rotationDot=Math.abs(q.x*r.x+q.y*r.y+q.z*r.z+q.w*r.w);
        if(face===null||face!==rest.face||rest.position.distanceTo(b.position)>.00015/metresPerUnit||rotationDot<Math.cos(.005/2)){
          rest.position.copy(b.position);rest.rotation.copy(b.quaternion);rest.since=0;rest.face=face;
        }else rest.since+=step;
        if(face!==null&&rest.since>=.3&&b.sleepState!==Body.SLEEPING)b.sleep();
        if(b.sleepState===Body.SLEEPING){
          values[i]=face;
          if(values[i]===null)reroll(i);
        }else {
          values[i]=null;
          if(age[i]>=LIVE_DICE_REROLL_WAIT_SECONDS*LIVE_DICE_PRESENTATION_RATE||b.position.z< -2)reroll(i);
        }
      });
      if(values.every(v=>v!==null))break;
    }
    return snapshot();
  }
  function appendDice(extra:TrayDie[]){
    if(!snapshot().done)throw new Error('Finish the current throw before adding dice');
    if(dice.length+extra.length>capacity||extra.some(d=>![4,6,8,10,12,20].includes(d.sides)))throw new Error('Unsupported physical dice pool');
    // Keep the already-read faces fixed; new dice still collide with their bodies.
    bodies.forEach(b=>{b.type=Body.STATIC;b.mass=0;b.updateMassProperties();b.velocity.setZero();b.angularVelocity.setZero();});
    extra.forEach((die,j)=>{
      const mesh=faceForwardMesh(dieMesh(die.sides));dice.push(die);meshes.push(mesh);
      faceNormals.push(mesh.faces.map(ids=>{const [a,b,c]=ids.map(k=>new Vec3(...mesh.vertices[k])),n=b.vsub(a).cross(c.vsub(a));if(n.dot(a)<0)n.negate(n);n.normalize();return n;}));
      const body=makeBody(die,j,extra.length);bodies.push(body);world.addBody(body);
      launch.push({position:body.position.clone(),velocity:body.velocity.clone(),spin:body.angularVelocity.clone()});
      age.push(0);rerolls.push(0);values.push(null);stable.push({position:body.position.clone(),rotation:body.quaternion.clone(),since:0,face:null});
    });
    registerImpacts();
  }
  function snapshot(){return {elapsed,radius,trayScale,poses:bodies.flatMap(b=>[b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w]),values:[...values],rerolls:[...rerolls],done:values.every(v=>v!==null)};}
  function drainImpacts(){return pendingImpacts.splice(0);}
  return {advance,snapshot,reroll,bodies,drainImpacts,appendDice};
}
