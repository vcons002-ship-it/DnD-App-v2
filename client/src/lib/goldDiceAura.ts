import * as THREE from 'three';

/** Opaque critical dice carry their charge outside the metal. One small halo,
 * no lights or bloom pass; the face centers stay clear for dark numerals. */
export function createGoldDiceAura(root:THREE.Group,vertices:THREE.Vector3[],style:number){
 const radius=Math.max(...vertices.map(v=>v.length()));
 const geometry=new THREE.SphereGeometry(radius*1.12,24,16);
 const uniforms={strength:{value:0},clock:{value:0},style:{value:style}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,side:THREE.BackSide,
  vertexShader:`varying vec3 point;varying vec3 facing;varying vec3 eye;
   void main(){point=position;vec4 v=modelViewMatrix*vec4(position,1.);
    facing=normalize(normalMatrix*normal);eye=normalize(-v.xyz);gl_Position=projectionMatrix*v;}`,
  fragmentShader:`uniform float strength;uniform float clock;uniform int style;
   varying vec3 point;varying vec3 facing;varying vec3 eye;
   void main(){
    float viewDot=abs(dot(normalize(facing),normalize(eye)));
    // Fade before the sphere silhouette: light in air, not a hard bubble rim.
    float rim=pow(1.-viewDot,1.5)*smoothstep(0.,.24,viewDot);
    float drift=.55+.25*sin(point.x*5.+point.y*3.-point.z*4.+clock*1.7)
                     +.2*sin(point.z*7.-point.y*6.+clock*.8);
    vec3 color=style==1?vec3(1.,.19,.008):style==2?vec3(.34,1.,.16):style==3?vec3(1.,.015,.07):vec3(1.,.025,.09);
    gl_FragColor=vec4(color*2.,rim*drift*strength);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);
 mesh.userData.dicePowerArt=true;mesh.name='gold-critical-charge';root.add(mesh);
 return {
  strength(){return uniforms.strength.value;},
  update(now:number,known:boolean,power:number,maximum:boolean,reduced:boolean,redCharge:number,broken:boolean){
   const level=THREE.MathUtils.smoothstep(power,.3,1);
   uniforms.clock.value=reduced?0:now/1000;
   uniforms.strength.value=known&&!broken?(style===3?redCharge:level*(maximum?.65:.4)):0;
   mesh.visible=uniforms.strength.value>.001;
  },
  dispose(){root.remove(mesh);geometry.dispose();material.dispose();},
 };
}
