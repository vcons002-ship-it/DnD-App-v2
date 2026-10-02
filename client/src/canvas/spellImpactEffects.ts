import {AdditiveBlending,CanvasTexture,CatmullRomCurve3,Color,ConeGeometry,CurvePath,CylinderGeometry,DoubleSide,Group,LineCurve3,Mesh,MeshBasicMaterial,PlaneGeometry,Scene,SphereGeometry,TubeGeometry,Vector3} from 'three';
import {spellImpactStyle,spellLightEnvelope,spellEmissionEnvelope,type SpellImpactStyle} from '../../../shared/spellImpact';
import type {HpFxEvent} from '../../../shared/types';
import type {TorchLight} from './miniatureTorchLighting';
import {createLinkedSpellGeometry} from './linkedSpellGeometry';

export type SpellImpact={id:number|string;tokenId:string;x:number;y:number;diameter:number;event:HpFxEvent;persistent?:boolean};
type Effect={input:SpellImpact;style:SpellImpactStyle;color:Vector3;start:number;root:Group;materials:MeshBasicMaterial[];arrows:Group[];vines:Mesh[];sparks:Mesh[];bolt?:Mesh;halo:Mesh;shape:ReturnType<ReturnType<typeof createLinkedSpellGeometry>['build']>};

/** Bounded, short-lived world-space geometry. No model downloads or new lights
 * in Three's shader signature: illumination uses the existing local light field. */
