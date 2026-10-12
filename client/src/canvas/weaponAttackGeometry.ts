import {BufferGeometry,Float32BufferAttribute,Group,Mesh,InstancedMesh,Matrix4,MeshBasicMaterial,CylinderGeometry,ConeGeometry,BoxGeometry,SphereGeometry,TorusGeometry,Shape,ExtrudeGeometry,DoubleSide,Vector3,type Camera} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact';
import type {WeaponAttackKind} from '../../../shared/types';
import {WEAPON_FLIGHT_MS,isWeaponProjectile} from '../../../shared/weaponImpact';

/** Shared physical attack meshes. No lights, shadow maps or asset loads. */
export function createWeaponAttackGeometry(){
  const geometries:BufferGeometry[]=[];
  const keep=<T extends BufferGeometry>(g:T)=>{geometries.push(g);return g;};
  function streak(path:(t:number)=>[number,number],width:number){
    const points:number[]=[],indices:number[]=[];
    for(let i=0;i<=48;i++){
      const t=i/48,[x,y]=path(t),[ax,ay]=path(Math.max(0,t-.01)),[bx,by]=path(Math.min(1,t+.01));
      const len=Math.hypot(bx-ax,by-ay)||1,w=Math.pow(Math.sin(t*Math.PI),.65)*width;
      for(const sign of [-1,1])points.push(x-sign*(by-ay)/len*w,y+sign*(bx-ax)/len*w,0);
      if(i<48){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
    }
    const g=keep(new BufferGeometry());g.setAttribute('position',new Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  // Upper-left to lower-right across the body, rather than orbiting its base.
  const cut=streak(t=>[-.76+t*1.52,.9-t*1.8+Math.sin(t*Math.PI)*.08],.115);
  const lash=streak(t=>[-1.1+t*2.1,.3*Math.sin(t*Math.PI*2)-.1],.045);
  const stab=keep(new BufferGeometry());stab.setAttribute('position',new Float32BufferAttribute([-.85,-.04,0,.06,0,0,-.85,.04,0,-.65,0,.015,.08,0,.015,-.65,.014,.015],3));stab.computeVertexNormals();
  const shaft=keep(new CylinderGeometry(.014,.014,.58,6)),head=keep(new ConeGeometry(.05,.15,4)),feather=keep(new BoxGeometry(.08,.14,.009)),
    chip=keep(new ConeGeometry(.04,.1,4)),orb=keep(new SphereGeometry(.07,8,6)),ring=keep(new TorusGeometry(.3,.025,4,40)),
    hammerHead=keep(new BoxGeometry(.34,.16,.14)),knifeBlade=keep(new ConeGeometry(.07,.32,3)),fang=keep(new ConeGeometry(.05,.19,4));
  const axeShape=new Shape();axeShape.moveTo(-.035,-.09);axeShape.lineTo(.1,-.1);axeShape.quadraticCurveTo(.15,-.15,.28,-.16);axeShape.quadraticCurveTo(.36,0,.28,.16);axeShape.quadraticCurveTo(.15,.15,.1,.1);axeShape.lineTo(-.035,.09);axeShape.closePath();
  const axeHead=keep(new ExtrudeGeometry(axeShape,{depth:.035,bevelEnabled:false,curveSegments:5})),up=new Vector3(0,1,0),scratch=new Vector3();
  function build(style:SpellImpactStyle,_body:MeshBasicMaterial,_bright:MeshBasicMaterial,_white:MeshBasicMaterial){
    const kind=style.kind.slice(7) as WeaponAttackKind,root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
    const material=(color:string,opacity=1)=>{const m=new MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:DoubleSide,toneMapped:false});m.userData.opacityScale=opacity;m.forceSinglePass=true;materials.push(m);return m;};
    const steel=material('#ffffff'),dust=material('#d3bea0',.9),wood=material('#70401f'),metal=material('#c7d5db'),edge=material('#18202b',.85);
    const add=(g:BufferGeometry,m:MeshBasicMaterial,parent=root)=>{const mesh=new Mesh(g,m);parent.add(mesh);parts.push(mesh);return mesh;};
    const impactFace=new Group();root.add(impactFace);
    // Choose once per effect (including detached prewarm), never per frame.
    const mirror=isWeaponProjectile(kind)||kind==='thrust'?1:Math.random()<.5?-1:1;
    impactFace.scale.x=mirror;root.userData.meleeMirror=mirror;
    const cuts=new Group();cuts.name='weapon-diagonal-cut';impactFace.add(cuts);
    const cutCount=kind==='claw'?3:1,cutGeometry=kind==='whip'?lash:cut;
    for(let i=0;i<cutCount;i++){
      const shadow=add(cutGeometry,edge,cuts),blade=add(cutGeometry,steel,cuts);
      shadow.position.set((i-(cutCount-1)/2)*.2,0,-.015);shadow.scale.set(1.04,1.04,1);
      blade.position.x=shadow.position.x;
    }
    const thrust=add(stab,steel,impactFace);thrust.name='weapon-thrust-streak';
    const jaw=new Group();jaw.name='weapon-bite';impactFace.add(jaw);
    const teeth=Array.from({length:6},(_,i)=>{const m=add(fang,metal,jaw);m.userData.row=i<3?1:-1;m.position.x=(i%3-1)*.22;m.rotation.z=i<3?Math.PI:0;return m;});
    const flash=add(orb,steel,impactFace);flash.name='weapon-contact';
    const shock=add(ring,dust,impactFace);
    // Twelve shards in two draws, reusing geometry and matrix scratch storage.
    const chips=[dust,metal].map(m=>{const mesh=new InstancedMesh(chip,m,6);mesh.frustumCulled=false;impactFace.add(mesh);parts.push(mesh);return mesh;});
    const shardPose=new Group(),shardMatrix=new Matrix4();
    const projectile=new Group();projectile.name='weapon-projectile';root.add(projectile);projectile.scale.setScalar(1.65);
    const wake=new Group();wake.name='weapon-flight-wake';root.add(wake);
    for(let i=0;i<3;i++){const m=add(shaft,material('#e6dfce',.32/(i+1)),wake);m.scale.set(.7-i*.15,1.1-i*.2,.7-i*.15);m.position.set((i-1)*.07,-.6-i*.2,0);}
    const shaftAt=(y:number,length=1)=>{const m=add(shaft,wood,projectile);m.position.y=y;m.scale.y=length;return m;};
    const tipAt=(x:number,y:number)=>{const m=add(head,metal,projectile);m.position.set(x,y,0);return m;};
    if(kind==='stone'||kind==='bullet'){
      const m=add(orb,kind==='bullet'?steel:dust,projectile);m.scale.setScalar(kind==='bullet'?.6:1.2);
      if(kind==='bullet'){const trace=add(shaft,steel,projectile);trace.scale.set(.55,.8,.55);trace.position.y=-.25;}
    }else if(kind==='axe'){
      const handle=shaftAt(-.13,1.1);handle.name='weapon-axe-handle';handle.scale.x=handle.scale.z=2.3;
      const blade=add(axeHead,metal,projectile);blade.name='weapon-axe-head';blade.position.set(0,.16,-.0175);
      const rim=add(axeHead,steel,projectile);rim.scale.set(.2,1.02,1.03);rim.position.set(.24,.16,-.018);
    }else if(kind==='hammer'){
      shaftAt(-.13,1.1);const m=add(hammerHead,metal,projectile);m.position.y=.17;
    }else if(kind==='knife'||kind==='thrown'){
      shaftAt(-.24,.4);const m=add(knifeBlade,metal,projectile);m.position.y=.02;m.scale.z=.25;
    }else{
      shaftAt(-.23,kind==='spear'||kind==='trident'?1.5:kind==='dart'||kind==='bolt'?.7:1);
      tipAt(0,.12);
      if(kind==='trident')for(const x of [-.12,.12]){tipAt(x,.12);const neck=add(shaft,metal,projectile);neck.position.set(x,-.02,0);neck.scale.y=.35;}
      if(kind==='trident'){const cross=add(shaft,metal,projectile);cross.position.y=-.09;cross.scale.y=.45;cross.rotation.z=Math.PI/2;}
      if(['arrow','bolt','dart'].includes(kind))for(const angle of [0,Math.PI/2]){const f=add(feather,dust,projectile);f.position.y=kind==='arrow'?-.46:-.37;f.rotation.y=angle;}
    }
    const destination=new Vector3(0,.7,0),start=new Vector3(),direction=new Vector3(),eye=new Vector3(),spinAxis=new Vector3(),rollUp=new Vector3(),basis=new Matrix4(),projectedStart=new Vector3(),projectedEnd=new Vector3();
    let hasSource=false,thrustOffset=0;
    root.userData.faceCamera=(camera:Camera)=>{
      camera.getWorldPosition(eye);eye.sub(root.getWorldPosition(scratch)).normalize();
      const height=root.userData.bodyHeight??1.5;
      // Only contact geometry faces the viewer. Foreground bodies keep occluding it.
      impactFace.position.copy(destination).addScaledVector(eye,height*.62);
      impactFace.quaternion.copy(camera.quaternion);root.updateMatrixWorld(true);
      if(kind==='thrust'){
        // Keep the readable camera-facing streak, but aim it along the actual
        // attacker-to-victim direction, including when the map camera rotates.
        let angle=Math.PI/6;
        if(hasSource){
          projectedStart.set(start.x,destination.y,start.z);root.localToWorld(projectedStart).project(camera);
          projectedEnd.copy(destination);root.localToWorld(projectedEnd).project(camera);
          const dx=(projectedEnd.x-projectedStart.x)*camera.projectionMatrix.elements[5]/camera.projectionMatrix.elements[0],dy=projectedEnd.y-projectedStart.y;
          if(dx*dx+dy*dy>1e-10)angle=Math.atan2(dy,dx);
        }
        thrust.rotation.z=angle;thrust.position.set(Math.cos(angle)*thrustOffset,Math.sin(angle)*thrustOffset,0);root.updateMatrixWorld(true);
      }
    };
    return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,source?:Vector3){
      const height=root.userData.bodyHeight??1.5;destination.y=height*.58;
      const flight=isWeaponProjectile(kind)&&source?WEAPON_FLIGHT_MS/style.duration:0;
      const hit=Math.max(0,(t-flight)/(1-flight)),active=t>=flight;
      hasSource=!!source;if(source)start.copy(source);else start.set(-.7,.8,0);direction.copy(destination).sub(start);
      cuts.visible=active&&['slash','claw','whip'].includes(kind)&&hit<.7;
      // Fast wind-up, forceful follow-through, then a short readable cut scar.
      const sweep=Math.min(1,.08+hit/.085),follow=Math.min(1,hit/.22);
      cuts.scale.set(sweep,sweep*Math.max(.8,height/1.5),1);cuts.position.set(-.76*(1-sweep)+follow*.12,.9*(1-sweep)-follow*.14,0);
      thrust.visible=active&&kind==='thrust'&&hit<.55;
      const drive=Math.sin(Math.min(1,hit/.3)*Math.PI);thrustOffset=-.6+drive*.65;thrust.position.set(thrustOffset,0,0);thrust.scale.set(.6+drive*.9,1.6,1);
      jaw.visible=active&&kind==='bite'&&hit<.6;
      teeth.forEach(m=>{m.position.y=m.userData.row*(.1+.28*(1-Math.sin(Math.min(1,hit/.5)*Math.PI)));});
      projectile.visible=flight>0&&t<flight;
      wake.visible=projectile.visible;
      if(projectile.visible){
        const q=Math.pow(Math.min(1,t/flight),1.22);projectile.position.copy(start).lerp(destination,q);projectile.position.y+=Math.sin(q*Math.PI)*.12;
        direction.normalize();
        // Spin in the vertical flight plane, not around the flight direction.
        // Local +X is the axe edge; its last quarter-turn points it at the target.
        spinAxis.crossVectors(up,direction);if(spinAxis.lengthSq()<1e-6)spinAxis.set(0,0,1);spinAxis.normalize();
        rollUp.crossVectors(direction,spinAxis).normalize();basis.makeBasis(rollUp,direction,spinAxis);
        projectile.quaternion.setFromRotationMatrix(basis);
        // Keep the flight wake separate from the rotating weapon.
        wake.position.copy(projectile.position);wake.quaternion.copy(projectile.quaternion);
        if(['axe','hammer','knife','thrown'].includes(kind))projectile.rotateZ(Math.PI/2+q*Math.PI*4);
      }
      flash.visible=active&&hit<.13;flash.position.set(0,0,0);flash.scale.setScalar(.3+Math.sin(Math.min(1,hit/.13)*Math.PI)*2.5);
      const heavy=['blunt','stone','hammer'].includes(kind),burst=1-Math.pow(1-Math.min(1,hit/.55),3);
      shock.visible=active&&hit<.55;shock.scale.set( .4+burst*(heavy?3.2:1.9),.4+burst*(heavy?2.5:1.5),1);
      chips.forEach(m=>m.visible=active&&hit<.62);
      if(active&&hit<.62){
        const travel=burst*(heavy?1.7:1.25),cutting=['slash','claw','whip','axe'].includes(kind);
        for(let i=0;i<12;i++){
          const angle=i*2.399;shardPose.position.set(Math.cos(angle)*travel,Math.sin(angle)*travel-hit*hit*.8,Math.sin(hit*Math.PI)*(.18+i%3*.05));shardPose.rotation.set(0,0,angle-Math.PI/2);shardPose.scale.set(reduced?.75:1,(cutting?2.5:1.5)*(1-hit),.7);shardPose.updateMatrix();shardMatrix.copy(shardPose.matrix);chips[i%2].setMatrixAt(Math.floor(i/2),shardMatrix);
        }
        chips.forEach(m=>m.instanceMatrix.needsUpdate=true);
      }
      for(const m of materials)m.opacity=m.userData.opacityScale*(active?Math.max(0,1-hit*1.1):1);
    }};
  }
  return {build,dispose(){geometries.forEach(g=>g.dispose());}};
}
