import {CanvasTexture,Color,DoubleSide,Mesh,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector2,Vector4,type Texture,type WebGLRenderer} from 'three';
import {torchFieldGlsl,type createBattlefieldLighting} from './battlefieldLighting';
import {lightFalloffGlsl} from '../../../shared/lightFalloff';
import {HEAVY_DARKVISION_DESATURATION} from '../../../shared/terrainLighting';
import {pointInRing,wallContours} from '../../../shared/wallGeometry';
import type {MapState,MapImage} from '../../../shared/types';
import {groundYScale,perspectiveSlope,type BattlefieldView} from './miniatureProjection';

/** Original map pixels over figures beneath saved arches. Cropped textures are
 * cached across movement snapshots; no hidden map art is drawn above empty fog. */
export function createArchArtLayer(renderer:WebGLRenderer,bodyMask:Texture,host:HTMLElement,invalidate:()=>void){
 const scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,0,1),geometry=new PlaneGeometry(2,2);
 const entries:{rings:ReturnType<typeof wallContours>;material:ShaderMaterial;texture:CanvasTexture;fade:number}[]=[];
 let mapId='',disposed=false,last=performance.now(),moving=false,key='',generation=0;
 const clear=()=>{for(const entry of entries){entry.texture.dispose();entry.material.dispose();}entries.length=0;scene.clear();};
 const load=async(map:MapState,tiles:MapImage[],version:number)=>{
  const arches=(map.walls??[]).filter(w=>w.arch);
  const sources=[...(map.imagePath?[{imagePath:map.imagePath,x:0,y:0,w:0,h:0,z:-Infinity}]:[]),...tiles.slice().sort((a,b)=>a.z-b.z)];
  const images=await Promise.all(sources.map(async(source)=>{const image=new Image();image.src=source.imagePath;await image.decode();return {source,image};}));
  if(disposed||version!==generation)return;
  mapId=map.id;
  for(const arch of arches){
   const rings=wallContours(arch),points=rings.flat(),x=Math.floor(Math.min(...points.map(p=>p.x)))-1,y=Math.floor(Math.min(...points.map(p=>p.y)))-1;
   const w=Math.ceil(Math.max(...points.map(p=>p.x)))-x+1,h=Math.ceil(Math.max(...points.map(p=>p.y)))-y+1;
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const context=canvas.getContext('2d')!;context.translate(-x,-y);context.beginPath();
   for(const ring of rings){ring.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();}
   context.clip('evenodd');
   for(const {source,image} of images)context.drawImage(image,source.x,source.y,source.w||image.naturalWidth,source.h||image.naturalHeight);
   const texture=new CanvasTexture(canvas);
   const material=new ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:DoubleSide,
    uniforms:{art:{value:texture},body:{value:bodyMask},screen:{value:new Vector2(1,1)},resolution:{value:new Vector2(1,1)},mapSize:{value:new Vector2(w,h)},mapOrigin:{value:new Vector2(x,y)},offset:{value:new Vector2()},scale:{value:1},sy:{value:1},angle:{value:0},slope:{value:0},fade:{value:0},torchField:{value:texture},torchBounds:{value:new Vector4(0,0,1,1)},stormFlash:{value:0},gradeColor:{value:new Color()},gradeOpacity:{value:0},sceneTint:{value:new Color(0xffffff)},sceneTintStrength:{value:0},heavy:{value:0},litGrade:{value:0}},
    vertexShader:`uniform vec2 screen,mapSize,mapOrigin,offset;uniform float scale,sy,angle,slope;varying vec2 artUV;
     void main(){artUV=uv;vec2 p=mapOrigin+vec2(uv.x,1.-uv.y)*mapSize;
      vec2 d=offset+p*vec2(scale,scale*sy)-screen*.5;
      float c=cos(angle),s=sin(angle);vec2 r=vec2(c*d.x-s*d.y/sy,s*d.x*sy+c*d.y);
      gl_Position=vec4(r.x*2./screen.x,-r.y*2./screen.y,0.,1.-r.y*slope);}`,
    fragmentShader:`${torchFieldGlsl}${lightFalloffGlsl}
     uniform sampler2D art,body;uniform vec2 resolution,mapSize,mapOrigin;uniform float fade,gradeOpacity,sceneTintStrength,heavy,litGrade;uniform vec3 gradeColor,sceneTint;varying vec2 artUV;
     void main(){vec4 pixel=texture2D(art,artUV);vec4 silhouette=texture2D(body,gl_FragCoord.xy/resolution);
      if(litGrade>.5){
       vec3 illumination=torchIllumination(mapOrigin+vec2(artUV.x,1.-artUV.y)*mapSize);float strength=max(illumination.r,max(illumination.g,illumination.b));float coverage=lightColorCoverage(strength);
       float alpha=mix(gradeOpacity,.10,coverage);vec3 color=mix(gradeColor,illumination/max(.001,strength)*.30,coverage);
       float tintAlpha=sceneTintStrength*(1.-coverage*.75);float combined=alpha+tintAlpha*(1.-alpha);
       color=(color*alpha*(1.-tintAlpha)+sceneTint*tintAlpha)/max(.001,combined);
       pixel.rgb=mix(pixel.rgb,linearToOutputTexel(vec4(color,1.)).rgb,combined);
       pixel.rgb=mix(pixel.rgb,vec3(dot(pixel.rgb,vec3(.2126,.7152,.0722))),${HEAVY_DARKVISION_DESATURATION}*heavy*(1.-coverage));
      }
      pixel.a*=silhouette.r*silhouette.a*(1.-fade);gl_FragColor=pixel;}`});
   const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);entries.push({rings,material,texture,fade:0});
  }
  host.dataset.archArtStatus='ready';host.dataset.archArtCount=String(entries.length);invalidate();
 };
 return {get animating(){return moving;},get hasArt(){return !!entries.length;},
  sync(map:MapState|null|undefined,tiles:MapImage[]=[]){
   const next=JSON.stringify([map?.id,map?.imagePath,tiles.map(t=>[t.imagePath,t.x,t.y,t.w,t.h,t.z]),map?.walls?.filter(w=>w.arch)]);
   if(key===next)return;key=next;const version=++generation;clear();mapId='';host.dataset.archArtCount='0';host.dataset.archArtActive='0';host.dataset.archArtFade='0';
   if(!map?.walls?.some(w=>w.arch)){host.dataset.archArtStatus='empty';return;}
   host.dataset.archArtStatus='loading';
   void load(map,tiles,version).catch(error=>{if(!disposed&&version===generation){clear();host.dataset.archArtStatus='failed';console.warn('Arch map art unavailable',error);}});
  },
  draw(id:string|undefined,view:BattlefieldView,width:number,height:number,tilt:number,rotation:number,tokens:{x:number;y:number;visible:boolean}[],lighting?:ReturnType<typeof createBattlefieldLighting>,heavy=false){
   const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;moving=false;if(id!==mapId||!entries.length)return;
   let active=0;
   for(const entry of entries){
    const under=tokens.some(t=>t.visible&&pointInRing(t,entry.rings[0])&&!entry.rings.slice(1).some(h=>pointInRing(t,h)));
    // Retain more actual arch stone over the figure in overhead view, where
    // there is no perspective cue that the figure is underneath it.
    const target=under?.58+.20*Math.min(1,Math.max(0,tilt)/45):0;entry.fade+=(target-entry.fade)*(1-Math.exp(-dt*16));if(Math.abs(entry.fade-target)>.002)moving=true;if(under)active++;const mesh=scene.children[entries.indexOf(entry)];mesh.visible=under||entry.fade>.002;
    const u=entry.material.uniforms;u.screen.value.set(width,height);u.resolution.value.set(renderer.domElement.width,renderer.domElement.height);
    u.offset.value.set(view.x,view.y);u.scale.value=view.scale;u.sy.value=groundYScale(tilt);u.angle.value=rotation*Math.PI/180;u.slope.value=perspectiveSlope(width,height,tilt);u.fade.value=entry.fade;
    u.litGrade.value=lighting?1:0;u.heavy.value=heavy?1:0;
    if(lighting){for(const [key,uniform] of Object.entries({...lighting.fieldUniforms,...lighting.terrainGrade}))u[key]=uniform;}
   }
   const autoClear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(scene,camera);}finally{renderer.autoClear=autoClear;}
   host.dataset.archArtActive=String(active);host.dataset.archArtFade=String(Math.max(...entries.map(e=>e.fade)));
  },
  dispose(){disposed=true;generation++;geometry.dispose();clear();},
 };
}
