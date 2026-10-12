import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,CylinderGeometry,ConeGeometry,BoxGeometry,SphereGeometry,TorusGeometry,DoubleSide,Vector3,type Camera} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact';
import {WEAPON_FLIGHT_MS} from '../../../shared/weaponImpact';

/** Shared, small physical attack meshes. No lights, shadow maps or asset loads. */
export function createWeaponAttackGeometry(){
  const ribbon=new BufferGeometry(),points:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<=48;i++){
    const a=-1.1+i/48*2.2,width=Math.sin(i/48*Math.PI)*.28;
    for(const r of [1-width,1]){points.push(Math.cos(a)*r,Math.sin(a)*r,0);uvs.push(i/48,r===1?1:0);}
    if(i<48){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  ribbon.setAttribute('position',new Float32BufferAttribute(points,3));ribbon.setAttribute('uv',new Float32BufferAttribute(uvs,2));ribbon.setIndex(indices);ribbon.computeVertexNormals();
  const shaft=new CylinderGeometry(.014,.014,.58,6),head=new ConeGeometry(.05,.15,4),feather=new BoxGeometry(.08,.14,.009),
    chip=new ConeGeometry(.04,.1,4),orb=new SphereGeometry(.07,8,6),ring=new TorusGeometry(.3,.025,4,40);
  const geometries=[ribbon,shaft,head,feather,chip,orb,ring],up=new Vector3(0,1,0);
  function build(style:SpellImpactStyle,_body:MeshBasicMaterial,_bright:MeshBasicMaterial,_white:MeshBasicMaterial){
    const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
    const material=(color:string,opacity=1)=>{const m=new MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:DoubleSide,toneMapped:false});m.userData.opacityScale=opacity;m.forceSinglePass=true;materials.push(m);return m;};
    const steel=material('#ffffff'),dust=material('#d3bea0',.9),wood=material('#bd9568'),metal=material('#e6eef1'),edge=material('#18202b',.85);
    const add=(g:BufferGeometry,m:MeshBasicMaterial,parent=root)=>{const mesh=new Mesh(g,m);parent.add(mesh);parts.push(mesh);return mesh;};
    const impactFace=new Group();root.add(impactFace);
    const slashEdge=add(ribbon,edge,impactFace);slashEdge.position.z=-.015;
    const slash=add(ribbon,steel,impactFace);slash.name='weapon-slash-arc';
    const flash=add(orb,steel,impactFace);flash.name='weapon-contact';
    const shock=add(ring,dust,impactFace);
    const chips=Array.from({length:8},(_,i)=>{const m=add(chip,i%2?metal:dust,impactFace);m.userData.index=i;return m;});
    const projectile=new Group();projectile.name='weapon-projectile';root.add(projectile);
    projectile.scale.setScalar(1.65);
    if(style.kind==='weapon-stone'){add(orb,dust,projectile);}else{
      const stem=add(shaft,wood,projectile);stem.position.y=-.23;
      const tip=add(head,metal,projectile);tip.position.y=.12;
      if(style.kind==='weapon-thrown'){stem.scale.y=.55;tip.scale.set(1.8,2,1);}
      else for(const angle of [0,Math.PI/2]){const f=add(feather,dust,projectile);f.position.y=-.46;f.rotation.y=angle;}
    }
    const destination=new Vector3(0,.7,0),start=new Vector3(),direction=new Vector3(),eye=new Vector3();
    root.userData.faceCamera=(camera:Camera)=>{
      camera.getWorldPosition(eye);eye.sub(root.getWorldPosition(new Vector3())).normalize();
      // Contact belongs to the visible surface, never inside the opaque body.
      // Depth testing still lets a foreground figure cover the attack.
      const height=root.userData.bodyHeight??1.5;
      impactFace.position.copy(destination).addScaledVector(eye,height*.62);
      impactFace.quaternion.copy(camera.quaternion);root.updateMatrixWorld(true);
    };
    return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,source?:Vector3){
      destination.y=(root.userData.bodyHeight??1.5)*.58;
      const ranged=['weapon-arrow','weapon-bolt','weapon-stone','weapon-thrown'].includes(style.kind);
      const flight=ranged&&source?WEAPON_FLIGHT_MS/style.duration:0;
      const hit=Math.max(0,(t-flight)/(1-flight)),active=t>=flight;
      start.copy(source??new Vector3(-.7,.8,0));direction.copy(destination).sub(start);
      slash.visible=active&&(style.kind==='weapon-slash'||style.kind==='weapon-thrust')&&hit<.7;
      slashEdge.visible=slash.visible;
      if(slash.visible){slash.position.set(0,0,0);slash.rotation.set(0,0,style.kind==='weapon-thrust'?-.7:-1.2+hit*3.4);slash.scale.setScalar(style.kind==='weapon-thrust'?.75:1);slashEdge.rotation.copy(slash.rotation);slashEdge.scale.copy(slash.scale).multiplyScalar(1.08);}
      projectile.visible=flight>0&&t<flight;
      if(projectile.visible){
        const q=Math.min(1,t/flight);projectile.position.copy(start).lerp(destination,q);projectile.position.y+=Math.sin(q*Math.PI)*.16;
        projectile.quaternion.setFromUnitVectors(up,direction.normalize());
        if(style.kind==='weapon-thrown')projectile.rotateY(q*8);
      }
      flash.visible=active&&hit<.3;flash.position.set(0,0,0);flash.scale.setScalar(.4+Math.sin(Math.min(1,hit/.3)*Math.PI)*2.8);
      shock.visible=active&&(style.kind==='weapon-blunt'||style.kind==='weapon-stone')&&hit<.75;shock.scale.setScalar(.5+hit*2.8);
      chips.forEach((m,i)=>{m.visible=active&&hit<.8;m.position.set(Math.cos(i*2.399)*hit*.95,Math.sin(i*2.399)*hit*.95-hit*.25,Math.sin(hit*Math.PI)*(.18+i%3*.05));m.rotation.set(hit*i,0,hit*3);m.scale.setScalar(reduced?.85:1.25);});
      for(const m of materials)m.opacity=m.userData.opacityScale*(active?Math.max(0,1-hit*1.1):1);
    }};
  }
  return {build,dispose(){geometries.forEach(g=>g.dispose());}};
}
