import {Body,Box,ConvexPolyhedron,GSSolver,Material,ContactMaterial,Sphere,Vec3,World} from 'cannon-es';
import {REFERENCE_D6_EDGE} from '../../../shared/diceTrayLayout';
import {diceCollider} from '../../../shared/diceCollider';
import {LIVE_DICE_PRESENTATION_RATE} from '../../../shared/liveDiceTypes';

export function createShatterWorld(radius:number,trayScale=1,floor=0){
 const metresPerUnit=REFERENCE_D6_EDGE*Math.sqrt(3)/2/radius;
 const world=new World({gravity:new Vec3(0,0,-9.80665/metresPerUnit),allowSleep:true});
 (world.solver as GSSolver).iterations=24;
 const stone=new Material('obsidian fragments'),felt=new Material('tray felt'),lining=new Material('tray lining'),lava=new Material('molten droplets');
 world.addContactMaterial(new ContactMaterial(stone,felt,{friction:.42,restitution:.28}));
 world.addContactMaterial(new ContactMaterial(stone,lining,{friction:.18,restitution:.48}));
 world.addContactMaterial(new ContactMaterial(stone,stone,{friction:.30,restitution:.33}));
 world.addContactMaterial(new ContactMaterial(lava,felt,{friction:.75,restitution:.015}));
 world.addContactMaterial(new ContactMaterial(lava,lining,{friction:.6,restitution:.04}));
 world.addContactMaterial(new ContactMaterial(lava,stone,{friction:.5,restitution:.05}));
 world.defaultContactMaterial.friction=.3;world.defaultContactMaterial.restitution=.25;
 const boundaries=new Set<Body>();let collisions=0,wallHits=0,fragmentHits=0;
 const addBox=(p:Vec3,size:Vec3,material:Material)=>{const b=new Body({mass:0,position:p,shape:new Box(size),material});world.addBody(b);boundaries.add(b);return b;};
 addBox(new Vec3(0,0,floor-.2),new Vec3(30*trayScale,30*trayScale,.2),felt);
 for(const [x,y,hx,hy] of [[-7,0,.2,4.7],[7,0,.2,4.7],[0,-4.5,7.2,.2],[0,4.5,7.2,.2]])addBox(new Vec3(x*trayScale,y*trayScale,floor+.58),new Vec3(hx*trayScale,hy*trayScale,.58),lining);
 const dynamic=new Set<Body>(),proxies:Body[]=[];
 const track=(body:Body)=>{
  dynamic.add(body);world.addBody(body);
  body.addEventListener('collide',(event:{body:Body})=>{collisions++;if(boundaries.has(event.body)&&event.body.material===lining)wallHits++;if(dynamic.has(event.body)&&body.material===stone&&event.body.material===stone)fragmentHits++;});
  return body;
 };
 let last:number|undefined;
 return {
  metresPerUnit,
  addChunk(vertices:number[][],faces:number[][],volume:number){
   const shape=new ConvexPolyhedron({vertices:vertices.map(v=>new Vec3(...v as [number,number,number])),faces});
   return track(new Body({mass:Math.max(.01,volume*Math.pow(metresPerUnit,3)*2350*1000),shape,material:stone,linearDamping:.015,angularDamping:.025,allowSleep:true,sleepSpeedLimit:.35,sleepTimeLimit:.25,collisionFilterGroup:8}));
  },
  addLava(size:number){return track(new Body({mass:4/3*Math.PI*Math.pow(size*metresPerUnit,3)*2600*1000,shape:new Sphere(size),material:lava,linearDamping:.12,angularDamping:.25,allowSleep:true,sleepSpeedLimit:.4,sleepTimeLimit:.2,collisionFilterGroup:4,collisionFilterMask:1}));},
  addDieProxy(sides:number,size:number){const body=new Body({mass:0,shape:diceCollider(sides,size),material:stone,collisionFilterGroup:2,collisionFilterMask:12});proxies.push(body);world.addBody(body);return body;},
  remove(body:Body){if(dynamic.delete(body))world.removeBody(body);},
  advance(now:number){
   const dt=last===undefined?0:Math.min(.05,Math.max(0,(now-last)/1000));last=now;
   if(dynamic.size&&dt)world.step(1/240,dt*LIVE_DICE_PRESENTATION_RATE,12);
  },
  stats(){return {bodies:dynamic.size,collisions,wallHits,fragmentHits};},
  dispose(){for(const body of [...world.bodies])world.removeBody(body);dynamic.clear();proxies.length=0;},
 };
}
export type ShatterWorld=ReturnType<typeof createShatterWorld>;
