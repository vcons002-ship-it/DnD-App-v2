import {CanvasTexture,DoubleSide,Mesh,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector2,type Texture,type WebGLRenderer} from 'three';
import {pointInRing,wallContours} from '../../../shared/wallGeometry';
import type {MapWall} from '../../../shared/mapWalls';
import {groundYScale,perspectiveSlope,type BattlefieldView} from './miniatureProjection';

/** Disposable 2D art test. Original arch pixels sit above figures; the existing
 * body silhouette fades only covered pixels. No raised walls or arch geometry. */
export function createArchArtStudy(renderer:WebGLRenderer,bodyMask:Texture,host:HTMLElement,invalidate:()=>void){
 const scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,0,1),geometry=new PlaneGeometry(2,2);
 const entries:{rings:ReturnType<typeof wallContours>;material:ShaderMaterial;texture:CanvasTexture;fade:number}[]=[];
 let mapId='',disposed=false,last=performance.now(),moving=false;
 const fadeEnabled=new URLSearchParams(location.search).get('archFade')!=='0';
 const load=async()=>{
  const response=await fetch('/uploads/arch-art-study.json');if(!response.ok)throw Error('Missing arch art study');
  const data=await response.json() as {mapId:string;imagePath:string;width:number;height:number;arches:MapWall[]};
  const image=new Image();image.src=data.imagePath;await image.decode();if(disposed)return;
  mapId=data.mapId;
  for(const arch of data.arches){
   const rings=wallContours(arch),canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
   const context=canvas.getContext('2d')!;context.beginPath();
   for(const ring of rings){ring.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();}
   context.clip('evenodd');context.drawImage(image,0,0,data.width,data.height);
   const texture=new CanvasTexture(canvas);
   const material=new ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:DoubleSide,
    uniforms:{art:{value:texture},body:{value:bodyMask},screen:{value:new Vector2(1,1)},resolution:{value:new Vector2(1,1)},mapSize:{value:new Vector2(data.width,data.height)},offset:{value:new Vector2()},scale:{value:1},sy:{value:1},angle:{value:0},slope:{value:0},fade:{value:0}},
    vertexShader:`uniform vec2 screen,mapSize,offset;uniform float scale,sy,angle,slope;varying vec2 artUV;
     void main(){artUV=uv;vec2 p=vec2(uv.x,1.-uv.y)*mapSize;
      vec2 d=offset+p*vec2(scale,scale*sy)-screen*.5;
      float c=cos(angle),s=sin(angle);vec2 r=vec2(c*d.x-s*d.y/sy,s*d.x*sy+c*d.y);
      gl_Position=vec4(r.x*2./screen.x,-r.y*2./screen.y,0.,1.-r.y*slope);}`,
    fragmentShader:`uniform sampler2D art,body;uniform vec2 resolution;uniform float fade;varying vec2 artUV;
     void main(){vec4 pixel=texture2D(art,artUV);vec4 silhouette=texture2D(body,gl_FragCoord.xy/resolution);
      pixel.a*=1.-fade*silhouette.r*silhouette.a;gl_FragColor=pixel;}`});
   const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);entries.push({rings,material,texture,fade:0});
  }
  host.dataset.archArtStudy='ready';host.dataset.archArtCount=String(entries.length);invalidate();
 };
 void load().catch(error=>{if(!disposed){host.dataset.archArtStudy='failed';console.warn('2D arch art study unavailable',error);}});
 return {get animating(){return moving;},
  draw(id:string|undefined,view:BattlefieldView,width:number,height:number,tilt:number,rotation:number,tokens:{x:number;y:number;visible:boolean}[]){
   const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;moving=false;if(id!==mapId||!entries.length)return;
   let active=0;
   for(const entry of entries){
    const under=tokens.some(t=>t.visible&&pointInRing(t,entry.rings[0])&&!entry.rings.slice(1).some(h=>pointInRing(t,h)));
    const target=under&&fadeEnabled?.88:0;entry.fade+=(target-entry.fade)*(1-Math.exp(-dt*16));if(Math.abs(entry.fade-target)>.002)moving=true;if(under)active++;
    const u=entry.material.uniforms;u.screen.value.set(width,height);u.resolution.value.set(renderer.domElement.width,renderer.domElement.height);
    u.offset.value.set(view.x,view.y);u.scale.value=view.scale;u.sy.value=groundYScale(tilt);u.angle.value=rotation*Math.PI/180;u.slope.value=perspectiveSlope(width,height,tilt);u.fade.value=entry.fade;
   }
   const autoClear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(scene,camera);}finally{renderer.autoClear=autoClear;}
   host.dataset.archArtActive=String(active);host.dataset.archArtFade=String(Math.max(...entries.map(e=>e.fade)));
  },
  dispose(){disposed=true;geometry.dispose();for(const entry of entries){entry.texture.dispose();entry.material.dispose();}entries.length=0;},
 };
}
