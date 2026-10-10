import {lightFalloffGlsl} from '../../../shared/lightFalloff';
import {exploredTerrainBrightness,HEAVY_DARKVISION_MEMORY_BRIGHTNESS,REGULAR_DARKVISION_TERRAIN_BRIGHTNESS} from '../../../shared/terrainLighting';
import {Mesh,PlaneGeometry,ShaderMaterial,TextureLoader,Vector2,Scene,type Texture,type Camera,type WebGLRenderer} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';
import {torchFieldGlsl,type createBattlefieldLighting} from './battlefieldLighting';
/** Read original artwork, before the darkness grade removes its useful detail. */
export function createDarkvisionTerrain(scene:Scene,visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms'],lights:ReturnType<typeof createBattlefieldLighting>['fieldUniforms'],grade:ReturnType<typeof createBattlefieldLighting>['terrainGrade'],depth:{texture:Texture;resolution:Vector2},invalidate:()=>void){
 const entries:{mesh:Mesh;memory:Mesh;texture:Texture;material:ShaderMaterial;memoryMaterial:ShaderMaterial}[]=[];let key='',generation=0,memoryKey='';
 const memoryScene=new Scene();let lastCanvas:HTMLCanvasElement|null=null,memoryVersion=0;
 const memoryBrightness={value:.2};
 const clear=()=>{generation++;memoryKey='';
  if(lastCanvas){lastCanvas.getContext('2d')?.clearRect(0,0,lastCanvas.width,lastCanvas.height);lastCanvas.dataset.ready='false';}
  for(const e of entries){scene.remove(e.mesh);memoryScene.remove(e.memory);e.mesh.geometry.dispose();e.material.dispose();e.memoryMaterial.dispose();e.texture.dispose();}entries.length=0;};
 return {update(settings:EnvironmentPreviewSettings){
  memoryBrightness.value=exploredTerrainBrightness(settings);
  const enabled=!!settings.darkvisionTerrain;
  const tiles=settings.darkvisionTerrain??[];
  const next=JSON.stringify([enabled,!!settings.heavyDarkness,tiles,settings.darkvisionGrid]);if(next===key)return;key=next;clear();if(!enabled)return;
  const version=generation;
  for(const [index,tile] of tiles.entries()){
   const material=new ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...visibility,...lights,...grade,memoryPass:{value:0},memoryBrightness,figureDepth:{value:depth.texture},resolution:{value:depth.resolution},art:{value:null},texel:{value:new Vector2(1/1024,1/1024)},gridSize:{value:settings.darkvisionGrid?.size??0},gridOffset:{value:new Vector2(settings.darkvisionGrid?.x??0,settings.darkvisionGrid?.y??0)}},
    vertexShader:`varying vec2 artUv;varying vec3 world;void main(){artUv=uv;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}${torchFieldGlsl}${lightFalloffGlsl}
     uniform sampler2D art,figureDepth;uniform vec2 texel,resolution,gridOffset;uniform float gridSize,memoryPass,memoryBrightness,gradeOpacity,sceneTintStrength;uniform vec3 gradeColor,sceneTint;varying vec2 artUv;varying vec3 world;
     float lum(vec2 p){return dot(texture2D(art,p).rgb,vec3(.2126,.7152,.0722));}
     void main(){if(memoryPass<.5&&(environmentVisible(world.xz)<.5||texture2D(figureDepth,gl_FragCoord.xy/resolution).r<.999999))discard;
      vec3 illumination=torchIllumination(world.xz);float unlit=1.-lightColorCoverage(max(illumination.r,max(illumination.g,illumination.b)));
      vec4 source=texture2D(art,artUv);float l=dot(source.rgb,vec3(.2126,.7152,.0722)),detail=0.;
      // Regular sight does not need the heavy-darkness contour samples.
      if(memoryPass>.5||${settings.heavyDarkness?'true':'false'}){
       vec2 stepUv=max(texel*2.,fwidth(artUv)*1.5);
       float edge=length(vec2(lum(artUv+vec2(stepUv.x,0.))-lum(artUv-vec2(stepUv.x,0.)),lum(artUv+vec2(0.,stepUv.y))-lum(artUv-vec2(0.,stepUv.y))));
       detail=smoothstep(.025,.22,edge)*.20+smoothstep(.35,.85,l)*.13;
      }
      float grid=0.;if(gridSize>0.){vec2 cell=(world.xz-gridOffset)/gridSize;vec2 d=abs(fract(cell-.5)-.5)/max(fwidth(cell),vec2(.0001));grid=1.-smoothstep(.35,1.15,min(d.x,d.y));}
      float recovery=max(detail,grid*.30);
      if(memoryPass>1.5){
       vec3 remembered=mix(source.rgb,vec3(1.),grid*(80./255.));
       if(memoryPass<2.5)remembered=vec3(dot(remembered,vec3(.2126,.7152,.0722))*memoryBrightness);
       gl_FragColor=vec4(remembered,source.a);
      }else if(memoryPass>.5){
       // The unlit ground grade and darkvision detail, slightly dimmed for memory.
       // Memory contains artwork/grid only: no torches, creatures or weather.
       float alpha=gradeOpacity+sceneTintStrength*(1.-gradeOpacity);
       vec3 tint=(gradeColor*gradeOpacity*(1.-sceneTintStrength)+sceneTint*sceneTintStrength)/max(.001,alpha);
       vec3 ground=mix(source.rgb,linearToOutputTexel(vec4(tint,1.)).rgb,alpha);
       // Softer memory highlights for contours, bright artwork and the grid.
       // Keep the darker ground grade and current-sight recovery unchanged.
       float remembered=dot(mix(ground,vec3(.35),recovery),vec3(.2126,.7152,.0722));
       gl_FragColor=vec4(vec3(remembered*${HEAVY_DARKVISION_MEMORY_BRIGHTNESS}),source.a);
      }else if(${settings.heavyDarkness?'false':'true'}) {
       // Regular sight reveals naturally dark artwork rather than adding pale
       // contour highlights. The shared light mask restores the original lit
       // scene, while the CSS vision grade leaves a small amount of color.
       float brightness=clamp((1.-gradeOpacity)*2.,${REGULAR_DARKVISION_TERRAIN_BRIGHTNESS},1.);
       gl_FragColor=vec4(mix(source.rgb*brightness,vec3(.16),grid*.5),unlit*source.a);
      }else {
       // Preserve the artwork's hue in recovered detail without lifting its
       // brightness. The current-sight overlay keeps its color muted;
       // the memory pass above remains completely grayscale.
       vec3 recovered=mix(vec3(.55),clamp(source.rgb*.55/max(l,.05),0.,1.),.65);
       gl_FragColor=vec4(recovered,recovery*unlit*source.a);
      }
     }`});
   const mesh=new Mesh(new PlaneGeometry(tile.w,tile.h),material);mesh.rotation.x=-Math.PI/2;mesh.position.set(tile.x+tile.w/2,.006,tile.y+tile.h/2);mesh.renderOrder=3+index*.001;mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
   const memoryMaterial=material.clone();
   // Share texture/grade uniforms, but select the terrain-only output for memory.
   memoryMaterial.uniforms={...material.uniforms,memoryPass:{value:1}};
   const memory=new Mesh(mesh.geometry,memoryMaterial);memory.copy(mesh,false);memory.material=memoryMaterial;memory.visible=false;memoryScene.add(memory);
   const texture=new TextureLoader().load(tile.url,loaded=>{if(version!==generation){loaded.dispose();return;}material.uniforms.texel.value.set(1/loaded.image.width,1/loaded.image.height);mesh.visible=memory.visible=true;memoryKey='';invalidate();},undefined,()=>{});
   material.uniforms.art.value=texture;entries.push({mesh,memory,texture,material,memoryMaterial});
  }
 },renderMemory(renderer:WebGLRenderer,camera:Camera,canvas:HTMLCanvasElement|null){
  if(!canvas||!entries.length||entries.some(e=>!e.memory.visible))return;
  const w=renderer.domElement.width,h=renderer.domElement.height;
  const mode=canvas.dataset.mode==='retained'?3:canvas.dataset.mode==='regular'?2:1;
  const next=JSON.stringify([key,w,h,mode,memoryBrightness.value,camera.projectionMatrix.elements,camera.matrixWorld.elements,grade.gradeColor.value.toArray(),grade.gradeOpacity.value,grade.sceneTint.value.toArray(),grade.sceneTintStrength.value]);
  if(canvas===lastCanvas&&next===memoryKey)return;
  lastCanvas=canvas;memoryKey=next;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  for(const entry of entries)entry.memoryMaterial.uniforms.memoryPass.value=mode;
  renderer.render(memoryScene,camera);
  const context=canvas.getContext('2d')!;context.clearRect(0,0,w,h);context.drawImage(renderer.domElement,0,0);
  canvas.dataset.ready='true';
  canvas.dataset.version=String(++memoryVersion);
 },dispose:clear};
}
