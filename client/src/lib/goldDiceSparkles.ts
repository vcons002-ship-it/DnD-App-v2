import * as THREE from 'three';

let sparkleSequence=0;

/** Separate glints in the air around opaque gold dice. One instanced draw,
 * no enclosing shell, lights or bloom pass; numbers stay unobscured. */
export function createGoldDiceSparkles(root:THREE.Group,vertices:THREE.Vector3[],style:number){
 const count=36,radius=Math.max(...vertices.map(v=>v.length()));
 const positions:number[]=[],phases:number[]=[];
 const offset=sparkleSequence++*2.399963;
 for(let i=0;i<count;i++){
  const z=1-2*(i+.5)/count,a=i*2.399963+offset,r=Math.sqrt(1-z*z);
  positions.push(Math.cos(a)*r,Math.sin(a)*r,z);
  phases.push((i*.61803398875+offset*.13)%1);
 }
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
 geometry.setIndex([0,1,2,0,2,3]);
 geometry.setAttribute('orbit',new THREE.InstancedBufferAttribute(new Float32Array(positions),3));
 geometry.setAttribute('phase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));
 geometry.instanceCount=0;
 const uniforms={strength:{value:0},clock:{value:0},radius:{value:radius},style:{value:style},still:{value:false}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 orbit;attribute float phase;
   uniform float strength;uniform float clock;uniform float radius;uniform bool still;
   varying vec2 point;varying float flash;
   void main(){
    float beat=sin((clock*(.75+phase*.6+strength*.8)+phase*6.283)*3.14159);
    flash=still?.65:pow(max(0.,beat),4.);
    vec3 center=orbit*radius*(1.24+phase*.28);
    if(!still)center+=vec3(sin(clock*.4+phase*12.),cos(clock*.3+phase*8.),sin(clock*.5+phase*7.))*radius*.055;
    vec4 view=modelViewMatrix*vec4(center,1.);
    float size=radius*(.06+.14*flash)*(.65+strength*.65)*length(modelViewMatrix[0].xyz);
    view.xy+=position.xy*size;point=position.xy;
    gl_Position=projectionMatrix*view;
   }`,
  fragmentShader:`uniform float strength;uniform int style;varying vec2 point;varying float flash;
   void main(){
    float r=dot(point,point);
    float core=exp(-r*38.);
    float rays=exp(-abs(point.x)*32.-abs(point.y)*3.)+exp(-abs(point.y)*32.-abs(point.x)*3.);
    float light=(core+rays*.6+exp(-r*7.)*.12)*flash;
    if(light<.008)discard;
    vec3 accent=style==1?vec3(1.,.35,.045):style==2?vec3(.45,1.,.22):style==3?vec3(1.,.12,.22):vec3(1.,.18,.25);
    vec3 color=mix(accent,vec3(1.,.9,.6),core);
    gl_FragColor=vec4(color*2.,light*(.5+strength*.5));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 mesh.userData.dicePowerArt=true;mesh.name='gold-critical-sparkles';root.add(mesh);
 return {
  strength(){return uniforms.strength.value;},
  count(){return geometry.instanceCount;},
  update(now:number,known:boolean,power:number,maximum:boolean,reduced:boolean,broken:boolean){
   const level=THREE.MathUtils.smoothstep(power,.3,1);
   uniforms.clock.value=now/1000;uniforms.still.value=reduced;
   uniforms.strength.value=known&&!broken?level*(maximum?1:.65):0;
   geometry.instanceCount=Math.round(count*uniforms.strength.value);
   mesh.visible=geometry.instanceCount>0;
  },
  dispose(){root.remove(mesh);geometry.dispose();material.dispose();},
 };
}
