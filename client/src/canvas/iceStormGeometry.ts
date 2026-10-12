import {Group,IcosahedronGeometry,InstancedMesh,Mesh,MeshBasicMaterial,Object3D,PlaneGeometry,TetrahedronGeometry,Vector3} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact';

/** One storm field, independent of its victims. Instancing bounds draw calls;
 * hail and splinters use shared faceted geometry and no particle physics jobs. */
export function createIceStormGeometry(){
 const hailGeometry=new IcosahedronGeometry(1,0),chipGeometry=new TetrahedronGeometry(1,0),floorGeometry=new PlaneGeometry(1,1);
 const positions=hailGeometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),scale=.86+.16*Math.sin(x*9+y*7+z*5);
  positions.setXYZ(i,x*scale,y*scale*.82,z*scale*1.08);
 }
 hailGeometry.computeVertexNormals();
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,_bright:MeshBasicMaterial,_white:MeshBasicMaterial){
  const root=new Group(),pose=new Object3D(),clock={value:0},quality={value:1};
  const ice=body.clone();ice.color.set('#b9e8ff');ice.userData.opacityScale=.96;
  ice.customProgramCacheKey=()=> 'ice-storm-faceted-v1';
  ice.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 hailNormal;varying vec3 hailLocal;')
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     hailLocal=position;
     #ifdef USE_INSTANCING
      hailNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
     #else
      hailNormal=normalize(normalMatrix*normal);
     #endif
    `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 hailNormal;varying vec3 hailLocal;')
    .replace('#include <color_fragment>',`#include <color_fragment>
     vec3 n=normalize(hailNormal);
     float face=.28+.72*max(0.,dot(n,normalize(vec3(-.35,.65,.8))));
     float sheen=pow(max(0.,dot(n,normalize(vec3(.2,.5,1.)))),22.);
     float vein=pow(1.-abs(sin(hailLocal.x*12.+hailLocal.y*7.+hailLocal.z*9.)),12.);
     diffuseColor.rgb=mix(vec3(.12,.33,.52),vec3(.63,.9,1.),face)+vec3(.5,.65,.75)*sheen+vein*.12;
    `);
  };
  const floor=body.clone();floor.color.set('#94d8f5');floor.userData.opacityScale=.34;floor.forceSinglePass=true;
  floor.customProgramCacheKey=()=> 'ice-storm-frost-v1';
  floor.onBeforeCompile=shader=>{
   shader.uniforms.iceClock=clock;shader.uniforms.iceQuality=quality;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 frostPoint;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nfrostPoint=position.xy;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 frostPoint;uniform float iceClock;uniform float iceQuality;
    float frostHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float frostNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(frostHash(i),frostHash(i+vec2(1.,0.)),f.x),mix(frostHash(i+vec2(0.,1.)),frostHash(i+1.),f.x),f.y);}
   `).replace('#include <color_fragment>',`#include <color_fragment>
    float r=length(frostPoint);if(r>.5)discard;
    float wisps=frostNoise(frostPoint*13.+vec2(iceClock*.34,-iceClock*.52));
    float grain=iceQuality>.5?frostNoise(frostPoint*49.):.5;
    float wave=exp(-pow((r-mod(iceClock*.24,.6))/.045,2.))*.5;
    float frost=smoothstep(.22,.78,wisps*.72+grain*.28);
    diffuseColor.rgb=mix(vec3(.16,.43,.58),vec3(.77,.95,1.),frost+wave);
    diffuseColor.a*=(.12+frost*.68+wave)*(1.-smoothstep(.44,.5,r));
   `);
  };
  const hail=new InstancedMesh(hailGeometry,ice,96),splinters=new InstancedMesh(chipGeometry,ice,384),frost=new Mesh(floorGeometry,floor);
  hail.name='ice-storm-hail';splinters.name='ice-storm-splinters';frost.name='ice-storm-frost';
  hail.frustumCulled=splinters.frustumCulled=false;frost.rotation.x=-Math.PI/2;frost.position.y=.002;
  for(const mesh of [frost,hail,splinters])mesh.userData.emitterPoint=new Vector3();
  root.add(frost,hail,splinters);
  // Cover the complete disk using a stable, irregular distribution. Small
  // variations in release time/shape make this a hailstorm rather than a grid.
  const seeds=Array.from({length:96},(_,i)=>{
   const a=i*2.399963,r=Math.sqrt((i+.5)/96)*.445;
   return {x:Math.cos(a)*r,z:Math.sin(a)*r,phase:(i*.61803398875)%1,size:.008+(i%7)*.0016,spin:i*1.73};
  });
  const reducedSeeds=seeds.filter((_,i)=>i%3===0);
  return {root,parts:[frost,hail,splinters],materials:[ice,floor],update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number){
   const seconds=t*style.duration/1000;clock.value=seconds;quality.value=reduced?0:1;
   hail.count=reduced?32:96;splinters.count=hail.count*4;
   const field=reduced?reducedSeeds:seeds;
   for(let i=0;i<hail.count;i++){
    const s=field[i],phase=(seconds/.54+s.phase)%1,fall=Math.min(1,phase/.7),hit=Math.max(0,(phase-.7)/.3),height=.36*(1-fall*fall);
    const active=t<.76,scale=active&&phase<.7?s.size:0;
    pose.position.set(s.x-.018*(1-fall),height+.005,s.z+.025*(1-fall));
    pose.rotation.set(s.spin+seconds*2.8,s.spin*.4,s.spin+seconds*1.9);pose.scale.set(scale,scale*(1+(i%3)*.23),scale*.8);pose.updateMatrix();hail.setMatrixAt(i,pose.matrix);
    for(let j=0;j<4;j++){
     const a=s.spin+j*2.3,distance=hit*(.016+(j%3)*.009),chip=active&&phase>=.7?s.size*.45*(1-hit):0;
     pose.position.set(s.x+Math.cos(a)*distance,.002+Math.sin(hit*Math.PI)*.017,s.z+Math.sin(a)*distance);
     pose.rotation.set(s.spin+hit*3,a,hit*4);pose.scale.set(chip,chip*.45,chip*.8);pose.updateMatrix();splinters.setMatrixAt(i*4+j,pose.matrix);
    }
   }
   hail.instanceMatrix.needsUpdate=true;splinters.instanceMatrix.needsUpdate=true;
   // Three samples describe the field's glow, never one light per hailstone.
   frost.userData.emitterPoint.set(0,0,0);
   hail.userData.emitterPoint.set(.3,.16,0);splinters.userData.emitterPoint.set(-.24,.04,.22);
  }};
 }
 return {build,dispose(){hailGeometry.dispose();chipGeometry.dispose();floorGeometry.dispose();}};
}