export function createSpellImpactEffects(scene:Scene){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#ffffffff');gradient.addColorStop(.22,'#ffffff88');gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const glow=new CanvasTexture(canvas),plane=new PlaneGeometry(1,1),shaft=new CylinderGeometry(.012,.018,.75,5),tip=new ConeGeometry(.075,.22,5),spark=new SphereGeometry(.045,5,4);
  const shapes=createLinkedSpellGeometry();
  const effects=new Map<number|string,Effect>(),seen=new Set<number|string>(),worldPoint=new Vector3();
  const dispose=(effect:Effect)=>{scene.remove(effect.root);effect.materials.forEach(m=>m.dispose());effect.vines.forEach(v=>v.geometry.dispose());effect.bolt?.geometry.dispose();};
  function add(input:SpellImpact,now:number){
    const style=spellImpactStyle(input.event);if(!style)return;
    const root=new Group();root.name=`spell-impact-${style.kind}`;
    const body=new MeshBasicMaterial({color:style.color,transparent:true,depthWrite:false,toneMapped:false});
    const bright=body.clone();bright.blending=AdditiveBlending;
    const haloMaterial=new MeshBasicMaterial({color:style.color,map:glow,transparent:true,blending:AdditiveBlending,side:DoubleSide,depthWrite:false,toneMapped:false});
    const halo=new Mesh(plane,haloMaterial);halo.rotation.x=-Math.PI/2;halo.position.y=.08;root.add(halo);
    const shape=shapes.build(style,body,bright);root.add(shape.root);
    const arrows:Group[]=[],vines:Mesh[]=[],sparks:Mesh[]=[];
    const arrowCount=input.event.areaWidthFt?32:style.projectiles??14;
    if(style.kind==='arrows')for(let i=0;i<arrowCount;i++){
      const arrow=new Group(),stem=new Mesh(shaft,bright),head=new Mesh(tip,body);
      stem.position.y=.38;head.rotation.z=Math.PI;arrow.add(stem,head);
      // Two fletchings and a long luminous shaft make these read as arrows.
      for(const sign of [-1,1]){const feather=new Mesh(tip,body);feather.scale.set(.6,.55,.2);feather.position.set(sign*.035,.69,0);feather.rotation.z=sign*.42;arrow.add(feather);}
      const angle=i*2.399963,r=arrowCount===1?0:.12+Math.sqrt((i+.5)/arrowCount)*.68;
      arrow.userData={x:Math.cos(angle)*r,z:Math.sin(angle)*r,
        areaX:((i*.61803398875)%1)-.5,areaZ:((i*.41421356237+.23)%1)-.5,delay:(i%5)*.058};
      arrow.rotation.z=-.12;root.add(arrow);arrows.push(arrow);
    }
    if(style.kind==='vines')for(let i=0;i<5;i++){
      const points=Array.from({length:40},(_,j)=>{const t=j/39,a=i*Math.PI*2/5+t*Math.PI*2.1;
        const r=.31+.09*Math.sin(t*5+i);return new Vector3(Math.cos(a)*r,t*1.2,Math.sin(a)*r);});
      const curve=new CatmullRomCurve3(points),vine=new Mesh(new TubeGeometry(curve,60,.018,5,false),bright);
      vine.userData={delay:i*.05,curve,growth:0};root.add(vine);vines.push(vine);
      for(let j=8;j<40;j+=10){const leaf=new Mesh(tip,bright);leaf.position.copy(points[j]);leaf.scale.set(.75,.6,.2);leaf.rotation.z=i+j*.6;vine.add(leaf);}
    }
    let bolt:Mesh|undefined;
    if((style.kind==='burst'||style.kind==='storm')&&(input.event.damageType==='lightning'||/witch bolt|shocking grasp|call lightning/i.test(input.event.spell??''))){
      const path=new CurvePath<Vector3>();
      const points=[new Vector3(.1,2.1,0),new Vector3(-.17,1.72,.06),new Vector3(.19,1.4,0),new Vector3(-.09,.94,-.04),new Vector3(.14,.65,0),new Vector3(0,.12,0)];
      for(let i=1;i<points.length;i++)path.add(new LineCurve3(points[i-1],points[i]));
      bolt=new Mesh(new TubeGeometry(path,30,.023,5,false),bright);bolt.userData.path=path;root.add(bolt);
    }
    // Drifting points help carry the impact and the mark without emoji glyphs.
    for(let i=0;i<(style.kind==='burst'?10:7);i++){
      const point=new Mesh(spark,bright);point.userData={angle:i*2.399963,seed:(i%4)/4};root.add(point);sparks.push(point);
    }
    const color=new Color(style.color);
    scene.add(root);effects.set(input.id,{input,style,color:new Vector3(color.r,color.g,color.b),start:now,root,materials:[body,bright,haloMaterial],arrows,vines,sparks,bolt,halo,shape});
  }
  return {
    sync(inputs:readonly SpellImpact[],now:number){
      const ids=new Set(inputs.map(e=>e.id));for(const id of seen)if(!ids.has(id))seen.delete(id);
      for(const [id,e] of effects)if(!ids.has(id)){dispose(e);effects.delete(id);}
      for(const input of inputs){const e=effects.get(input.id);if(e)e.input=input;
        else if(!seen.has(input.id)){seen.add(input.id);if(input.persistent||[...effects.values()].filter(e=>!e.input.persistent).length<16)add(input,now);}}
    },
    tick(now:number,pixelsPerFoot:number,reduced:boolean,position:(id:string)=>{x:number;y:number;visible:boolean;height?:number}|undefined){
      const lights:TorchLight[]=[];
      for(const [id,e] of effects){
        const age=now-e.start;if(!e.input.persistent&&age>=e.style.duration){dispose(e);effects.delete(id);continue;}
        const p=position(e.input.tokenId);e.root.visible=!!p?.visible;if(!p?.visible)continue;
        const size=Math.max(pixelsPerFoot*2,e.input.diameter),height=Math.max(size*.85,p.height??size*1.5);
        e.root.position.set(p.x,0,p.y);e.root.scale.set(size,height/1.2,size);
        const t=e.input.persistent?age/1000:age/e.style.duration;
        const persistentGlow=reduced?.55:.58+.08*Math.sin(age/900);
        const fade=e.input.persistent?persistentGlow:spellLightEnvelope(age,e.style.duration),emission=e.input.persistent?persistentGlow:spellEmissionEnvelope(age,e.style);
        e.materials[0].opacity=fade*(reduced?.5:.85);e.materials[1].opacity=emission*(reduced?.4:1);
        e.materials[2].opacity=e.style.kind==='mark'?emission*.4:0;
        e.halo.scale.setScalar(e.style.kind==='mark'?1.6:2.4);e.halo.rotation.z=reduced?0:t*.7;
        const areaScale=e.input.event.areaWidthFt?e.input.event.areaWidthFt*pixelsPerFoot/size:0;
        e.shape.update(t,!!e.input.persistent,reduced,areaScale);
        for(const arrow of e.arrows){const progress=Math.max(0,Math.min(1,(t-arrow.userData.delay)/.48));
          const x=areaScale?arrow.userData.areaX*areaScale:arrow.userData.x,z=areaScale?arrow.userData.areaZ*areaScale:arrow.userData.z;
          arrow.visible=t>=arrow.userData.delay;arrow.position.set(x+(1-progress)*.4,reduced?.15:2.4*(1-progress)+.12,z);}
        for(const vine of e.vines){const growth=reduced||e.input.persistent?1:Math.max(.001,Math.min(1,(t-vine.userData.delay)/.40));
          vine.userData.growth=growth;vine.geometry.setDrawRange(0,Math.floor((vine.geometry.index!.count*growth)/3)*3);
          vine.children.forEach((leaf,j)=>{leaf.visible=growth>=(8+j*10)/39;});}
        e.sparks.forEach((point,i)=>{const a=point.userData.angle+(reduced?0:t*.5),progress=e.input.persistent?(t*.2+point.userData.seed)%1:t,r=e.style.kind==='mark'?.55:.4+progress*.4;
          point.position.set(Math.cos(a)*r,.15+(reduced?.25:progress)*(.4+point.userData.seed),Math.sin(a)*r);point.scale.setScalar(i%3===0?1.3:.7);});
        // Sample luminous geometry after applying this frame's exact transforms.
        // Three samples approximate an extended emitter without new shadow maps.
        // No source is placed at the target center, and hidden geometry emits none.
        e.root.updateMatrixWorld(true);
        const samples:{object:Group|Mesh;local:Vector3;weight:number}[]=[];
        if(e.arrows.length){
          const indices=e.arrows.length===1?[0]:[0,Math.floor(e.arrows.length/2),e.arrows.length-1];
          for(const i of indices){const arrow=e.arrows[i];if(arrow?.visible)samples.push({object:arrow,local:new Vector3(0,.2,0),weight:1/indices.length});}
        }else if(e.vines.length){
          for(const i of [0,2,4]){const vine=e.vines[i],growth=vine.userData.growth;
            if(growth>.02)samples.push({object:vine,local:vine.userData.curve.getPoint(growth*.85),weight:1/3});}
        }else if(e.shape.parts.length){
          for(const i of [0,Math.floor(e.shape.parts.length/2),e.shape.parts.length-1]){
            const part=e.shape.parts[i];if(part.visible)samples.push({object:part,local:part.userData.emitterPoint??new Vector3(),weight:1/3});
          }
        }else if(e.bolt){
          for(const u of [.18,.5,.86])samples.push({object:e.bolt,local:e.bolt.userData.path.getPoint(u),weight:1/3});
        }else for(const i of [0,3,6])samples.push({object:e.sparks[i],local:new Vector3(),weight:1/3});
        if(emission>.002&&!reduced)for(let i=0;i<samples.length&&lights.length<24;i++){
          const sample=samples[i];worldPoint.copy(sample.local).applyMatrix4(sample.object.matrixWorld);
          lights.push({id:`spell-${id}-${i}`,x:worldPoint.x,y:worldPoint.z,height:Math.max(0,worldPoint.y),radius:e.style.radiusFt*pixelsPerFoot,
            strength:e.style.strength*emission*sample.weight*(e.input.persistent?.45:2),color:e.color,visibleTorch:false,transient:true});
        }
      }
      return lights;
    },
    get active(){return effects.size>0;},
    get kinds(){return [...effects.values()].filter(e=>e.root.visible).map(e=>e.style.kind);},
    dispose(){effects.forEach(dispose);effects.clear();seen.clear();shapes.dispose();[plane,shaft,tip,spark].forEach(g=>g.dispose());glow.dispose();},
  };
}
