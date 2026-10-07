import * as THREE from 'three';
import {createLightningTiming} from './diceLightningTiming';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dieMesh, faceForwardMesh, roundedD6Mesh, D6_EDGE_ROUNDING, type V3 } from '../../../shared/diceGeometry';
import type { DiceTheme } from '../../../shared/diceThemes';

// One offscreen WebGL context shared by all visible dice. Each result is copied
// into its existing 2D canvas; no extra contexts compete with the battlefield.
let stage: ReturnType<typeof makeStage> | undefined;
function drawDieNumeral(ctx:CanvasRenderingContext2D,text:string,x:number,y:number){
  ctx.fillText(text,x,y);
  if(!text.includes('6'))return;
  const fontSize=Number(ctx.font.match(/([\d.]+)px/)?.[1]??112);
  const width=ctx.measureText(text).width;
  const descent=ctx.measureText('6').actualBoundingBoxDescent;
  for(let i=0;i<text.length;i++)if(text[i]==='6'){
    const digitWidth=ctx.measureText('6').width;
    const center=x-width/2+ctx.measureText(text.slice(0,i)).width+digitWidth/2;
    ctx.fillRect(center-digitWidth*.36,y+descent+fontSize*.035,digitWidth*.72,Math.max(2,fontSize*.045));
  }
}
function dieNumeralFont(text:string,tens:boolean,sides:number){return sides===4?120:tens?132:text.length>1?140:152;}
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
uniform sampler2D etching; uniform bool engraved; uniform bool metalEdge; uniform bool thinGoldEdge;
uniform int style; uniform float critical; uniform bool numeralsOnly;
uniform bool inlayBacking;
uniform float numeralEmphasis;
uniform float moltenCracks;
uniform float mossAgate;
uniform float enchantedAmber;
uniform float internalLightning;
uniform float lightningPhase; uniform float lightningSeed;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
// A continuous 3D fracture field makes the seams wrap across faces. The
// second sample sits beneath the surface and shifts with refraction, exposing
// molten rock through fissures rather than painting orange lines on the shell.
float moltenFracture(vec3 p){
 vec3 q=p*2.65+vec3(fbm(p*4.1),fbm(p*4.1+7.),fbm(p*4.1+17.))*1.8;
 vec3 cell=floor(q),f=fract(q);float first=20.,second=20.;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
  vec3 offset=vec3(float(x),float(y),float(z)),id=cell+offset;
  vec3 point=offset+vec3(hash(id),hash(id+13.7),hash(id+29.1))-f;
  float d=dot(point,point);
  if(d<first){second=first;first=d;}else second=min(second,d);
 }
 return max(0.,sqrt(second)-sqrt(first));
}
// Die-local filaments are sampled through the glass volume, never painted on
// its faces. A shared burst seed keeps the same arc coherent across all faces.
vec2 electricArc(vec3 p,float seed){
 float distance=10.,progress=0.;vec3 previous=vec3(-.64,-.34,-.34);
 vec3 branch=vec3(0.);
 for(int k=1;k<=7;k++){
  float t=float(k)/7.;
  vec3 point=mix(vec3(-.64,-.34,-.34),vec3(.59,.47,.38),t);
  point+=vec3(hash(vec3(seed,float(k),1.)),hash(vec3(seed,float(k),2.)),hash(vec3(seed,float(k),3.)))-.5;
  point=mix(point,mix(vec3(-.64,-.34,-.34),vec3(.59,.47,.38),t),.55);
  vec3 delta=point-previous;
  float along=clamp(dot(p-previous,delta)/dot(delta,delta),0.,1.);
  float candidate=length(p-previous-delta*along);
  if(candidate<distance){distance=candidate;progress=(float(k)-1.+along)/7.;}
  previous=point;
  if(k==4)branch=point;
 }
 vec3 tip=vec3(-.25,.58,-.43),joint=mix(branch,tip,.5)+vec3(.12,-.09,.07);
 for(int k=0;k<2;k++){
  vec3 a=k==0?branch:joint,b=k==0?joint:tip,delta=b-a;
  float along=clamp(dot(p-a,delta)/dot(delta,delta),0.,1.);
  float candidate=length(p-a-delta*along);
  if(candidate<distance){distance=candidate;progress=.52+(float(k)+along)*.24;}
 }
 return vec2(distance,progress);
}
// Botanical fragments sit in fixed planes inside the resin, not on its faces.
float amberFern(vec3 p){
 float fern=0.;
 for(int k=0;k<2;k++){
  vec3 q=p-(k==0?vec3(-.18,.04,-.12):vec3(.25,-.14,.18));
  float a=k==0?.48:-1.1; q.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*q.xy;
  q.z+=q.y*(k==0?.32:-.4);
  float lengthMask=1.-smoothstep(.28,.35,abs(q.y));
  float stem=exp(-dot(q.xz,q.xz)/.0006)*lengthMask;
  float reach=max(.01,.17*(1.-abs(q.y)/.38));
  float row=floor((q.y+.36)/.085)*.085-.36+.0425;
  float offset=q.y-row-abs(q.x)*.30;
  float blade=exp(-q.z*q.z/.0015-offset*offset/.0005);
  blade*=smoothstep(.0,.035,abs(q.x))*(1.-smoothstep(reach*.72,reach,abs(q.x)))*lengthMask;
  fern=max(fern,max(stem,blade));
 }
 return fern;
}
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
 // Keep gold to a narrow central band on Druk's rounded d6 shoulders.
 // The surrounding shoulder remains polished obsidian; its shape is unchanged.
 vec3 edgeNormal=abs(normalize(nor));
 float largest=max(edgeNormal.x,max(edgeNormal.y,edgeNormal.z));
 float second=edgeNormal.x+edgeNormal.y+edgeNormal.z-largest-min(edgeNormal.x,min(edgeNormal.y,edgeNormal.z));
 float edgeGold=thinGoldEdge&&metalEdge?smoothstep(.42,.50,second/largest):1.;
 float cut=metalEdge?0.:(engraved?texture2D(etching,tex).r:1.);
 if(numeralsOnly&&cut>.98)discard;
 // The inside of a gold inlay is dark backing, not another bright result.
 // It remains in the refraction pass without competing with the upward number.
 if(numeralsOnly&&(inlayBacking||!gl_FrontFacing)){
   gl_FragColor=vec4(.012,.006,.021,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   return;
 }
 if(engraved){
 vec3 axis=abs(n.x)>.95?vec3(0,1,0):vec3(1,0,0);vec3 tangent=normalize(axis-n*dot(axis,n));vec3 bitangent=cross(n,tangent);
 float dx=texture2D(etching,tex+vec2(.004,0)).r-texture2D(etching,tex-vec2(.004,0)).r;
 float dy=texture2D(etching,tex+vec2(0,.004)).r-texture2D(etching,tex-vec2(0,.004)).r;
 n=normalize(n-tangent*dx*.24-bitangent*dy*.24);
 }
 #ifndef INLAY_ONLY
 vec3 ray=refract(incoming,n,1./1.48);float distance=5.;
 for(int j=0;j<20;j++){if(j>=count)break;float denom=dot(planes[j].xyz,ray);if(denom>.0001)distance=min(distance,max(0.,(planes[j].w-dot(planes[j].xyz,pos))/denom));}
 vec3 beyond=studioLight(rotation*ray);
 vec3 through=beyond*exp(-distance*(vec3(1.)-tint)*(style==3?.75:2.4));
 if(style==3)through*=vec3(.15,.015,.32);
 float smoke=0.;vec3 energy=vec3(0.),mossColor=vec3(0.);float mossDepth=0.;vec3 amberColor=vec3(0.);float amberWeight=0.,fernDepth=0.;float stepSize=distance/20.;
 if(style==0||style==2||style==3){for(int j=0;j<20;j++){
   vec3 p=pos+ray*(float(j)+.5)*stepSize;
   float interior=smoothstep(.02,.22,min((float(j)+.5)*stepSize,distance-(float(j)+.5)*stepSize));
   vec3 drift=style==0?vec3(time*.065,-time*.045,time*.035):style==3?vec3(time*.11,-time*.08,time*.06):vec3(0.);
   float cloud=fbm(p*4.+drift);
   smoke+=smoothstep(.43,.73,cloud)*stepSize*interior*(style==3?.22:1.1);
   float vein=abs(noise(p*3.+vec3(fbm(p*5.+drift)*1.9))- .51);
   float spark=pow(max(0.,1.-vein*55.),4.)*smoothstep(.53,.73,cloud);
   if(style==0)energy+=vec3(1.,.065,.11)*spark*stepSize*interior*1.6;
   if(style==0&&internalLightning>.5){
     float phase=lightningPhase;
     vec2 arc=electricArc(p,lightningSeed);
     float head=clamp((phase-.13)/.48,0.,1.);
     float reached=smoothstep(arc.y-.025,arc.y+.008,head);
     float tail=exp(-max(0.,head-arc.y)*5.);
     float discharge=smoothstep(.12,.16,phase)*(1.-smoothstep(.60,.90,phase));
     float flicker=.7+.3*pow(sin(time*58.+lightningSeed),2.);
     // A leader crosses the volume, its branches follow, and the established
     // channel briefly flares in a weaker return stroke before fading.
     float burst=reached*tail*discharge*flicker+exp(-pow((phase-.79)/.028,2.))*.28;
     float distanceToArc=arc.x;
     float core=exp(-distanceToArc*distanceToArc/ .0012);
     float halo=exp(-distanceToArc*distanceToArc/ .014);
     energy+=(vec3(1.,.62,.60)*core*11.+vec3(1.,.018,.055)*halo*2.4)*burst*stepSize*interior;
   }
   if(style==3){
     // Moving light lives inside the resin volume, beneath the glossy shell.
     // Keep the interior curls subtle so they cannot wash out the gold numerals.
     float pulse=.85+.15*sin(time*1.8+p.y*3.);
     energy+=vec3(.32,.035,.65)*spark*1.8*pulse*stepSize*interior;
   }
   if(style==2){
     float growth=fbm(p*3.+vec3(fbm(p*5.)*1.8));
     float grain=1.-smoothstep(.016,.06,abs(growth-.51));
     if(enchantedAmber>.5){
       float pocket=smoothstep(.53,.67,fbm(p*2.3+vec3(2.,1.,4.)));
       float measure=stepSize*interior;
       amberColor+=mix(vec3(.065,.26,.12),vec3(.62,.255,.035),pocket)*measure;
       amberWeight+=measure;
       float fibre=exp(-pow(length(vec2(p.x+.10+sin(p.y*4.)*.06,p.z+.24))/.027,2.))*(1.-smoothstep(.18,.31,abs(p.y+.08)));
       fernDepth+=fibre*6.*measure;
       energy+=vec3(.026,.008,.001)*pocket*measure;
     }else if(mossAgate>.5){
       // Die-local inclusions occupy the stone volume and shift through clear patches.
       float dendrite=smoothstep(.49,.66,cloud)*(1.-smoothstep(.025,.105,abs(noise(p*13.+growth*3.)-.51)));
       float mineral=1.-smoothstep(.007,.032,abs(growth-.54));
       float density=(.11+dendrite*1.9+mineral*.30)*stepSize*interior;
       vec3 inclusion=mix(vec3(.006,.033,.014),vec3(.055,.14,.042),cloud);
       inclusion=mix(inclusion,vec3(.23,.29,.19),mineral*.65);
       mossColor+=inclusion*density;mossDepth+=density;
     }else{
       smoke+=grain*stepSize*interior*.8;
       energy+=vec3(.004,.025,.007)*cloud*stepSize*interior;
     }
   }
 }
 }
 if(style==2&&enchantedAmber>.5){
   vec3 resin=beyond*amberColor/max(.0001,amberWeight)*exp(-distance*vec3(.28,.20,.35));
   through=mix(resin,vec3(.008,.024,.009),1.-exp(-fernDepth));
   // Intersect the embedded frond planes exactly so thin leaflets do not
   // disappear between volume samples or shimmer during rotation.
   float fernMask=0.;
   for(int k=0;k<2;k++){
    vec3 q=pos-(k==0?vec3(-.18,.04,-.12):vec3(.25,-.14,.18)),d=ray;
    float a=k==0?.48:-1.1,tilt=k==0?.32:-.4;
    mat2 turn=mat2(cos(a),-sin(a),sin(a),cos(a));q.xy=turn*q.xy;d.xy=turn*d.xy;
    float denominator=d.z+d.y*tilt;
    if(abs(denominator)>.0001){
     float travel=-(q.z+q.y*tilt)/denominator;
     if(travel>.015&&travel<distance){
      float leaf=amberFern(pos+ray*travel)*.82*exp(-travel*.25);
      fernMask=1.-(1.-fernMask)*(1.-leaf);
     }
    }
   }
   through=mix(through,vec3(.009,.035,.012),fernMask);
   smoke*=.08;
 }else if(style==2&&mossAgate>.5){
   vec3 chalcedony=beyond*vec3(.24,.40,.29)*exp(-distance*vec3(.55,.24,.44));
   through=mix(chalcedony,mossColor/max(.0001,mossDepth),1.-exp(-mossDepth*2.8));
   smoke*=.12;
 }
 through=through*exp(-smoke*1.9)+energy;
 float fresnel=.04+.96*pow(1.-max(0.,dot(-incoming,n)),5.);
 vec3 reflected=studioLight(rotation*reflect(incoming,n));
 vec3 color=mix(through,reflected,fresnel*.88+(style==3?.02:.07));
 if(style==1){
   // Subtle volcanic flow bands beneath a smooth polish; no granular bump layer.
   float flow=fbm(pos*2.1+vec3(fbm(pos*3.)*.9));
   float band=1.-smoothstep(.015,.085,abs(flow-.51));
   float cloud=smoothstep(.53,.72,fbm(pos*3.8));
   vec3 stone=vec3(.0008,.0007,.00075)+vec3(.003,.0026,.0024)*band+vec3(.004)*cloud;
   vec3 polished=pow(studioLight(rotation*reflect(incoming,n))*1.4,vec3(1.5));
   color=stone+polished*(.045+fresnel*.9);
   if(moltenCracks>.5){
     float raw=moltenFracture(pos);
     float chip=fbm(pos*48.)*.013+noise(pos*110.)*.003;
     float mouth=max(0.,raw-chip),below=moltenFracture(pos+ray*.07);
     float region=smoothstep(.40,.65,fbm(pos*1.55+vec3(4.,1.,9.)));
     // Wide, dark chipped shoulders surround a much narrower split. Its
     // sloped sides change reflections with the view instead of glowing flat.
     float groove=(1.-smoothstep(.012,.115,mouth))*region;
     float cavity=(1.-smoothstep(.002,.030,mouth))*region;
     vec3 sx=dFdx(pos),sy=dFdy(pos),r1=cross(sy,n),r2=cross(n,sx);
     float det=dot(sx,r1);
     vec3 grad=(dFdx(groove)*r1+dFdy(groove)*r2)/(abs(det)>.000001?det:.000001);
     vec3 brokenNormal=normalize(n+grad*.027);
     vec3 brokenReflection=pow(studioLight(rotation*reflect(incoming,brokenNormal))*1.4,vec3(1.5));
     color=mix(color,stone+brokenReflection*(.04+fresnel*.72),groove*.9);
     color*=1.-cavity*.82;
     float hotCore=1.-smoothstep(.003,.042,below);
     float pulse=.94+.06*sin(time*.9+fbm(pos*4.)*7.);
     // Deep red heat is visible only at the bottom of a split. Broad stone
     // faces stay polished black; tiny amber pockets hint at hotter magma.
     vec3 magma=mix(vec3(.19,.003,.0005),vec3(.65,.045,.003),hotCore);
     // Slightly stronger heat at the bottom, with a restrained spill onto
     // the chipped shoulders; polished faces and gold retain their lighting.
     color+=magma*cavity*pulse*1.3+vec3(.026,.0012,.00015)*groove;
   }
 }
 color+=energy*.35;
 vec3 halfLight=normalize(normalize(vec3(-.65,.65,1.))-rotation*incoming);
 if(style!=1)color+=vec3(1.,.94,.9)*pow(max(0.,dot(rotation*n,halfLight)),180.)*.9;
 #else
 vec3 color=vec3(0.);
 vec3 halfLight=normalize(normalize(vec3(-.65,.65,1.))-rotation*incoming);
 #endif
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
     // A brighter copper-bronze floor keeps the narrow number rim readable
     // between reflections without brightening the wooden recess or die edges.
     vec3 brightBronze=bronzeSurface(n,incoming)*2.8+vec3(.68,.32,.12);
     pocket=mix(pocket,brightBronze,smoothstep(.18,.8,border));
     color=mix(color,pocket,1.-cut);

   }
   else if(style==2){color=bronzeSurface(n,incoming);}
   else {
     vec3 f0=style==3?(metalEdge?vec3(.78,.83,.90):vec3(.95,.64,.22)):style==0?vec3(.97,.96,.93):style==1?vec3(.95,.64,.22):vec3(.66,.34,.12);
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
     float rough=style==3?.48:style==0?.2:style==1?.23:.3,aa=pow(rough,4.);
     float denominator=nh*nh*(aa-1.)+1.;
     float distribution=aa/(3.14159*denominator*denominator);
     float k=pow(rough+1.,2.)/8.;
     float geometry=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
     vec3 f=f0+(1.-f0)*pow(1.-vh,5.);
     inlay+=f*distribution*geometry/(4.*nv)*.6;
     if(style==3){
       // Satin gold keeps a stable warm contrast against the glossy resin.
       // Compress reflection peaks before tone mapping can bleach the numeral
       // into the same white highlight as the surrounding face.
       float reflectedLight=dot(inlay,vec3(.2126,.7152,.0722));
       inlay=f0*(.32+.78*reflectedLight/(1.+reflectedLight));
     }
     // A dark cut wall around the metal catches a narrow, beveled rim.
     float wall=metalEdge||style==3?0.:max(max(texture2D(etching,tex+vec2(.008,0)).r,texture2D(etching,tex-vec2(.008,0)).r),max(texture2D(etching,tex+vec2(0,.008)).r,texture2D(etching,tex-vec2(0,.008)).r));
     inlay*=mix(1.,.28,smoothstep(.35,.9,wall));
     inlay+=f0*critical*.38;
     // A result-card engraving must remain legible even between reflections.
     // Tray faces keep the default emphasis of one and their existing finish.
     inlay=max(inlay,f0*max(0.,numeralEmphasis-1.)*.65)*numeralEmphasis;
     color=mix(color,inlay,(1.-cut)*edgeGold);
   }
 }
 // Only bonus critical dice become solid polished gold; ordinary dice keep their class material.
 if(critical>.5){
   vec3 gold=vec3(.95,.58,.12);
   vec3 environment=studioLight(rotation*reflect(incoming,n));
   color=gold*(vec3(.22)+environment*.85)+gold*pow(max(0.,dot(rotation*n,halfLight)),90.)*.8;
   if(engraved)color=mix(vec3(.028,.012,.003),color,smoothstep(.18,.8,cut));
 }
 // DM resin is a separate physical volume; only its metal inlays use this shader.
 gl_FragColor=vec4(color,(numeralsOnly||critical>.5||style==1||metalEdge)?1.:.96);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function getDiceStage() { return stage ??= makeStage(); }

