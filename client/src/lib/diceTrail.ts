import * as THREE from 'three';
import {DICE_TRAIL_LIFETIME,diceTrailFade} from './diceTrailTiming';
import {createTrailBranches,createBotanicalTrailAssets} from './diceTrailBranches';
import {createTrailVine,createTrailVineMaterial} from './diceTrailVine';

type TrailPoint={x:number;y:number;time:number;distance:number};
/** Rounded woody roots follow the die path and respect tray/die depth. */
export function createDiceTrails(scene:THREE.Scene,radius:number,indices:number[],trayScale=1){
 const capacity=192,lifetime=DICE_TRAIL_LIFETIME;
 const glow=document.createElement('canvas');glow.width=glow.height=32;
 const ctx=glow.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,0,16,16,16);
 gradient.addColorStop(0,'#fff');gradient.addColorStop(.2,'#fffc');gradient.addColorStop(1,'#fff0');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
 const texture=new THREE.CanvasTexture(glow);
 const botanicalAssets=indices.length?createBotanicalTrailAssets():undefined;
 const vineMaterial=createTrailVineMaterial(botanicalAssets?.material.bumpMap);
 const trails=indices.map(index=>{
  const vine=createTrailVine(capacity,radius),geometry=vine.geometry;
  const root=new THREE.Mesh(geometry,vineMaterial.material);root.frustumCulled=false;scene.add(root);
  const sparksGeometry=new THREE.BufferGeometry(),sparkPosition=new Float32Array(capacity*3),sparkColor=new Float32Array(capacity*3);
  sparksGeometry.setAttribute('position',new THREE.BufferAttribute(sparkPosition,3).setUsage(THREE.DynamicDrawUsage));sparksGeometry.setAttribute('color',new THREE.BufferAttribute(sparkColor,3).setUsage(THREE.DynamicDrawUsage));sparksGeometry.setDrawRange(0,0);
  const sparksMaterial=new THREE.PointsMaterial({map:texture,size:radius*.15,vertexColors:true,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
  const sparks=new THREE.Points(sparksGeometry,sparksMaterial);sparks.frustumCulled=false;scene.add(sparks);
  const branches=createTrailBranches(scene,radius,botanicalAssets);
  return {index,branches,points:[] as TrailPoint[],lastSample:undefined as TrailPoint|undefined,geometry,vine,root,sparksGeometry,sparksMaterial,sparks,sparkPosition,sparkColor};
 });
 return {
  pointCount(){return trails.reduce((sum,t)=>sum+t.points.length,0);},
  branchCount(){return trails.reduce((sum,t)=>sum+t.branches.count(),0);},
  update(poses:THREE.Object3D[],now:number){
   vineMaterial.time.value=now/1000;
   for(const trail of trails){
    const {points}=trail,p=poses[trail.index].position,last=trail.lastSample;
    let rootSample:{x:number;y:number;angle:number;distance:number}|undefined;
    if(p.z<radius*1.45&&Math.abs(p.x)<7*trayScale-radius*.1&&Math.abs(p.y)<4.5*trayScale-radius*.05&&(!last||Math.hypot(p.x-last.x,p.y-last.y)>radius*.085)){
     const distance=last?Math.hypot(p.x-last.x,p.y-last.y):0;
     if(distance>radius*3)points.length=0; // Never bridge a rethrow with a root.
     const point={x:p.x,y:p.y,time:now,distance:(last?.distance??0)+distance};points.push(point);trail.lastSample=point;
     if(last&&distance<=radius*3){
      const angle=Math.atan2(p.y-last.y,p.x-last.x),along=point.distance/radius;
      const curl=(Math.sin(along*2.2)*.07+Math.sin(along*4.7)*.025)*radius;
      rootSample={x:p.x-Math.sin(angle)*curl,y:p.y+Math.cos(angle)*curl,angle,distance:point.distance};
     }
    }
    while(points.length&&(now-points[0].time>lifetime||points.length>capacity))points.shift();
    trail.vine.update(points,now,lifetime);
    trail.branches.update(now,rootSample,points.length>1?points[0].time:now+1);
    let spark=0;
    for(let j=1;j<points.length;j++){
     const a=points[j-1],b=points[j],length=Math.max(.001,Math.hypot(b.x-a.x,b.y-a.y)),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
     const fadeB=diceTrailFade((now-b.time)/lifetime);
     if(j%2===0){
      const age=(now-b.time)/1000,wander=Math.sin(b.time*.021)*radius*.13;
      trail.sparkPosition.set([b.x+nx*wander,b.y+ny*wander,.06+age*.22],spark*3);
      trail.sparkColor.set([fadeB*.46,fadeB*.85,fadeB*.32],spark*3);spark++;
     }
    }
    trail.sparksGeometry.setDrawRange(0,spark);trail.sparksGeometry.attributes.position.needsUpdate=true;trail.sparksGeometry.attributes.color.needsUpdate=true;
   }
  },
  dispose(){for(const t of trails){t.branches.dispose();scene.remove(t.root,t.sparks);t.geometry.dispose();t.sparksGeometry.dispose();t.sparksMaterial.dispose();}vineMaterial.material.dispose();botanicalAssets?.dispose();texture.dispose();}
 };
}
