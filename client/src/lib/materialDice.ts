import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dieMesh, faceForwardMesh, type V3 } from '../../../shared/diceGeometry';
import type { DiceTheme } from '../../../shared/diceThemes';

// One offscreen WebGL context shared by all visible dice. Each result is copied
// into its existing 2D canvas; no extra contexts compete with the battlefield.
let stage: ReturnType<typeof makeStage> | undefined;
function makeStage() {
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.setSize(256,256);
  renderer.setClearColor(0x000000,0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room,.04);
  room.dispose(); pmrem.dispose();
  const scene = new THREE.Scene(); scene.environment=env.texture;
  const camera = new THREE.PerspectiveCamera(35,1,.1,30); camera.position.z=3.8;
  scene.add(new THREE.HemisphereLight(0xe6eeff,0x302031,.6));
  for (const [x,y,z,power] of [[-3,4,5,12],[4,1,2,8],[-2,-3,1,4]]) {
    const light=new THREE.PointLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);
  }
  return {renderer,scene,camera};
}
const vertex = `varying vec3 pos; varying vec3 nor; varying vec2 tex;
void main(){pos=position;nor=normal;tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `precision highp float;
varying vec3 pos; varying vec3 nor; varying vec2 tex;
uniform vec3 eye; uniform mat3 rotation;
uniform vec4 planes[20]; uniform int count; uniform float time; uniform vec3 tint;
uniform sampler2D etching; uniform bool engraved; uniform bool metalEdge;
uniform int style; uniform float critical;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
// Continuous studio lighting avoids cube-face seams and hard reflection flashes.
float softbox(vec3 r,vec3 direction,float width,float height){
 vec3 center=normalize(direction);
 vec3 right=normalize(cross(vec3(0,1,0),center));
 vec3 up=cross(center,right);
 float facing=dot(r,center);
 vec2 q=vec2(dot(r,right),dot(r,up))/max(.05,facing);
 vec2 edge=1.-smoothstep(vec2(width,height)*.65,vec2(width,height)*1.2,abs(q));
 return edge.x*edge.y*smoothstep(.1,.4,facing);
}
vec3 studioLight(vec3 r){
 r=normalize(r);
 float key=softbox(r,vec3(-.65,.65,1.),.22,.65);
 float fill=softbox(r,vec3(.85,.2,-.7),.3,.8);
 float rim=softbox(r,vec3(.2,-.8,.5),.6,.12);
 return vec3(.1+.12*(r.y*.5+.5))+vec3(.96,.98,1.)*(key*1.35+fill*.8+rim*.45);
}
// Keep the frame dark; numeral rims use a brighter copper-bronze for legibility.
vec3 bronzeSurface(vec3 n,vec3 incoming){
 float nv=max(.001,dot(n,-incoming));
 vec3 f0=vec3(.38,.16,.065);
 vec3 f=f0+(1.-f0)*pow(1.-nv,5.);
 vec3 environment=studioLight(rotation*reflect(incoming,n));
 return pow(environment+vec3(.16),vec3(1.5))*f*1.15+vec3(.012,.005,.002);
}
void main(){
 vec3 n=normalize(nor);vec3 incoming=normalize(pos-eye);
 float cut=metalEdge?0.:(engraved?texture2D(etching,tex).r:1.);
 if(engraved){
 vec3 axis=abs(n.x)>.95?vec3(0,1,0):vec3(1,0,0);vec3 tangent=normalize(axis-n*dot(axis,n));vec3 bitangent=cross(n,tangent);
 float dx=texture2D(etching,tex+vec2(.004,0)).r-texture2D(etching,tex-vec2(.004,0)).r;
 float dy=texture2D(etching,tex+vec2(0,.004)).r-texture2D(etching,tex-vec2(0,.004)).r;
 n=normalize(n-tangent*dx*.24-bitangent*dy*.24);
 }
 vec3 ray=refract(incoming,n,1./1.48);float distance=5.;
 for(int j=0;j<20;j++){if(j>=count)break;float denom=dot(planes[j].xyz,ray);if(denom>.0001)distance=min(distance,max(0.,(planes[j].w-dot(planes[j].xyz,pos))/denom));}
 vec3 beyond=studioLight(rotation*ray);
 vec3 through=beyond*exp(-distance*(vec3(1.)-tint)*2.4);
 float smoke=0.;vec3 energy=vec3(0.);float stepSize=distance/20.;
 if(style!=1){for(int j=0;j<20;j++){
   vec3 p=pos+ray*(float(j)+.5)*stepSize;
   float interior=smoothstep(.02,.22,min((float(j)+.5)*stepSize,distance-(float(j)+.5)*stepSize));
   vec3 drift=style==0?vec3(time*.065,-time*.045,time*.035):vec3(0.);
   float cloud=fbm(p*4.+drift);
   smoke+=smoothstep(.43,.73,cloud)*stepSize*interior*1.1;
   float vein=abs(noise(p*3.+vec3(fbm(p*5.+drift)*1.9))- .51);
   float spark=pow(max(0.,1.-vein*55.),4.)*smoothstep(.53,.73,cloud);
   if(style==0)energy+=vec3(1.,.065,.11)*spark*stepSize*interior*1.6;
   if(style==2){
     float growth=fbm(p*3.+vec3(fbm(p*5.)*1.8));
     float grain=1.-smoothstep(.016,.06,abs(growth-.51));
     smoke+=grain*stepSize*interior*.8;
     energy+=vec3(.004,.025,.007)*cloud*stepSize*interior;
   }
 }
 }
 through=through*exp(-smoke*1.9)+energy;
 float fresnel=.04+.96*pow(1.-max(0.,dot(-incoming,n)),5.);
 vec3 reflected=studioLight(rotation*reflect(incoming,n));
 vec3 color=mix(through,reflected,fresnel*.88+.07);
 if(style==1){
   // Subtle volcanic flow bands beneath a smooth polish; no granular bump layer.
   float flow=fbm(pos*2.1+vec3(fbm(pos*3.)*.9));
   float band=1.-smoothstep(.015,.085,abs(flow-.51));
   float cloud=smoothstep(.53,.72,fbm(pos*3.8));
   vec3 stone=vec3(.0008,.0007,.00075)+vec3(.003,.0026,.0024)*band+vec3(.004)*cloud;
   vec3 polished=pow(studioLight(rotation*reflect(incoming,n))*1.4,vec3(1.5));
   color=stone+polished*(.045+fresnel*.9);
 }
 color+=energy*.35;
 vec3 halfLight=normalize(normalize(vec3(-.65,.65,1.))-rotation*incoming);
 if(style!=1)color+=vec3(1.,.94,.9)*pow(max(0.,dot(rotation*n,halfLight)),180.)*.9;
 // Cut numerals expose a frosted, light-catching recess rather than a decal.
 if(engraved || metalEdge){
   if(style==2 && !metalEdge){
     // A recessed pocket reveals a lacquered wooden floor below the glass face.
     vec3 axis=abs(nor.x)>.95?vec3(0,1,0):vec3(1,0,0);
     vec3 tn=normalize(nor),tu=normalize(axis-tn*dot(axis,tn)),tv=cross(tn,tu);
     vec3 view=normalize(-incoming);
     vec2 offset=vec2(dot(view,tu),dot(view,tv))*.008/max(.35,dot(view,tn));
     vec2 woodUV=tex-offset;
     float floorMask=1.-texture2D(etching,woodUV).r;
     float rim=max(max(texture2D(etching,woodUV+vec2(.004,0)).r,texture2D(etching,woodUV-vec2(.004,0)).r),max(texture2D(etching,woodUV+vec2(0,.004)).r,texture2D(etching,woodUV-vec2(0,.004)).r));
     float warp=fbm(vec3(woodUV*vec2(4.,3.),6.));
     float grain=fbm(vec3(woodUV.x*75.+warp*16.,woodUV.y*9.,2.));
     // Low-contrast mahogany fibers live beneath a smooth clear lacquer coat.
     vec3 wood=mix(vec3(.027,.006,.003),vec3(.075,.025,.009),grain);
     float light=.65+.65*max(0.,dot(rotation*tn,normalize(vec3(-.65,.65,1.))));
     wood*=light;
     float coat=.045+.955*pow(1.-max(0.,dot(view,tn)),5.);
     vec3 reflection=studioLight(rotation*reflect(incoming,tn));
     wood+=reflection*coat*.85;
     // The recess wall occludes the floor; the lip catches a narrow highlight.
     wood*=mix(1.,.36,smoothstep(.35,.9,rim));
     wood+=reflection*.06*smoothstep(.15,.65,rim)*(1.-smoothstep(.7,1.,rim));
     vec3 pocket=mix(vec3(.008,.002,.001),wood,floorMask);
     float border=max(max(texture2D(etching,tex+vec2(.010,0)).r,texture2D(etching,tex-vec2(.010,0)).r),max(texture2D(etching,tex+vec2(0,.010)).r,texture2D(etching,tex-vec2(0,.010)).r));
     vec3 brightBronze=bronzeSurface(n,incoming)*2.1+vec3(.22,.105,.035);
     pocket=mix(pocket,brightBronze,smoothstep(.18,.8,border));
     color=mix(color,pocket,1.-cut);

   }
   else if(style==2){color=bronzeSurface(n,incoming);}
   else {
     vec3 f0=style==0?vec3(.97,.96,.93):style==1?vec3(.95,.64,.22):vec3(.66,.34,.12);
     vec3 axis=abs(n.x)>.95?vec3(0,1,0):vec3(1,0,0);
     vec3 tangent=normalize(axis-n*dot(axis,n));
     float brushing=(noise(vec3(tex*vec2(900.,70.),3.))-.5)*.025;
     vec3 bitangent=normalize(cross(n,tangent));
     float waviness=(fbm(vec3(tex*9.,4.))-.5)*.16;
     vec3 mn=normalize(n+tangent*(brushing+waviness)+bitangent*sin(tex.y*18.+tex.x*7.)*.035);
     vec3 worldN=rotation*mn,view=normalize(-rotation*incoming);
     vec3 r=studioLight(rotation*reflect(incoming,mn))+vec3(.28,.28,.28);
     float nv=max(.001,dot(worldN,view));
     vec3 fresnelMetal=f0+(1.-f0)*pow(1.-nv,5.);
     // Conductors are lit by colored reflections, not a yellow/brown diffuse fill.
     vec3 inlay=pow(r,vec3(1.8))*fresnelMetal*1.6;
     vec3 l=normalize(vec3(-.65,.65,1.)),h=normalize(l+view);
     float nl=max(.001,dot(worldN,l)),nh=max(0.,dot(worldN,h)),vh=max(0.,dot(view,h));
     float rough=style==0?.2:style==1?.23:.3,aa=pow(rough,4.);
     float denominator=nh*nh*(aa-1.)+1.;
     float distribution=aa/(3.14159*denominator*denominator);
     float k=pow(rough+1.,2.)/8.;
     float geometry=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
     vec3 f=f0+(1.-f0)*pow(1.-vh,5.);
     inlay+=f*distribution*geometry/(4.*nv)*.6;
     // A dark cut wall around the metal catches a narrow, beveled rim.
     float wall=metalEdge?0.:max(max(texture2D(etching,tex+vec2(.008,0)).r,texture2D(etching,tex-vec2(.008,0)).r),max(texture2D(etching,tex+vec2(0,.008)).r,texture2D(etching,tex-vec2(0,.008)).r));
     inlay*=mix(1.,.28,smoothstep(.35,.9,wall));
     inlay+=f0*critical*.38;
     color=mix(color,inlay,1.-cut);
   }
 }
 // Only bonus critical dice become solid polished gold; ordinary dice keep their class material.
 if(critical>.5){
   vec3 gold=vec3(.95,.58,.12);
   vec3 environment=studioLight(rotation*reflect(incoming,n));
   color=gold*(vec3(.22)+environment*.85)+gold*pow(max(0.,dot(rotation*n,halfLight)),90.)*.8;
   if(engraved)color=mix(vec3(.028,.012,.003),color,smoothstep(.18,.8,cut));
 }
 gl_FragColor=vec4(color,(critical>.5||style==1||metalEdge)?1.:.96);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function getDiceStage() { return stage ??= makeStage(); }

export function createMaterialDie(sides:number,theme:DiceTheme,crit:boolean,tens:boolean,ones:boolean) {
  const s=stage??=makeStage();
  const source=faceForwardMesh(dieMesh(sides));
  const vertices=source.vertices.map(v=>new THREE.Vector3(...v));
  const faces=source.faces.map(ids=>{
    const points=ids.map(i=>vertices[i]);const c=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
    const n=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();if(n.dot(c)<0)n.negate();
    const u=new THREE.Vector3(Math.abs(n.x)>.95?0:1,Math.abs(n.x)>.95?1:0,0);u.addScaledVector(n,-u.dot(n)).normalize();const v=new THREE.Vector3().crossVectors(n,u);
    const inset=points.map(p=>p.clone().lerp(c,.055));
    const radius=Math.min(...points.map((p,i)=>new THREE.Vector3().subVectors(points[(i+1)%points.length],p).cross(new THREE.Vector3().subVectors(c,p)).length()/p.distanceTo(points[(i+1)%points.length])));
    return {c,n,u,v,inset,radius};
  });
  const root=new THREE.Group();
  const glass=['sorcerer','fighter','ranger'].includes(theme.id);
  const style=theme.id==='fighter'?1:theme.id==='ranger'?2:0;
  const planes=Array.from({length:20},(_,i)=>faces[i]?new THREE.Vector4(...faces[i].n.toArray(),faces[i].n.dot(faces[i].c)):new THREE.Vector4());
  const uniforms={eye:{value:new THREE.Vector3()},rotation:{value:new THREE.Matrix3()},planes:{value:planes},count:{value:faces.length},time:{value:0},style:{value:style},critical:{value:crit?1:0},tint:{value:style===2?new THREE.Vector3(.16,.85,.29):crit?new THREE.Vector3(.98,.65,.14):new THREE.Vector3(.93,.1,.2)}};
  const materials:THREE.Material[]=[];const textures:THREE.Texture[]=[];const geometries:THREE.BufferGeometry[]=[];
  const makeMaterial=(etching?:THREE.Texture)=>{
    const m=glass?new THREE.ShaderMaterial({uniforms:{...uniforms,etching:{value:etching??null},engraved:{value:!!etching},metalEdge:{value:(style===2||style===1)&&!etching}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:true}):new THREE.MeshPhysicalMaterial({color:crit?'#d5a636':new THREE.Color().setHSL(theme.hue/360,theme.saturation/100,.065),metalness:.72,roughness:.38,clearcoat:.7,clearcoatRoughness:.16,bumpMap:etching,bumpScale:.045,map:etching,metalnessMap:etching,envMapIntensity:.55});
    materials.push(m);return m;
  };
  // The convex hull of inset face corners adds actual chamfer geometry.
  const hull=new ConvexGeometry(faces.flatMap(f=>f.inset));
  const hp=hull.getAttribute('position'),edgePoints:number[]=[];
  for(let i=0;i<hp.count;i+=3){const tri=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(hp,i+j));
    if(faces.some(f=>tri.every(p=>Math.abs(f.n.dot(p)-f.n.dot(f.c))<.00001)))continue;
    tri.forEach(p=>edgePoints.push(...p.toArray()));
  }
  hull.dispose();const edgeGeo=new THREE.BufferGeometry();edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(edgePoints,3));edgeGeo.computeVertexNormals();geometries.push(edgeGeo);
  root.add(new THREE.Mesh(edgeGeo,makeMaterial()));
  const labels=faces.map(f=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=4;textures.push(texture);
    const positions:number[]=[],uv:number[]=[];
    for(let j=1;j<f.inset.length-1;j++)for(const p of [f.inset[0],f.inset[j],f.inset[j+1]]){
      positions.push(...p.toArray());const delta=p.clone().sub(f.c);uv.push(.5+delta.dot(f.u)/(f.radius*2),.5+delta.dot(f.v)/(f.radius*2));
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();geometries.push(geo);
    const material=makeMaterial(texture);root.add(new THREE.Mesh(geo,material));
    return {canvas,texture};
  });
  let lastValue=-1;
  const inverseWorld=new THREE.Matrix4(),poseRotation=new THREE.Matrix4();
  return {
    object: root,
    setFaceValues(values: number[]) {
      labels.forEach(({canvas,texture},id)=>{
        const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,256,256);
        c.fillStyle='#151515';c.font=`bold ${tens?94:112}px Georgia`;c.textAlign='center';c.textBaseline='middle';
        c.fillText(tens?String(values[id]).padStart(2,'0'):String(values[id]),128,134);texture.needsUpdate=true;
      });
    },
    updatePose(camera: THREE.Camera, now: number) {
      root.updateMatrixWorld(true);
      uniforms.eye.value.copy(camera.position).applyMatrix4(inverseWorld.copy(root.matrixWorld).invert());
      uniforms.rotation.value.setFromMatrix4(poseRotation.makeRotationFromQuaternion(root.quaternion));
      uniforms.time.value=now/1000;
    },
    draw(ctx:CanvasRenderingContext2D,size:number,dpr:number,angles:V3,value:number,now:number,rolling:boolean){
      if(lastValue!==value && (!rolling || lastValue===-1)){lastValue=value;labels.forEach(({canvas,texture},id)=>{
        const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,256,256);
        // Grain is material-scale and deterministic, so it never flickers.
        if(!glass){for(let k=0;k<1400;k++){const x=(k*73)%256,y=(k*131+Math.floor(k/7))%256;c.fillStyle=k%3?'#dedede':'#aaa';c.fillRect(x,y,1,k%5===0?5:1);}}
        let n=id===0?value:((Math.max(1,value)+id-1)%sides)+1;
        if(tens)n=((Math.floor(value/10)+id)%10)*10;if(ones)n=(value+id)%10;
        c.fillStyle='#151515';c.font=`bold ${tens?94:112}px Georgia`;c.textAlign='center';c.textBaseline='middle';c.fillText(tens?String(n).padStart(2,'0'):String(n),128,134);
        texture.needsUpdate=true;
      });}
      root.rotation.set(angles[0]+.10,angles[1]-.14,angles[2],'ZYX');root.updateMatrixWorld(true);
      uniforms.eye.value.copy(s.camera.position).applyMatrix4(inverseWorld.copy(root.matrixWorld).invert());
      uniforms.rotation.value.setFromMatrix4(root.matrixWorld);uniforms.time.value=now/1000;
      const resolution=Math.min(640,Math.ceil(size*dpr));if(s.renderer.domElement.width!==resolution)s.renderer.setSize(resolution,resolution,false);
      s.scene.add(root);s.renderer.render(s.scene,s.camera);s.scene.remove(root);
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
      const shadow=ctx.createRadialGradient(size*.5,size*.88,0,size*.5,size*.88,size*.28);shadow.addColorStop(0,'#0008');shadow.addColorStop(1,'#0000');ctx.fillStyle=shadow;ctx.save();ctx.translate(0,size*.7);ctx.scale(1,.2);ctx.fillRect(0,0,size,size);ctx.restore();
      ctx.drawImage(s.renderer.domElement,0,0,size,size);
    },
    dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());s.scene.remove(root);},
  };
}

export type MaterialDieHandle = ReturnType<typeof createMaterialDie>;
