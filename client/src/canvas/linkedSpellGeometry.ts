import {BoxGeometry,ConeGeometry,CurvePath,LineCurve3,TubeGeometry,Group,Mesh,MeshBasicMaterial,SphereGeometry,TorusGeometry,Vector3,type BufferGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {SpellImpactStyle} from '../../../shared/spellImpact';

/** Same jagged strike used for ordinary lightning damage, not falling shards. */
export function lightningStrikePath(){
  const path=new CurvePath<Vector3>();
  const points=[new Vector3(.1,2.1,0),new Vector3(-.17,1.72,.06),new Vector3(.19,1.4,0),new Vector3(-.09,.94,-.04),new Vector3(.14,.65,0),new Vector3(0,.12,0)];
  for(let i=1;i<points.length;i++)path.add(new LineCurve3(points[i-1],points[i]));
  return path;
}

/** Reuses the impact renderer's luminous materials. Geometry is shared by every
 * instance; the spell only chooses its shape and motion, never a new art style. */
export function createLinkedSpellGeometry(){
  const link=new TorusGeometry(.047,.009,4,9),crystal=new ConeGeometry(.09,.4,5),
    drop=new SphereGeometry(.075,7,5),blade=new BoxGeometry(.075,.85,.025),guard=new BoxGeometry(.36,.055,.045);
  const geometries:BufferGeometry[]=[link,crystal,drop,blade,guard];
  const bolt=new TubeGeometry(lightningStrikePath(),30,.023,5,false),core=new TubeGeometry(lightningStrikePath(),30,.008,5,false);
  geometries.push(bolt,core);
  const dagger=new ConeGeometry(.065,.48,4),auraArc=new TorusGeometry(.44,.012,5,36,Math.PI*1.45);
  geometries.push(dagger,auraArc);
  const shell=new SphereGeometry(.55,18,12,0,Math.PI*2,0,Math.PI/2),ring=new TorusGeometry(.48,.014,5,40),wisp=new TorusGeometry(.38,.025,5,26,Math.PI*1.25);
  geometries.push(shell,ring,wisp);
  const chainLinks:BufferGeometry[]=[],placement=new Mesh(link);
  const place=()=>{placement.updateMatrix();chainLinks.push(link.clone().applyMatrix4(placement.matrix));};
  for(let row=0;row<3;row++)for(let i=0;i<12;i++){
    const a=i*Math.PI/6;placement.position.set(Math.cos(a)*.39,.32+row*.32,Math.sin(a)*.39);
    placement.rotation.set(Math.PI/2,a,i%2?Math.PI/2:0);place();
  }
  for(let side=0;side<2;side++)for(let i=0;i<7;i++){
    placement.position.set(side?.39:-.39,.3+i*.1,0);placement.rotation.set(0,i%2?Math.PI/2:0,0);place();
  }
  const chains=mergeGeometries(chainLinks)!;chainLinks.forEach(g=>g.dispose());geometries.push(chains);
  function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white=bright){
    const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
    const add=(geometry:BufferGeometry,material=bright)=>{const m=new Mesh(geometry,material);root.add(m);parts.push(m);return m;};
    if(style.kind==='shield'){
      const surface=body.clone();materials.push(surface);surface.opacity=.12;surface.userData.opacityScale=.15;
      const dome=add(shell,surface);dome.position.y=.46;dome.scale.y=1.5;
      for(let i=0;i<3;i++){const m=add(auraArc);m.userData.index=i;}
    }else if(style.kind==='mist'||style.kind==='veil'){
      for(let i=0;i<8;i++){const m=add(wisp,i%2?body:bright);m.userData={index:i,seed:i/8};}
    }else if(style.kind==='pattern'){
      for(let i=0;i<5;i++){
        const rainbow=bright.clone();rainbow.color.setHSL(i/5,.85,.66);materials.push(rainbow);
        const m=add(ring,rainbow);m.userData.index=i;
      }
    }else if(style.kind==='command'){
      for(let i=0;i<3;i++){const m=add(ring);m.scale.setScalar(.42+i*.17);m.userData={index:i,crown:true};}
      for(let i=0;i<6;i++){const m=add(drop,body);m.scale.set(.17,.8,.17);m.userData={index:i};}
    }else if(style.kind==='bolts'){
      for(let i=0;i<14;i++){const m=add(bolt);m.add(new Mesh(core,white));m.userData={index:i,emitterPoint:new Vector3(0,1,0)};}
    }else if(style.kind==='chains'){
      // Three interlocking chains surround the body, with vertical chains joining
      // them. They stay close enough to read as restraint rather than a dome.
      const m=add(chains);m.userData.emitterPoint=new Vector3(.39,.65,0);
    }else if(style.kind==='weapon'){
      const sword=add(blade,body);sword.position.y=.76;
      const cross=add(guard);cross.position.y=.31;
      const grip=add(blade);grip.scale.y=.23;grip.position.y=.18;
    }else if(style.kind==='haunt'){
      // Sharp spectral daggers hover around the victim, points aimed inward.
      for(let i=0;i<7;i++){const m=add(dagger,i%2?body:bright);m.userData.index=i;}
    }else if(style.kind==='aura'){
      // An open, layered aura encircles the body without hiding the figure.
      for(let i=0;i<3;i++){const m=add(auraArc,i===1?body:bright);m.userData={band:true,index:i};}
      for(let i=0;i<10;i++){const m=add(drop);m.scale.set(.18,.5,.18);m.userData={seed:i/10,particle:true};}
    }else if(!['burst','arrows','vines','mark'].includes(style.kind)){
      const count=style.kind==='meteor'?4:style.kind==='flame'?12:18;
      for(let i=0;i<count;i++){
        const geometry=['shards','storm','flame','illusion'].includes(style.kind)?crystal:drop;
        const m=add(geometry,i%3?bright:body);
        m.userData={angle:i*2.399963,seed:((i*7)%19)/19,index:i};
        if(style.kind==='flame')m.scale.set(.6,1.8,.6);
        if(style.kind==='meteor')m.scale.setScalar(2.7);
        if(['poison','drain'].includes(style.kind))m.scale.set(1.3,2.6,1.3);
      }
    }
    return {root,parts,materials,update(t:number,persistent:boolean,reduced:boolean,areaScale:number){
      if(style.kind==='shield'){
        parts.slice(1).forEach((m,i)=>{m.position.y=.38+i*.28;m.rotation.set(Math.PI/2,i*.35,i*2.1+(reduced?0:t*.4));m.scale.setScalar(.95-i*.13);});return;
      }
      if(style.kind==='mist'||style.kind==='veil'){
        parts.forEach((m,i)=>{
          const phase=reduced?.4:persistent?(t*.18+m.userData.seed)%1:Math.min(1,t+m.userData.seed*.2);
          const a=i*2.399963+(reduced?0:t*(i%2?-.35:.35)),r=style.kind==='veil'?.28:.25+phase*.38;
          m.position.set(Math.cos(a)*r,style.kind==='veil'?.12+(i%3)*.08:.15+phase*.85,Math.sin(a)*r);
          m.rotation.set(Math.PI/2+.14*Math.sin(i),0,a);m.scale.set(1+phase*.3,.45+phase*.3,1);
        });return;
      }
      if(style.kind==='pattern'){
        parts.forEach((m,i)=>{m.position.y=.48+i*.1;m.rotation.set(.7+i*.55,(reduced?0:t*.35)+i*.8,i*.6);m.scale.setScalar(.65+i*.12);});return;
      }
      if(style.kind==='command'){
        parts.forEach((m,i)=>{
          if(m.userData.crown){m.position.y=1.32+i*.035;m.rotation.set(Math.PI/2,0,reduced?0:t*.2);return;}
          const phase=reduced?.5:(t*.45+(i-3)/6)%1,a=i*Math.PI/3;
          m.position.set(Math.cos(a)*.27,1.22-phase*.5,Math.sin(a)*.27);
        });return;
      }
      if(style.kind==='bolts'){
        parts.forEach((m,i)=>{const angle=i*2.399963,r=i===0?0:Math.sqrt(i/13)*.46*(areaScale||2);
          m.position.set(Math.cos(angle)*r,0,Math.sin(angle)*r);m.rotation.y=angle;
          m.scale.setScalar(.85+(i%3)*.09);
          m.visible=reduced||t>=(i%4)*.035&&((t+(i%3)*.08)% .26)<.20;
        });return;
      }
      if(style.kind==='chains'){root.rotation.y=reduced?0:Math.sin(t*.7)*.025;return;}
      if(style.kind==='weapon'){
        root.position.set(.45,0,0);root.rotation.z=reduced?-.15:persistent?-.15+Math.sin(t*1.5)*.08:-.85+Math.sin(Math.min(1,t*1.8)*Math.PI)*1.3;return;
      }
      if(style.kind==='haunt'){
        parts.forEach((m,i)=>{const a=i*Math.PI*2/7+(reduced?0:t*.22),r=.62+(reduced?0:Math.sin(t*1.4+i)*.07);
          m.position.set(Math.cos(a)*r,.4+(i%3)*.27,Math.sin(a)*r);
          m.quaternion.setFromUnitVectors(new Vector3(0,1,0),new Vector3(-Math.cos(a),.12*Math.sin(i),-Math.sin(a)).normalize());
        });return;
      }
      if(style.kind==='aura'){
        parts.forEach((m,i)=>{
          if(m.userData.band){m.position.y=.23+i*.27;m.rotation.set(Math.PI/2+(i-1)*.12,0,i*2.1+(reduced?0:t*(i%2?-.7:.6)));m.scale.setScalar(1+(reduced?0:Math.sin(t*1.6+i)*.035));return;}
          const phase=reduced?.5:(t*.3+m.userData.seed)%1,a=i*2.399963+(reduced?0:t*.55);
          m.position.set(Math.cos(a)*.44,.13+phase*.85,Math.sin(a)*.44);
        });return;
      }
      parts.forEach(m=>{
        const {angle=0,seed=0}=m.userData,phase=reduced?.4:persistent?(t*.24+seed)%1:Math.min(1,Math.max(0,(t-seed*.18)/.72));
        const a=angle+(reduced?0:t*(style.kind==='drain'?-1.4:.4));
        const r=style.kind==='flame'?.14+seed*.17:style.kind==='haunt'?.36+seed*.15:.28+phase*.45;
        let x=Math.cos(a)*r,z=Math.sin(a)*r,y=.15+phase*.95;
        if(['storm','meteor'].includes(style.kind)){
          x=(Math.cos(angle)*(.2+seed*.8))*(areaScale||1.6);z=(Math.sin(angle)*(.2+seed*.8))*(areaScale||1.6);
          y=reduced?.4:2.6*(1-phase)+.1;m.rotation.z=.2;
        }else if(style.kind==='acid'){y=.2+Math.sin(phase*Math.PI)*.9;m.scale.setScalar(.5+(1-phase)*.9);}
        else if(style.kind==='drain'){y=.2+seed*.8;x*=1-phase*.6;z*=1-phase*.6;}
        else if(style.kind==='illusion'){y=.18+seed*1.3;m.rotation.set(t*.7,angle,angle);}
        else if(style.kind==='shards'){y=.15+seed*.85;m.rotation.set(angle,0,phase*1.5);}
        else if(style.kind==='poison'||style.kind==='haunt'){y=.3+seed*.85;m.rotation.z=Math.sin(t+angle)*.45;}
        m.position.set(x,y,z);m.visible=persistent||reduced||t>=seed*.18;
      });
    }};
  }
  return {build,dispose(){geometries.forEach(g=>g.dispose());}};
}
