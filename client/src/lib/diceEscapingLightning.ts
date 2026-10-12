import * as THREE from 'three';
import type {LightningFrame} from './diceLightningTiming.js';

/** One bounded mesh: branching leaders, tapered hot channels and soft corona.
 * Regenerate only at discharge; synchronize to the slower internal strikes. */
export function createDiceEscapingLightning(root:THREE.Group,planes:THREE.Vector4[],radius:number){
 const capacity=96*6,positions=new Float32Array(capacity*3),tangents=new Float32Array(capacity*3);
 const edges=new Float32Array(capacity),widths=new Float32Array(capacity),travel=new Float32Array(capacity);
 const geometry=new THREE.BufferGeometry();
 for(const [name,array,size] of [['position',positions,3],['tangent',tangents,3],['edge',edges,1],['channelWidth',widths,1],['progress',travel,1]] as const)
  geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
 geometry.setDrawRange(0,0);
 const material=new THREE.ShaderMaterial({uniforms:{pulse:{value:0},age:{value:0},width:{value:radius*.105}},
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 tangent;attribute float edge;attribute float channelWidth;attribute float progress;
   uniform float width;varying float across;varying float along;
   void main(){vec4 view=modelViewMatrix*vec4(position,1.);vec3 line=(modelViewMatrix*vec4(tangent,0.)).xyz;
    vec2 sideways=normalize(vec2(-line.y,line.x)+vec2(.00001));
    view.xy+=sideways*edge*width*channelWidth*length(modelViewMatrix[0].xyz);
    across=edge;along=progress;gl_Position=projectionMatrix*view;}`,
  fragmentShader:`uniform float pulse;uniform float age;varying float across;varying float along;
   void main(){
    float head=clamp(age*15.+.08,0.,1.);
    float leader=1.-smoothstep(head-.07,head+.02,along);
    float core=exp(-across*across*100.);
    float sheath=exp(-across*across*18.);
    float corona=exp(-across*across*3.5);
    // A hot red core with crimson corona, rather than a white line.
    float texture=.82+.18*sin(along*93.-age*31.);
    float returnStroke=exp(-pow((age-.10)/.022,2.));
    vec3 radiance=vec3(3.2,.045,.06)*core+vec3(2.,.014,.038)*sheath*.58+vec3(1.1,.004,.018)*corona*.38;
    radiance*=1.-smoothstep(.75,1.,abs(across));
    gl_FragColor=vec4(radiance*texture*(.8+returnStroke*.45),pulse*leader);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;
 mesh.name='maximum-escaping-lightning';mesh.userData.dicePowerArt=true;root.add(mesh);
 let next=NaN,born=-Infinity,bursts=0,segments=0,active=false,lastStrike=0;
 const direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),axis=new THREE.Vector3();
 // Connected large bends subdivide into progressively finer jagged detail.
 function channel(a:THREE.Vector3,b:THREE.Vector3,depth:number,roughness:number):THREE.Vector3[]{
  if(depth===0)return [a,b];
  const mid=a.clone().lerp(b,.42+Math.random()*.16)
   .addScaledVector(side,(Math.random()-.5)*roughness)
   .addScaledVector(up,(Math.random()-.5)*roughness);
  const left=channel(a,mid,depth-1,roughness*.52),right=channel(mid,b,depth-1,roughness*.52);
  return [...left.slice(0,-1),...right];
 }
 function discharge(now:number){
  direction.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
  axis.set(Math.abs(direction.z)>.85?1:0,0,Math.abs(direction.z)>.85?0:1);
  side.crossVectors(direction,axis).normalize();up.crossVectors(direction,side);
  let surface=Infinity;
  for(const p of planes){const dot=p.x*direction.x+p.y*direction.y+p.z*direction.z;if(dot>.00001)surface=Math.min(surface,p.w/dot);}
  const start=direction.clone().multiplyScalar(Number.isFinite(surface)?surface:radius);
  const length=radius*(1.+Math.random()*.55);
  const end=start.clone().addScaledVector(direction,length).addScaledVector(side,(Math.random()-.5)*radius*.6);
  const main=channel(start,end,5,radius*.65);
  const paths=[{points:main,width:1,from:0,to:1}];
  for(let fork=0;fork<4;fork++){
   const joint=5+Math.floor(Math.random()*19),from=main[joint];
   const forkEnd=from.clone().addScaledVector(direction,radius*(.2+Math.random()*.35))
    .addScaledVector(side,radius*(.25+Math.random()*.35)*(fork%2?1:-1))
    .addScaledVector(up,(Math.random()-.5)*radius*.55);
   paths.push({points:channel(from,forkEnd,3,radius*.23),width:.55+Math.random()*.25,from:joint/32,to:Math.min(1,joint/32+.32)});
  }
  let vertex=0;segments=0;
  for(const path of paths){
   const {points}=path,n=points.length-1;
   const tangent=points.map((_,i)=>points[Math.min(n,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize());
   for(let i=0;i<n;i++){
    // Shared joint tangents avoid broken strokes or thick elbows.
    for(const [point,edge] of [[i,-1],[i+1,-1],[i,1],[i,1],[i+1,-1],[i+1,1]] as const){
     positions.set(points[point].toArray(),vertex*3);tangents.set(tangent[point].toArray(),vertex*3);
     edges[vertex]=edge;widths[vertex]=path.width*(1-.82*Math.pow(point/n,1.4));
     travel[vertex]=path.from+(path.to-path.from)*point/n;vertex++;
    }
    segments++;
   }
  }
  for(const attribute of Object.values(geometry.attributes))attribute.needsUpdate=true;
  geometry.setDrawRange(0,vertex);born=now;bursts++;
 }
 return {
  reset(){next=NaN;born=-Infinity;bursts=0;segments=0;active=false;lastStrike=0;mesh.visible=false;},
  state(){return {escapingBolts:mesh.visible?segments:0,lightningBursts:bursts};},
  update(now:number,maximum:boolean,age:number,reduced:boolean,frame:LightningFrame){
   if(!maximum||reduced){active=false;next=NaN;mesh.visible=false;return;}
   if(!active){active=true;next=now+Math.max(0,.45-age)*1000+Math.random()*350;}
   if(now>=next&&frame.strike!==lastStrike&&frame.phase>=.18&&frame.phase<=.6){
    discharge(now);lastStrike=frame.strike;next=now+650+Math.random()*900;
   }
   const elapsed=(now-born)/1000;
   mesh.visible=elapsed>=0&&elapsed<.24;
   material.uniforms.age.value=elapsed;
   material.uniforms.pulse.value=mesh.visible?Math.pow(1-elapsed/.24,.7):0;
  },
  dispose(){root.remove(mesh);geometry.dispose();material.dispose();},
 };
}
