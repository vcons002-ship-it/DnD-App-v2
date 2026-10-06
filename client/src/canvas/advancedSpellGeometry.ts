import {AdditiveBlending,InstancedMesh,Object3D,CatmullRomCurve3,TubeGeometry,ConeGeometry,CylinderGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,SphereGeometry,TorusGeometry,Vector3,type BufferGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {SpellImpactStyle} from '../../../shared/spellImpact';

/** Shared, bounded geometry: no texture downloads, particles or physics jobs. */
export function createAdvancedSpellGeometry(){
 const ring=new TorusGeometry(.46,.012,6,64),arc=new TorusGeometry(.4,.015,6,44,Math.PI*1.4),spark=new SphereGeometry(.017,6,4),shard=new ConeGeometry(.035,.14,4),ribbon=new PlaneGeometry(.02,.21);
 const geometries:BufferGeometry[]=[ring,arc,spark,shard,ribbon];
 const stem=new CylinderGeometry(.003,.006,.055,5),thorn=new ConeGeometry(.0065,.032,7),copies:BufferGeometry[]=[],pose=new Mesh(stem);
 // Dense branches remain one merged mesh. Floating lights use two instanced
 // meshes, so density does not introduce hundreds of plant draw calls.
 for(let i=0;i<260;i++){
  const a=i*2.399963,r=Math.sqrt((i+.5)/260)*.48,x=Math.cos(a)*r,z=Math.sin(a)*r;
  pose.position.set(x,.025,z);pose.rotation.set(.16*Math.sin(i),a,.25*Math.cos(i));pose.scale.setScalar(.7+(i%7)/12);pose.updateMatrix();copies.push(stem.clone().applyMatrix4(pose.matrix));
  for(let j=0;j<3;j++){pose.geometry=thorn;pose.position.set(x+Math.cos(a+j*2)*.010,.018+j*.017,z+Math.sin(a+j*2)*.010);pose.rotation.set(.65,a+j*2,.7);pose.updateMatrix();copies.push(thorn.clone().applyMatrix4(pose.matrix));}
 }
 for(let i=0;i<95;i++){
  const a=i*2.399963,r=Math.sqrt((i+.5)/95)*.44,x=Math.cos(a)*r,z=Math.sin(a)*r;
  const points=Array.from({length:7},(_,j)=>{const t=j/6;return new Vector3(x+Math.cos(a+t*(1.3+(i%5)*.7))*t*(.025+(i%7)*.007),.002+Math.sin(t*Math.PI)*(.005+(i%5)*.006)*(1+.3*Math.sin(j*1.7+i)),z+Math.sin(a+t*2)*t*(.03+(i%3)*.016));});
  const branch=new TubeGeometry(new CatmullRomCurve3(points),16,.004,5,false);copies.push(branch);
 }
 const mote=new SphereGeometry(.0045,8,5);geometries.push(mote);
 const thorns=mergeGeometries(copies)!;copies.forEach(g=>g.dispose());stem.dispose();thorn.dispose();geometries.push(thorns);
 function build(style:SpellImpactStyle,_body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],materials:(MeshBasicMaterial|MeshStandardMaterial)[]=[];
  let moteCores:InstancedMesh|undefined,moteHalos:InstancedMesh|undefined;
  const motePose=new Object3D();
  const add=(g:BufferGeometry,m:MeshBasicMaterial|MeshStandardMaterial=bright)=>{const mesh=new Mesh(g,m);root.add(mesh);parts.push(mesh);return mesh;};
  if(style.kind==='thorns'){
   const bark=new MeshStandardMaterial({color:'#706640',roughness:.88,metalness:0,emissive:'#173408',emissiveIntensity:.16,transparent:true,depthWrite:false,side:DoubleSide});bark.userData.opacityScale=1;materials.push(bark);
   add(thorns,bark);const edge=add(ring,bright);edge.rotation.x=Math.PI/2;edge.scale.setScalar(1.08);edge.position.y=.005;
   const core=new MeshBasicMaterial({color:'#b8ffa0',transparent:true,blending:AdditiveBlending,depthWrite:false,toneMapped:false});core.userData.opacityScale=1.3;
   const halo=core.clone();halo.color.set('#29d35b');halo.userData.opacityScale=.20;materials.push(core,halo);
   moteCores=new InstancedMesh(mote,core,48);moteHalos=new InstancedMesh(mote,halo,48);
   for(const mesh of [moteCores,moteHalos]){mesh.frustumCulled=false;root.add(mesh);parts.push(mesh);}
  }else{
   for(let i=0;i<(style.kind==='shimmer'?5:3);i++){const m=add(i===1?ring:arc,i===1?white:bright);m.userData={band:true,index:i};}
   for(let i=0;i<36;i++){const m=add(style.kind==='counter'?shard:style.kind==='shimmer'&&i%3===0?ribbon:spark,i%7===0?white:bright);m.userData={index:i,seed:((i*17)%37)/37,particle:true};}
  }
  return {root,parts,materials,update(t:number,persistent:boolean,reduced:boolean,_areaScale:number){
   if(style.kind==='thorns'){
    const grow=reduced?1:Math.min(1,t/(persistent?1:.45));parts[0].scale.y=grow;parts[1].visible=!persistent||t<1.8;
    if(persistent){materials[0].opacity=1;parts[1].scale.setScalar(1.08+.01*Math.sin(t));}
    const clock=reduced?0:t;
    for(let i=0;i<48;i++){
     const a=i*2.399963,r=Math.sqrt((i+.5)/48)*.46,phase=i*1.71;
     motePose.position.set(Math.cos(a)*r+.005*Math.sin(clock*.38+phase),.035+.028*(.5+.5*Math.sin(clock*.65+phase)),Math.sin(a)*r+.005*Math.cos(clock*.41+phase));
     if(i===16)moteCores!.userData.emitterPoint=motePose.position.clone();
     if(i===36)moteHalos!.userData.emitterPoint=motePose.position.clone();
     const pulse=.8+.25*Math.sin(clock*1.3+phase);motePose.scale.setScalar(grow*pulse);motePose.updateMatrix();moteCores!.setMatrixAt(i,motePose.matrix);
     motePose.scale.setScalar(grow*pulse*3.5);motePose.updateMatrix();moteHalos!.setMatrixAt(i,motePose.matrix);
    }
    moteCores!.instanceMatrix.needsUpdate=true;moteHalos!.instanceMatrix.needsUpdate=true;return;
   }
   for(const m of parts){const i=m.userData.index as number,seed=m.userData.seed??i/5;
    if(m.userData.band){
     const phase=style.kind==='counter'?Math.max(.05,1-t):style.kind==='dispel'?.18+t*.95:.72+.12*Math.sin(t*4+i);
     m.scale.setScalar(phase);m.position.y=style.kind==='dispel'?.12+t:style.kind==='counter'?.45+i*.19:(.12+i*.23+t*.22)%1.3;
     m.rotation.set(style.kind==='shimmer'?Math.PI/2+.2*Math.sin(i):Math.PI/2,style.kind==='counter'?t*2+i:0,reduced?i:i+t*(i%2?-2:2));
    }else{
     const phase=style.kind==='counter'?Math.max(0,1-t):t,angle=i*2.399963+(reduced?0:phase*3),r=style.kind==='counter'?.08+phase*.55:style.kind==='dispel'?.15+phase*.65:.25+seed*.22;
     m.position.set(Math.cos(angle)*r,style.kind==='shimmer'?(seed*1.2+phase*.7)%1.35:style.kind==='counter'?.55+seed*.4:.12+seed+phase*.2,Math.sin(angle)*r);
     m.rotation.set(angle,phase*4,seed*5);m.scale.setScalar(style.kind==='counter'?.5+phase:style.kind==='dispel'?1-phase*.7:.6+Math.sin(seed*7+phase*5)*.3);
    }
    m.userData.emitterPoint=new Vector3();
   }
  }};
 }
 return {build,dispose(){geometries.forEach(g=>g.dispose());}};
}
