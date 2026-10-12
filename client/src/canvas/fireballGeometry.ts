import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,SphereGeometry,Vector3} from 'three';
import {FIREBALL_FLIGHT_MS,spellLightEnvelope,type SpellImpactStyle} from '../../../shared/spellImpact';

/** One connected, expanding fire front. The polar surface folds upward into
 * turbulent flame tongues; no independently expanding spheres or tiled art. */
export function createFireballGeometry(){
 const sphere=new SphereGeometry(1,24,16),wave=new BufferGeometry();
 const positions:number[]=[],uvs:number[]=[],indices:number[]=[],segments=128,rows=24;
 for(let row=0;row<=rows;row++)for(let i=0;i<=segments;i++){
  const a=i/segments*Math.PI*2,v=row/rows,r=.62+.38*v;
  positions.push(Math.cos(a)*r,0,Math.sin(a)*r);uvs.push(i/segments,v);
 }
 for(let row=0;row<rows;row++)for(let i=0;i<segments;i++){
  const a=row*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 wave.setAttribute('position',new Float32BufferAttribute(positions,3));
 wave.setAttribute('uv',new Float32BufferAttribute(uvs,2));wave.setIndex(indices);
 wave.computeVertexNormals();
 const noise=`
 float fh(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float fn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(fh(i),fh(i+vec3(1,0,0)),f.x),mix(fh(i+vec3(0,1,0)),fh(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(fh(i+vec3(0,0,1)),fh(i+vec3(1,0,1)),f.x),mix(fh(i+vec3(0,1,1)),fh(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fb(vec3 p){return fn(p)*.57+fn(p*2.03+7.1)*.28+fn(p*4.11+13.7)*.15;}
 `;
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
  const hot=white.clone();hot.color.set('#fff3b1');materials.push(hot);
  const flame=body.clone();flame.color.set('#f46b16');flame.userData.opacityScale=.6;materials.push(flame);
  const surface=body.clone();surface.side=DoubleSide;surface.color.set('#ff702c');surface.userData.opacityScale=1;materials.push(surface);
  const clock={value:0},growth={value:0};
  surface.customProgramCacheKey=()=> 'fireball-continuous-wave-v1';
  surface.onBeforeCompile=shader=>{
   shader.uniforms.fireClock=clock;shader.uniforms.fireGrowth=growth;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    varying vec3 fireLocal;varying vec2 fireUv;uniform float fireClock;uniform float fireGrowth;${noise}`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
    fireUv=uv;
    // Sample around a closed circle so the seam has identical displacement.
    vec3 radial=vec3(position.x,0.,position.z)/length(position.xz);
    float n=fb(radial*5.+vec3(0.,-fireClock*2.2,0.));
    transformed.xz*=1.-.035*(1.-n)*pow(uv.y,4.);
    float crest=pow(sin(uv.y*3.14159265),1.2);
    transformed.y=.008+crest*(.075+.22*n)*(.75+.25*fireGrowth);
    fireLocal=transformed;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 fireLocal;varying vec2 fireUv;uniform float fireClock;${noise}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
    vec3 p=vec3(fireLocal.x*11.,fireUv.y*3.-fireClock*3.4,fireLocal.z*11.);
    float n=fb(p+fb(p*.55)*1.1);
    float fine=fn(p*5.2+vec3(0.,-fireClock*2.,0.));
    // White-hot folds cool to orange and red behind the single advancing edge.
    float heat=smoothstep(.22,.83,n)*(.62+.38*fireUv.y);
    vec3 ember=vec3(.32,.012,.002),red=vec3(.95,.055,.004),orange=vec3(1.,.36,.015),yellow=vec3(1.,.85,.26);
    diffuseColor.rgb=mix(ember,red,smoothstep(.05,.28,heat));
    diffuseColor.rgb=mix(diffuseColor.rgb,orange,smoothstep(.23,.55,heat));
    diffuseColor.rgb=mix(diffuseColor.rgb,yellow,smoothstep(.52,.8,heat));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.97,.72),smoothstep(.79,.98,heat));
    float edge=smoothstep(0.,.12,fireUv.y)*(1.-smoothstep(.90,1.,fireUv.y));
    diffuseColor.a*=edge*smoothstep(.15,.52,n)*(.78+.22*fine);
   `);
  };
  const add=(material:MeshBasicMaterial)=>{const mesh=new Mesh(sphere,material);root.add(mesh);parts.push(mesh);return mesh;};
  const orb=add(flame),core=add(hot),shell=add(bright),trail=Array.from({length:12},()=>add(bright));
  const front=new Mesh(wave,surface);front.name='fireball-continuous-front';front.frustumCulled=false;root.add(front);parts.push(front);
  front.userData.emitterPoints=Array.from({length:3},(_,i)=>new Vector3(Math.cos(i*Math.PI*2/3)*.85,.14,Math.sin(i*Math.PI*2/3)*.85));
  const origin=new Vector3(),at=new Vector3(),target=new Vector3(0,.025,0),arc=new Vector3();
  const path=(u:number)=>at.lerpVectors(origin,target,u).add(arc.set(0,Math.sin(u*Math.PI)*.045,0));
  return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,source?:Vector3){
   const age=t*style.duration,flight=age<FIREBALL_FLIGHT_MS;
   clock.value=reduced?0:age/1000;origin.copy(source??target);
   const u=Math.min(1,age/FIREBALL_FLIGHT_MS),q=Math.max(0,(age-FIREBALL_FLIGHT_MS)/(style.duration-FIREBALL_FLIGHT_MS));
   const crest=spellLightEnvelope(age-FIREBALL_FLIGHT_MS,style.duration-FIREBALL_FLIGHT_MS);
   for(const mesh of [orb,core,shell]){mesh.visible=flight;mesh.position.copy(path(u));}
   orb.scale.setScalar(.026*(1+.08*Math.sin(age*.05)));core.scale.setScalar(.015);shell.scale.setScalar(.039);
   trail.forEach((m,i)=>{const v=u-(i+1)*.018;m.visible=flight&&v>=0;m.position.copy(path(Math.max(0,v)));m.scale.setScalar(.018*(1-i/13));});
   // One outward sweep reaches the actual selected radius, then cools in place.
   growth.value=1-Math.pow(1-Math.min(1,q/.42),2);
   front.visible=!flight;front.scale.setScalar(.5*Math.max(.015,growth.value));front.position.y=.016;
   flame.opacity=flight?.8:0;hot.opacity=flight?1:0;surface.opacity=crest*.95;
  }};
 }
 return {build,dispose(){sphere.dispose();wave.dispose();}};
}
