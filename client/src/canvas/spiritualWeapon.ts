import {CylinderGeometry,ExtrudeGeometry,Group,Mesh,MeshStandardMaterial,Shape,SphereGeometry,TorusGeometry} from 'three';

/** A spectral force, not a creature or a physical inventory weapon. */
export function createSpiritualWeapon(){
  const root=new Group();root.name='spiritual-weapon';
  const force=new MeshStandardMaterial({color:'#d9c9ff',emissive:'#8965d6',emissiveIntensity:.8,metalness:.55,roughness:.24,transparent:true,opacity:.8});
  const bright=new MeshStandardMaterial({color:'#e7ddff',emissive:'#baa0ff',emissiveIntensity:1.2,roughness:.2});
  const shape=new Shape();shape.moveTo(0,.98);shape.lineTo(.105,.7);shape.lineTo(.065,.12);shape.lineTo(-.065,.12);shape.lineTo(-.105,.7);shape.closePath();
  const blade=new Mesh(new ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelThickness:.012,bevelSize:.009,bevelSegments:2}),force);
  blade.position.set(0,.42,-.0175);root.add(blade);
  const guardShape=new Shape();guardShape.moveTo(-.22,0);guardShape.quadraticCurveTo(0,.09,.22,0);guardShape.lineTo(.21,-.04);guardShape.quadraticCurveTo(0,.01,-.21,-.04);guardShape.closePath();
  const guard=new Mesh(new ExtrudeGeometry(guardShape,{depth:.05,bevelEnabled:true,bevelThickness:.01,bevelSize:.008,bevelSegments:2}),bright);guard.position.set(0,.55,-.025);root.add(guard);
  const handle=new Mesh(new CylinderGeometry(.03,.03,.2,12),force);handle.position.y=.44;root.add(handle);
  const pommel=new Mesh(new SphereGeometry(.052,12,8),bright);pommel.position.y=.32;root.add(pommel);
  const ring=new Mesh(new TorusGeometry(.45,.012,6,48),force);ring.rotation.x=Math.PI/2;ring.position.y=.02;root.add(ring);
  root.traverse(n=>{if(n instanceof Mesh)n.castShadow=false;});return root;
}
