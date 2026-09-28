import {lightFalloffGlsl,LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {Box3, Mesh, MeshStandardMaterial, Vector3, Vector4, type Camera, type Group, type Material, type Object3D} from 'three';
import type {MiniatureDefinition} from '../lib/miniatures';

export type TorchLight = {id:string;x:number;y:number;height:number;radius:number;strength:number;color:Vector3;visibleTorch:boolean;fixture?:'torch'|'lantern';carried?:boolean;facing?:number};

/** Each figure gets its strongest nearby sources, independent of the map's light count. */
export function createMiniatureTorchLighting(){
  const uniforms={darkvisionDetail:{value:0},torchCount:{value:0},torchPositions:{value:Array.from({length:8},()=>new Vector4())},torchColors:{value:Array.from({length:8},()=>new Vector3())}};
  const point=new Vector3();
  return {attach(material:Material){
    if(!(material instanceof MeshStandardMaterial))return;
    const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.fragmentShader=lightFalloffGlsl+'uniform float darkvisionDetail; uniform int torchCount; uniform vec4 torchPositions[8]; uniform vec3 torchColors[8];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`#include <lights_fragment_begin>
        float darkvisionLight=0.;
        #if defined(RE_Direct)
        for(int torchIndex=0;torchIndex<8;torchIndex++){
          if(torchIndex>=torchCount)break;
          vec3 torchDelta=torchPositions[torchIndex].xyz-geometryPosition;
          float torchDistance=length(torchDelta);
          directLight.direction=torchDelta/max(.001,torchDistance);
          directLight.color=torchColors[torchIndex]*lightIrradiance(torchDistance,torchPositions[torchIndex].w,1.);
          darkvisionLight+=max(directLight.color.r,max(directLight.color.g,directLight.color.b));
          directLight.visible=true;
          // A little local reflected light keeps surfaces facing away from a hip
          // lantern readable. This vanishes with the source; it is not ambient lift.
          reflectedLight.indirectDiffuse+=material.diffuseColor*directLight.color*.16;
          RE_Direct(directLight,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
        }
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        float sourceLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        float contour=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.);
        float detail=smoothstep(.2,.8,sourceLuma)*.020+contour*.018;
        outgoingLight+=vec3(detail*darkvisionDetail*(1.-lightColorCoverage(darkvisionLight)));
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>cache+'-nearby-torches-v5';
  },update(lights:readonly TorchLight[],root:Group,camera:Camera,darkvision=false){
    uniforms.darkvisionDetail.value=darkvision?1:0;
    const chosen:{light:TorchLight;score:number}[]=[];
    for(const light of lights){
      const d2=(light.x-root.position.x)**2+(light.y-root.position.z)**2;
      if(d2>(light.radius*LIGHT_SPILL_MULTIPLIER)**2)continue;
      const score=light.strength*light.radius**2/Math.max(1,d2+light.height**2*.25);
      let i=0;while(i<chosen.length&&chosen[i].score>=score)i++;
      if(i<8){chosen.splice(i,0,{light,score});if(chosen.length>8)chosen.pop();}
    }
    uniforms.torchCount.value=chosen.length;
    chosen.forEach(({light},i)=>{
      point.set(light.x,light.height,light.y).applyMatrix4(camera.matrixWorldInverse);
      uniforms.torchPositions.value[i].set(point.x,point.y,point.z,light.radius);
      uniforms.torchColors.value[i].copy(light.color).multiplyScalar(light.strength);
    });
  }};
}

/** Sample the side of the belt, before adding outline shells or accessories. */
export function measureLanternAnchor(model:Group,definition:MiniatureDefinition){
  model.updateMatrixWorld(true);
  let body:Object3D|undefined;
  model.traverse(node=>{if(!body && /body/i.test(node.name))body=node;});
  const d=definition.baseDiameter,base=new Vector3().fromArray(definition.baseCenter);
  if(!body)return new Vector3(-d*.28,d*.75,d*.10);
  const bounds=new Box3().setFromObject(body),height=bounds.max.y-bounds.min.y;
  const waist=bounds.min.y+height*.52,point=new Vector3(),samples:Vector3[]=[];
  body.traverse(node=>{
    if(!(node instanceof Mesh))return;
    const positions=node.geometry.getAttribute('position'),index=node.geometry.index;
    if(!positions)return;
    const start=node.geometry.drawRange.start,end=Math.min(index?.count??positions.count,start+node.geometry.drawRange.count);
    const stride=Math.max(1,Math.ceil((end-start)/20000));
    for(let i=start;i<end;i+=stride){
      point.fromBufferAttribute(positions,index?index.getX(i):i).applyMatrix4(node.matrixWorld);
      if(Math.abs(point.y-waist)<d*.045 && Math.abs(point.x-base.x)<d*.4)samples.push(point.clone());
    }
  });
  const xs=samples.map(p=>p.x).sort((a,b)=>a-b);
  const x=xs.length?xs[Math.floor((xs.length-1)*.05)]:base.x-d*.28;
  const side=samples.filter(p=>p.x<=x+d*.065).map(p=>p.z).sort((a,b)=>a-b);
  // A slightly forward-facing hip position stays clear of the belt's center.
  return new Vector3(x,waist,side.length?side[Math.floor((side.length-1)*.68)]:base.z+d*.10).sub(base);
}
