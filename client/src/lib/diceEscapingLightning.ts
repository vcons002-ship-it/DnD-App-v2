import * as THREE from 'three';

/** Occasional independent surface discharges. Fixed ribbons are regenerated
 * only when a bolt fires; no live lights or additional render passes. */
export function createDiceEscapingLightning(root:THREE.Group,planes:THREE.Vector4[],radius:number){
 const capacity=18*6,positions=new Float32Array(capacity*3),tangents=new Float32Array(capacity*3),edges=new Float32Array(capacity);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('tangent',new THREE.BufferAttribute(tangents,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('edge',new THREE.BufferAttribute(edges,1));geometry.setDrawRange(0,0);
 const material=new THREE.ShaderMaterial({uniforms:{pulse:{value:0},width:{value:radius*.032}},
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 tangent;attribute float edge;uniform float width;varying float across;
   void main(){vec4 view=modelViewMatrix*vec4(position,1.);vec3 line=(modelViewMatrix*vec4(tangent,0.)).xyz;
    vec2 sideways=normalize(vec2(-line.y,line.x)+vec2(.00001));
    view.xy+=sideways*edge*width*length(modelViewMatrix[0].xyz);across=edge;
    gl_Position=projectionMatrix*view;}`,
  fragmentShader:`uniform float pulse;varying float across;
   void main(){float core=exp(-across*across*35.),halo=exp(-across*across*3.);
    vec3 color=mix(vec3(2.8,.025,.085),vec3(3.,1.6,1.4),core);
    gl_FragColor=vec4(color,pulse*(core+halo*.32));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 mesh.name='maximum-escaping-lightning';mesh.userData.dicePowerArt=true;root.add(mesh);
 let next=NaN,born=-Infinity,bursts=0,segments=0,active=false;
 const direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),axis=new THREE.Vector3();
 function discharge(now:number){
  direction.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
  axis.set(Math.abs(direction.z)>.85?1:0,0,Math.abs(direction.z)>.85?0:1);
  side.crossVectors(direction,axis).normalize();up.crossVectors(direction,side);
  let surface=Infinity;
  for(const p of planes){const dot=p.x*direction.x+p.y*direction.y+p.z*direction.z;if(dot>.00001)surface=Math.min(surface,p.w/dot);}
  const start=direction.clone().multiplyScalar(Number.isFinite(surface)?surface:radius);
  const path:THREE.Vector3[]=[start];const length=radius*(.9+Math.random()*.6);
  for(let i=1;i<=8;i++)path.push(start.clone().addScaledVector(direction,length*i/8)
   .addScaledVector(side,(Math.random()-.5)*radius*.28).addScaledVector(up,(Math.random()-.5)*radius*.2));
  const lines:Array<[THREE.Vector3,THREE.Vector3]>=[];
  for(let i=0;i<8;i++)lines.push([path[i],path[i+1]]);
  for(const joint of [3,5]){
   let from=path[joint];
   for(let i=1;i<=3;i++){
    const to=path[joint].clone().addScaledVector(direction,radius*i*.13)
     .addScaledVector(side,radius*i*(joint===3?.15:-.15)).addScaledVector(up,(Math.random()-.5)*radius*.16);
    lines.push([from,to]);from=to;
   }
  }
  let vertex=0;
  for(const [a,b] of lines)for(const [point,edge] of [[a,-1],[b,-1],[a,1],[a,1],[b,-1],[b,1]] as const){
   positions.set(point.toArray(),vertex*3);tangents.set([b.x-a.x,b.y-a.y,b.z-a.z],vertex*3);edges[vertex++]=edge;
  }
  for(const attribute of ['position','tangent','edge'])geometry.attributes[attribute].needsUpdate=true;
  geometry.setDrawRange(0,vertex);segments=lines.length;born=now;bursts++;
 }
 return {
  reset(){next=NaN;born=-Infinity;bursts=0;segments=0;active=false;mesh.visible=false;},
  state(){return {escapingBolts:mesh.visible?segments:0,lightningBursts:bursts};},
  update(now:number,maximum:boolean,age:number,reduced:boolean){
   if(!maximum||reduced){active=false;next=NaN;mesh.visible=false;return;}
   if(!active){active=true;next=now+Math.max(0,.45-age)*1000+Math.random()*350;}
   if(now>=next){discharge(now);next=now+650+Math.random()*900;}
   const elapsed=(now-born)/1000;
   mesh.visible=elapsed>=0&&elapsed<.19;
   material.uniforms.pulse.value=mesh.visible?(1-elapsed/.19)*(.65+.35*Math.pow(Math.cos(elapsed*65),2)):0;
  },
  dispose(){root.remove(mesh);geometry.dispose();material.dispose();},
 };
}
