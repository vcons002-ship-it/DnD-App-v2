import {lightFalloffGlsl} from '../../../shared/lightFalloff';
import {Mesh,PlaneGeometry,ShaderMaterial,TextureLoader,Vector2,type Scene,type Texture} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';
import {torchFieldGlsl,type createBattlefieldLighting} from './battlefieldLighting';
/** Read original artwork, before the darkness grade removes its useful detail. */
export function createDarkvisionTerrain(scene:Scene,visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms'],lights:ReturnType<typeof createBattlefieldLighting>['fieldUniforms'],depth:{texture:Texture;resolution:Vector2},invalidate:()=>void){
 const entries:{mesh:Mesh;texture:Texture;material:ShaderMaterial}[]=[];let key='',generation=0;
 const clear=()=>{generation++;for(const e of entries){scene.remove(e.mesh);e.mesh.geometry.dispose();e.material.dispose();e.texture.dispose();}entries.length=0;};
 return {update(settings:EnvironmentPreviewSettings){
  const enabled=!!settings.darkvisionTerrain&&settings.heavyDarkness;
  const tiles=settings.darkvisionTerrain??[];
  const next=JSON.stringify([enabled,tiles,settings.darkvisionGrid]);if(next===key)return;key=next;clear();if(!enabled)return;
  const version=generation;
  for(const [index,tile] of tiles.entries()){
   const material=new ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...visibility,...lights,figureDepth:{value:depth.texture},resolution:{value:depth.resolution},art:{value:null},texel:{value:new Vector2(1/1024,1/1024)},gridSize:{value:settings.darkvisionGrid?.size??0},gridOffset:{value:new Vector2(settings.darkvisionGrid?.x??0,settings.darkvisionGrid?.y??0)}},
    vertexShader:`varying vec2 artUv;varying vec3 world;void main(){artUv=uv;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}${torchFieldGlsl}${lightFalloffGlsl}
     uniform sampler2D art,figureDepth;uniform vec2 texel,resolution,gridOffset;uniform float gridSize;varying vec2 artUv;varying vec3 world;
     float lum(vec2 p){return dot(texture2D(art,p).rgb,vec3(.2126,.7152,.0722));}
     void main(){if(environmentVisible(world.xz)<.5||texture2D(figureDepth,gl_FragCoord.xy/resolution).r<.999999)discard;
      vec3 illumination=torchIllumination(world.xz);float unlit=1.-lightColorCoverage(max(illumination.r,max(illumination.g,illumination.b)));
      vec2 stepUv=max(texel*2.,fwidth(artUv)*1.5);float l=lum(artUv);
      float edge=length(vec2(lum(artUv+vec2(stepUv.x,0.))-lum(artUv-vec2(stepUv.x,0.)),lum(artUv+vec2(0.,stepUv.y))-lum(artUv-vec2(0.,stepUv.y))));
      float detail=smoothstep(.025,.22,edge)*.20+smoothstep(.35,.85,l)*.13;
      float grid=0.;if(gridSize>0.){vec2 cell=(world.xz-gridOffset)/gridSize;vec2 d=abs(fract(cell-.5)-.5)/max(fwidth(cell),vec2(.0001));grid=1.-smoothstep(.35,1.15,min(d.x,d.y));}
      float alpha=max(detail,grid*.30)*unlit*texture2D(art,artUv).a;
      gl_FragColor=vec4(vec3(.55),alpha);
     }`});
   const mesh=new Mesh(new PlaneGeometry(tile.w,tile.h),material);mesh.rotation.x=-Math.PI/2;mesh.position.set(tile.x+tile.w/2,.006,tile.y+tile.h/2);mesh.renderOrder=3+index*.001;mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
   const texture=new TextureLoader().load(tile.url,loaded=>{if(version!==generation){loaded.dispose();return;}material.uniforms.texel.value.set(1/loaded.image.width,1/loaded.image.height);mesh.visible=true;invalidate();},undefined,()=>{});
   material.uniforms.art.value=texture;entries.push({mesh,texture,material});
  }
 },dispose:clear};
}
