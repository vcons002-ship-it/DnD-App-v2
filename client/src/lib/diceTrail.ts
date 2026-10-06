import * as THREE from 'three';
import {createTrailBranches} from './diceTrailBranches';

type TrailPoint={x:number;y:number;time:number};
/** Optional appearance experiment. Ground-space ribbons respect tray/die depth. */
export function createDiceTrails(scene:THREE.Scene,radius:number,indices:number[]){
 const capacity=96,lifetime=1150;
 const glow=document.createElement('canvas');glow.width=glow.height=32;
 const ctx=glow.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,0,16,16,16);
 gradient.addColorStop(0,'#fff');gradient.addColorStop(.2,'#fffc');gradient.addColorStop(1,'#fff0');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
 const texture=new THREE.CanvasTexture(glow);
 const strip=document.createElement('canvas');strip.width=64;strip.height=8;
 const stripContext=strip.getContext('2d')!,edge=stripContext.createLinearGradient(0,0,64,0);
 edge.addColorStop(0,'#fff0');edge.addColorStop(.35,'#fff9');edge.addColorStop(.5,'#fff');edge.addColorStop(.65,'#fff9');edge.addColorStop(1,'#fff0');stripContext.fillStyle=edge;stripContext.fillRect(0,0,64,8);
 const ribbonMap=new THREE.CanvasTexture(strip);
 const trails=indices.map(index=>{
  const position=new Float32Array((capacity-1)*18),color=new Float32Array(position.length);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(color,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const uv=new Float32Array((capacity-1)*12);for(let j=0;j<capacity-1;j++)uv.set([0,0,1,0,0,1,1,0,1,1,0,1],j*12);geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const material=new THREE.MeshBasicMaterial({map:ribbonMap,vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const ribbon=new THREE.Mesh(geometry,material);ribbon.frustumCulled=false;scene.add(ribbon);
  const sparksGeometry=new THREE.BufferGeometry(),sparkPosition=new Float32Array(capacity*3),sparkColor=new Float32Array(capacity*3);
  sparksGeometry.setAttribute('position',new THREE.BufferAttribute(sparkPosition,3).setUsage(THREE.DynamicDrawUsage));sparksGeometry.setAttribute('color',new THREE.BufferAttribute(sparkColor,3).setUsage(THREE.DynamicDrawUsage));sparksGeometry.setDrawRange(0,0);
  const sparksMaterial=new THREE.PointsMaterial({map:texture,size:radius*.23,vertexColors:true,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
  const sparks=new THREE.Points(sparksGeometry,sparksMaterial);sparks.frustumCulled=false;scene.add(sparks);
  const branches=createTrailBranches(scene,radius);
  return {index,branches,points:[] as TrailPoint[],lastSample:undefined as TrailPoint|undefined,geometry,material,ribbon,sparksGeometry,sparksMaterial,sparks,position,color,sparkPosition,sparkColor};
 });
 return {
  pointCount(){return trails.reduce((sum,t)=>sum+t.points.length,0);},
  branchCount(){return trails.reduce((sum,t)=>sum+t.branches.count(),0);},
  update(poses:THREE.Object3D[],now:number){
   for(const trail of trails){
    const {points,position,color}=trail,p=poses[trail.index].position,last=trail.lastSample;
    trail.branches.update(p,now);
    if(p.z<radius*1.45&&Math.abs(p.x)<6.9&&Math.abs(p.y)<4.45&&(!last||Math.hypot(p.x-last.x,p.y-last.y)>radius*.085)){
     const point={x:p.x,y:p.y,time:now};points.push(point);trail.lastSample=point;
    }
    while(points.length&&(now-points[0].time>lifetime||points.length>capacity))points.shift();
    let vertex=0,spark=0;
    for(let j=1;j<points.length;j++){
     const a=points[j-1],b=points[j],length=Math.max(.001,Math.hypot(b.x-a.x,b.y-a.y)),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
     const fadeA=Math.pow(Math.max(0,1-(now-a.time)/lifetime),1.4),fadeB=Math.pow(Math.max(0,1-(now-b.time)/lifetime),1.4);
     const wa=radius*.34*fadeA,wb=radius*.34*fadeB;
     const quad=[[a.x+nx*wa,a.y+ny*wa,fadeA],[a.x-nx*wa,a.y-ny*wa,fadeA],[b.x+nx*wb,b.y+ny*wb,fadeB],[a.x-nx*wa,a.y-ny*wa,fadeA],[b.x-nx*wb,b.y-ny*wb,fadeB],[b.x+nx*wb,b.y+ny*wb,fadeB]];
     for(const [x,y,fade] of quad){position.set([x,y,.021],vertex*3);color.set([fade*.12,fade*1.9,fade*.6],vertex*3);vertex++;}
     if(j%2===0){
      const age=(now-b.time)/1000,wander=Math.sin(b.time*.021)*radius*.13;
      trail.sparkPosition.set([b.x+nx*wander,b.y+ny*wander,.06+age*.22],spark*3);
      trail.sparkColor.set([fadeB*.9,fadeB*.63,fadeB*.17],spark*3);spark++;
     }
    }
    trail.geometry.setDrawRange(0,vertex);trail.geometry.attributes.position.needsUpdate=true;trail.geometry.attributes.color.needsUpdate=true;
    trail.sparksGeometry.setDrawRange(0,spark);trail.sparksGeometry.attributes.position.needsUpdate=true;trail.sparksGeometry.attributes.color.needsUpdate=true;
   }
  },
  dispose(){for(const t of trails){t.branches.dispose();scene.remove(t.ribbon,t.sparks);t.geometry.dispose();t.material.dispose();t.sparksGeometry.dispose();t.sparksMaterial.dispose();}texture.dispose();ribbonMap.dispose();}
 };
}