// Integrate dark wisps inside the same physical transmission shader. Sampling
// in die-local space keeps the clouds inside the turning die, rather than on a
// face or as a screen overlay. No added meshes, lights or rendering passes.
const resinCloudDeclarations=`
varying vec3 resinPosition;
varying vec3 resinNormal;
uniform vec3 resinEye;
uniform float resinTime;
uniform float resinGlow;
uniform float resinDensity;
uniform float resinInk;
uniform vec4 resinPlanes[20];
uniform int resinPlaneCount;
float resinHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float resinNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(resinHash(i),resinHash(i+vec3(1,0,0)),f.x),mix(resinHash(i+vec3(0,1,0)),resinHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(resinHash(i+vec3(0,0,1)),resinHash(i+vec3(1,0,1)),f.x),mix(resinHash(i+vec3(0,1,1)),resinHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`;
const resinInkField=`
float resinInkDensity(vec3 p,float t){
 // Slowly advected lobes stretch into thin curls, like ink mixing in liquid.
 vec3 q=p*2.6+vec3(t*.045,-t*.075,t*.028);
 vec3 warp=vec3(resinNoise(q+vec3(0.,t*.09,4.)),resinNoise(q+vec3(8.,0.,-t*.07)),resinNoise(q+vec3(-t*.06,13.,0.)))-.5;
 q+=warp*2.2;
 float cloud=resinNoise(q)*.65+resinNoise(q*2.07+warp)*.25+resinNoise(q*4.1)*.1;
 vec3 center=p-vec3(.07,.12,-.04);
 float envelope=exp(-dot(center*vec3(1.05,.8,1.05),center*vec3(1.05,.8,1.05))*1.65);
 return smoothstep(.43,.64,cloud)*envelope;
}
`;
const resinCloudTransmission=`
 vec3 cloudRay=refract(normalize(resinPosition-resinEye),normalize(resinNormal),1./1.48);
 float cloudLength=4.;
 for(int p=0;p<20;p++){
   if(p>=resinPlaneCount)break;
   float denominator=dot(resinPlanes[p].xyz,cloudRay);
   if(denominator>.0001)cloudLength=min(cloudLength,max(0.,(resinPlanes[p].w-dot(resinPlanes[p].xyz,resinPosition))/denominator));
 }
 float samples=resinInk>.5?12.:8.;
 float cloudStep=cloudLength/samples,cloudDepth=0.,glowDepth=0.;
 float inkTransmission=1.;vec3 inkLight=vec3(0.);
 vec3 drift=vec3(resinTime*.07,-resinTime*.055,resinTime*.04);
 for(int j=0;j<12;j++){
   if(float(j)>=samples)break;
   float travel=(float(j)+.5)*cloudStep;
   vec3 point=resinPosition+cloudRay*travel;
   float interior=smoothstep(.015,.16,min(travel,cloudLength-travel));
   if(resinInk>.5){
     float ink=resinInkDensity(point,resinTime);
     float opacity=1.-exp(-ink*cloudStep*interior*4.2);
     // Light behind and between dark lobes gives a readable silhouette.
     vec3 lamp=point-vec3(-.18,.2,-.1);
     float illumination=exp(-dot(lamp,lamp)*2.1)*resinGlow;
     inkLight+=inkTransmission*(vec3(.002,.0006,.005)*opacity+vec3(.14,.062,.26)*illumination*(1.-opacity)*cloudStep*interior);
     inkTransmission*=1.-opacity;
   }else{
     vec3 curl=vec3(sin(point.y*2.4+resinTime*.18),cos(point.z*2.1-resinTime*.14),sin(point.x*2.7+resinTime*.12))*.25;
     vec3 domain=point*3.+curl+drift;
     float density=resinNoise(domain)*.7+resinNoise(domain*2.03- drift*.7)*.3;
     cloudDepth+=smoothstep(.43,.7,density)*cloudStep*interior;
     if(resinGlow>0.)glowDepth+=exp(-dot(point,point)*3.5)*(.35+density*.65)*cloudStep*interior;
   }
 }
 if(resinInk>.5){
   totalDiffuse=totalDiffuse*inkTransmission+inkLight;
 }else{
 float cloudOpacity=1.-exp(-cloudDepth*1.25);
 totalDiffuse=mix(totalDiffuse,vec3(.009,.003,.021),cloudOpacity);
 totalDiffuse=mix(totalDiffuse,vec3(.024,.008,.045),resinDensity*.22);
 // Soft volume illumination remains below the bright exterior gold inlays.
 totalDiffuse+=vec3(.09,.028,.19)*(1.-exp(-glowDepth*1.4))*resinGlow;
 }
`;

