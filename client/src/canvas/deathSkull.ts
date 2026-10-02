import {CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape, SphereGeometry, TorusGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Local geometry: a single cached asset shared by all defeated creatures. */

export function createDeathSkull() {
  const model=new Group();model.name='death-skull-marker';
  const bone=new MeshStandardMaterial({color:'#c9bea3',roughness:.66,metalness:0});
  const recess=new MeshStandardMaterial({color:'#201e19',roughness:1});
  const pewter=new MeshStandardMaterial({color:'#343a40',roughness:.36,metalness:.8});pewter.userData.pewterBase=true;
  const base=new Mesh(new CylinderGeometry(.5,.5,.045,64),pewter);base.position.y=.0225;model.add(base);
  const rim=new Mesh(new TorusGeometry(.478,.012,8,64),pewter);rim.rotation.x=Math.PI/2;rim.position.y=.047;model.add(rim);
  const skull=new Group();skull.name='bone-skull';
  // Face upward so the cavities and teeth read in overhead and tilted views.
  skull.rotation.x=-Math.PI/2+.28;skull.position.set(0,.235,0);model.add(skull);
  const dome=new Mesh(new SphereGeometry(1,32,24),bone);dome.scale.set(.235,.26,.205);dome.position.set(0,.095,-.045);skull.add(dome);
  const face=new Shape();face.moveTo(-.195,.19);face.quadraticCurveTo(0,.29,.195,.19);
  face.lineTo(.215,.03);face.lineTo(.145,-.085);face.lineTo(.105,-.19);face.quadraticCurveTo(0,-.235,-.105,-.19);face.lineTo(-.145,-.085);face.lineTo(-.215,.03);face.closePath();
  for(const x of [-.095,.095]){
    const socket=new Path();socket.absellipse(x,.06,.073,.064,0,Math.PI*2,true);face.holes.push(socket);
    const hollow=new Mesh(new SphereGeometry(1,20,12),recess);hollow.scale.set(.072,.063,.026);hollow.position.set(x,.06,.164);skull.add(hollow);
  }
  const nose=new Path();nose.moveTo(0,.008);nose.lineTo(.033,-.084);nose.quadraticCurveTo(0,-.107,-.033,-.084);nose.closePath();face.holes.push(nose);
  const nasal=new Mesh(new SphereGeometry(1,16,10),recess);nasal.scale.set(.035,.05,.023);nasal.position.set(0,-.048,.163);skull.add(nasal);
  const maskGeometry=new ExtrudeGeometry(face,{depth:.025,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.009,bevelThickness:.01,curveSegments:24});
  const vertices=maskGeometry.getAttribute('position');
  for(let i=0;i<vertices.count;i++)vertices.setZ(i,vertices.getZ(i)+.018*(1-(vertices.getX(i)/.22)**2));maskGeometry.computeVertexNormals();
  const mask=new Mesh(maskGeometry,bone);mask.position.z=.18;skull.add(mask);
  for(const x of [-.177,.177]){
    const cheek=new Mesh(new SphereGeometry(1,16,12),bone);cheek.scale.set(.034,.048,.025);cheek.position.set(x,-.022,.194);skull.add(cheek);
  }
  const jaw=new Mesh(new TorusGeometry(.115,.027,10,32,Math.PI),bone);jaw.rotation.z=Math.PI;jaw.position.set(0,-.16,.173);skull.add(jaw);
  const toothGeometry=new SphereGeometry(1,10,8);
  for(let i=0;i<8;i++)for(const y of [-.147,-.18]){
    const x=(i-3.5)*.024,tooth=new Mesh(toothGeometry,bone);tooth.scale.set(.011,.018,.013);tooth.position.set(x,y,.214-Math.abs(x)*.12);skull.add(tooth);
  }
  // Three material batches instead of a draw call for each tooth/socket.
  // Every instance then shares these cached geometries, as normal minis do.
  model.updateMatrixWorld(true);
  for(const [material,name] of [[bone,'bone-skull'],[recess,'skull-sockets'],[pewter,'death-marker-base']] as const){
    const meshes:Mesh[]=[];model.traverse(n=>{if(n instanceof Mesh&&n.material===material)meshes.push(n);});
    const parts=meshes.map(m=>(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());
    const originals=new Set(meshes.map(m=>m.geometry));meshes.forEach(m=>m.removeFromParent());originals.forEach(g=>g.dispose());
    const mesh=new Mesh(geometry,material);mesh.name=name;model.add(mesh);
  }
  skull.removeFromParent();return model;
}