export function createMaterialDie(sides:number,theme:DiceTheme,crit:boolean,tens:boolean,ones:boolean) {
  const s=stage??=makeStage();
  const source=faceForwardMesh(dieMesh(sides));
  const vertices=source.vertices.map(v=>new THREE.Vector3(...v));
  const faces=source.faces.map(ids=>{
    const points=ids.map(i=>vertices[i]);const c=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
    const n=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();if(n.dot(c)<0)n.negate();
    const u=new THREE.Vector3(Math.abs(n.x)>.95?0:1,Math.abs(n.x)>.95?1:0,0);u.addScaledVector(n,-u.dot(n)).normalize();const v=new THREE.Vector3().crossVectors(n,u);
    const inset=points.map(p=>p.clone().lerp(c,sides===6?D6_EDGE_ROUNDING:.055));
    const radius=Math.min(...points.map((p,i)=>new THREE.Vector3().subVectors(points[(i+1)%points.length],p).cross(new THREE.Vector3().subVectors(c,p)).length()/p.distanceTo(points[(i+1)%points.length])));
    return {c,n,u,v,inset,radius};
  });
  const root=new THREE.Group();
  const dm=theme.id.startsWith('dm-');
  const gem=dm&&!crit;
  const glass=dm||['sorcerer','fighter','ranger'].includes(theme.id);
  const style=dm?3:theme.id==='fighter'?1:theme.id==='ranger'?2:0;
  const planes=Array.from({length:20},(_,i)=>faces[i]?new THREE.Vector4(...faces[i].n.toArray(),faces[i].n.dot(faces[i].c)):new THREE.Vector4());
  const uniforms={eye:{value:new THREE.Vector3()},rotation:{value:new THREE.Matrix3()},planes:{value:planes},count:{value:faces.length},time:{value:0},moltenCracks:{value:style===1&&!crit?1:0},mossAgate:{value:style===2&&!crit?1:0},enchantedAmber:{value:0},internalLightning:{value:theme.id==='sorcerer'&&!crit?1:0},lightningPhase:{value:3},lightningSeed:{value:0},resinGlow:{value:gem?.65:0},resinDensity:{value:gem?1:0},resinInk:{value:gem?1:0},style:{value:style},critical:{value:crit?1:0},tint:{value:dm?new THREE.Vector3(...new THREE.Color().setHSL(theme.hue/360,.88,.15).toArray()):style===2?new THREE.Vector3(.16,.85,.29):crit?new THREE.Vector3(.98,.65,.14):new THREE.Vector3(.93,.1,.2)}};
  const lightning=createLightningTiming();
  const updateLightning=(now:number)=>{
    if(!uniforms.internalLightning.value)return;
    const frame=lightning.advance(now/1000);
    uniforms.lightningPhase.value=frame.phase;uniforms.lightningSeed.value=frame.seed;
  };
  let resinBody:THREE.MeshPhysicalMaterial|undefined;
  const updateResin=()=>{
    if(!resinBody)return;
    const ink=uniforms.resinInk.value>.5,dense=uniforms.resinDensity.value>.5;
    resinBody.transmission=ink ? .95 : dense ? .78 : .98;
    resinBody.attenuationDistance=ink ? (dense?3.6:6) : dense?2.2:6;
    resinBody.color.set(ink?'#ecdfff':dense?'#c3a1dd':'#e9d9ff');
    resinBody.roughness=ink?.045:dense?.07:.055;
    resinBody.envMapIntensity=ink?.16:.025;
    resinBody.specularIntensity=ink?.55:.3;
    resinBody.clearcoat=ink?.22:.06;
  };
  const materials:THREE.Material[]=[];const textures:THREE.Texture[]=[];const geometries:THREE.BufferGeometry[]=[];
  const makeMaterial=(etching?:THREE.Texture)=>{
    // Draw front gold after transmission so refraction cannot duplicate a bright
    // front numeral into the interior. Only its dark backing enters that pass.
    const m=glass?new THREE.ShaderMaterial({defines:gem?{INLAY_ONLY:1}:{},uniforms:{...uniforms,etching:{value:etching??null},engraved:{value:!!etching},metalEdge:{value:(style===2||style===1)&&!etching},thinGoldEdge:{value:style===1&&sides===6&&!crit},numeralsOnly:{value:gem},inlayBacking:{value:false},numeralEmphasis:{value:1}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:true,side:THREE.FrontSide,polygonOffset:gem,polygonOffsetFactor:-1,polygonOffsetUnits:-1}):new THREE.MeshPhysicalMaterial({color:crit?'#d5a636':new THREE.Color().setHSL(theme.hue/360,theme.saturation/100,.065),metalness:.72,roughness:.38,clearcoat:.7,clearcoatRoughness:.16,bumpMap:etching,bumpScale:.045,map:etching,metalnessMap:etching,envMapIntensity:.55});
    materials.push(m);return m;
  };
  const edgeGeo=new THREE.BufferGeometry();
  if(sides===6){
    // Smooth analytic normals across the same rounded profile used by physics.
    const rounded=roundedD6Mesh(5),positions:number[]=[],normals:number[]=[];
    for(const face of rounded.faces.slice(6))for(let j=1;j<face.length-1;j++)for(const i of [face[0],face[j],face[j+1]]){
      positions.push(...rounded.vertices[i]);normals.push(...rounded.normals[i]);
    }
    edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    edgeGeo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  }else{
    // Other polyhedra retain their existing chamfer geometry.
    const hull=new ConvexGeometry(faces.flatMap(f=>f.inset));
    const hp=hull.getAttribute('position'),edgePoints:number[]=[];
    for(let i=0;i<hp.count;i+=3){const tri=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(hp,i+j));
      if(faces.some(f=>tri.every(p=>Math.abs(f.n.dot(p)-f.n.dot(f.c))<.00001)))continue;
      tri.forEach(p=>edgePoints.push(...p.toArray()));
    }
    hull.dispose();edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(edgePoints,3));edgeGeo.computeVertexNormals();
  }
  geometries.push(edgeGeo);
  if(!gem)root.add(new THREE.Mesh(edgeGeo,makeMaterial()));
  const labels=faces.map(f=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=4;textures.push(texture);
    const positions:number[]=[],uv:number[]=[];
    for(let j=1;j<f.inset.length-1;j++)for(const p of [f.inset[0],f.inset[j],f.inset[j+1]]){
      positions.push(...p.toArray());const delta=p.clone().sub(f.c);uv.push(.5+delta.dot(f.u)/(f.radius*2*(sides===4?2.2:1)),.5+delta.dot(f.v)/(f.radius*2*(sides===4?2.2:1)));
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();geometries.push(geo);
    const material=makeMaterial(texture);root.add(new THREE.Mesh(geo,material));
    if(gem){
      const backing=(material as THREE.ShaderMaterial).clone();
      backing.uniforms={...(material as THREE.ShaderMaterial).uniforms,inlayBacking:{value:true}};
      backing.side=THREE.BackSide;backing.transparent=false;
      materials.push(backing);root.add(new THREE.Mesh(geo,backing));
    }
    return {canvas,texture,material};
  });
  if(gem){
    // One closed, refracting volume with opaque gold inlays drawn over it.
    // Transmission bends the rendered tray instead of alpha-blending it flat.
    const pieces=geometries.map(g=>{const c=g.clone();c.deleteAttribute('uv');return c;});
    const bodyGeometry=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());geometries.push(bodyGeometry);
    // Explicit envMap makes this material's intensity control independent of
    // Scene.environmentIntensity, preserving the existing player/tray lighting.
    // Tint mostly by distance through the volume, rather than multiplying two
    // dense purple filters. Small studio reflections preserve the tray detail
    // instead of turning a whole face into an opaque white softbox reflection.
    const resin=new THREE.MeshPhysicalMaterial({color:'#e9d9ff',metalness:0,roughness:.055,
      transmission:.98,opacity:1,ior:1.48,thickness:1.3,attenuationColor:'#8a34c9',attenuationDistance:6,
      specularIntensity:.3,clearcoat:.06,clearcoatRoughness:.12,
      envMap:s.scene.environment,envMapIntensity:.025,dispersion:.12});
    resinBody=resin;updateResin();
    resin.onBeforeCompile=shader=>{
      shader.uniforms.resinEye=uniforms.eye;shader.uniforms.resinTime=uniforms.time;
      shader.uniforms.resinGlow=uniforms.resinGlow;
      shader.uniforms.resinDensity=uniforms.resinDensity;
      shader.uniforms.resinInk=uniforms.resinInk;
      shader.uniforms.resinPlanes=uniforms.planes;shader.uniforms.resinPlaneCount=uniforms.count;
      shader.vertexShader='varying vec3 resinPosition;\nvarying vec3 resinNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nresinPosition=position;resinNormal=normal;');
      shader.fragmentShader=resinCloudDeclarations+resinInkField+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>','#include <transmission_fragment>\n'+resinCloudTransmission);
    };
    resin.customProgramCacheKey=()=> 'dm-resin-clouds-v4';
    materials.push(resin);const body=new THREE.Mesh(bodyGeometry,resin);body.name='purple-resin-volume';root.add(body);
  }
  let lastValue=-1,lastReadable=false;
  const inverseWorld=new THREE.Matrix4(),poseRotation=new THREE.Matrix4();
  return {
    object: root,
    // Approved material defaults; the viewer can toggle effects for comparison.
    setEnchantedAmber(enabled:boolean){uniforms.enchantedAmber.value=enabled&&theme.id==='ranger'&&!crit?1:0;},
    setMossAgate(enabled:boolean){uniforms.mossAgate.value=enabled&&theme.id==='ranger'&&!crit?1:0;},
    setMoltenCracks(enabled:boolean){uniforms.moltenCracks.value=enabled&&theme.id==='fighter'&&!crit?1:0;},
    setInternalLightning(enabled:boolean){uniforms.internalLightning.value=enabled&&theme.id==='sorcerer'&&!crit?1:0;},
    setInnerGlow(strength:number){uniforms.resinGlow.value=dm&&!crit?THREE.MathUtils.clamp(strength,0,1):0;},
    setLiquidInk(enabled:boolean){uniforms.resinInk.value=dm&&!crit&&enabled?1:0;updateResin();},
    setDenseResin(enabled:boolean){
      if(!resinBody)return;uniforms.resinDensity.value=enabled?1:0;
      updateResin();
    },
    resultPosition(target:THREE.Vector3) {
      // Match the numbered surface instead of estimating a height above the body.
      if(sides===4){
        const vertex=vertices.reduce((best,p)=>p.clone().applyQuaternion(root.quaternion).z>best.clone().applyQuaternion(root.quaternion).z?p:best);
        return root.localToWorld(target.copy(vertex));
      }
      const face=faces.reduce((best,f)=>f.n.clone().applyQuaternion(root.quaternion).z>best.n.clone().applyQuaternion(root.quaternion).z?f:best);
      return root.localToWorld(target.copy(face.c));
    },
    setFaceValues(values: number[],fixed=false) {
      labels.forEach(({canvas,texture},id)=>{
        const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,256,256);
        const text=tens?String(values[id]).padStart(2,'0'):String(values[id]);
        c.fillStyle='#151515';c.font=`bold ${dieNumeralFont(text,tens,sides)}px Georgia`;c.textAlign='center';c.textBaseline='middle';
        if(fixed&&sides===4){
          // Conventional tetrahedral numbering: the three faces meeting at a
          // vertex repeat its result. The opposite resting face determines it.
          const f=faces[id];c.font='bold 64px Georgia';
          for(const vertex of source.faces[id]){
            const opposite=source.faces.findIndex(face=>!face.includes(vertex));
            const delta=vertices[vertex].clone().sub(f.c).multiplyScalar(.40);
            const x=128+delta.dot(f.u)/(f.radius*4.4)*256,y=128-delta.dot(f.v)/(f.radius*4.4)*256;
            drawDieNumeral(c,String(values[opposite]),x,y);
          }
        }else drawDieNumeral(c,text,128,134);
        texture.needsUpdate=true;
      });
    },
    updatePose(camera: THREE.Camera, now: number) {
      root.updateMatrixWorld(true);
      uniforms.eye.value.copy(camera.position).applyMatrix4(inverseWorld.copy(root.matrixWorld).invert());
      uniforms.rotation.value.setFromMatrix4(poseRotation.makeRotationFromQuaternion(root.quaternion));
      uniforms.time.value=now/1000;updateLightning(now);
    },
    draw(ctx:CanvasRenderingContext2D,size:number,dpr:number,angles:V3,value:number,now:number,rolling:boolean){
      // Only the separate settled result presentation uses this treatment;
      // physical trays use setFaceValues/updatePose and retain their approved art.
      const readable=gem&&!rolling;
      if((lastValue!==value||lastReadable!==readable) && (!rolling || lastValue===-1||lastReadable)){lastValue=value;lastReadable=readable;labels.forEach(({canvas,texture,material},id)=>{
        const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,256,256);
        // Grain is material-scale and deterministic, so it never flickers.
        if(!glass){for(let k=0;k<1400;k++){const x=(k*73)%256,y=(k*131+Math.floor(k/7))%256;c.fillStyle=k%3?'#dedede':'#aaa';c.fillRect(x,y,1,k%5===0?5:1);}}
        let n=id===0?value:((Math.max(1,value)+id-1)%sides)+1;
        if(tens)n=((Math.floor(value/10)+id)%10)*10;if(ones)n=(value+id)%10;
        const text=tens?String(n).padStart(2,'0'):String(n);
        const font=sides===4?120:readable&&id===0?(text.length>1?164:184):dieNumeralFont(text,tens,sides);
        c.fillStyle='#151515';c.font=`bold ${font}px Georgia`;c.textAlign='center';c.textBaseline='middle';drawDieNumeral(c,text,128,134);
        if(material instanceof THREE.ShaderMaterial)material.uniforms.numeralEmphasis.value=readable?(id===0?1.5:.22):1;
        texture.needsUpdate=true;
      });}
      root.rotation.set(angles[0]+(readable?0:.10),angles[1]-(readable?0:.14),angles[2],'ZYX');root.updateMatrixWorld(true);
      uniforms.eye.value.copy(s.camera.position).applyMatrix4(inverseWorld.copy(root.matrixWorld).invert());
      uniforms.rotation.value.setFromMatrix4(root.matrixWorld);uniforms.time.value=now/1000;updateLightning(now);
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
