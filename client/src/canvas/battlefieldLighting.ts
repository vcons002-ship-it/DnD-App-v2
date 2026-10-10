import {lightFalloffGlsl,LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {wallVisibilityPolygon} from '../../../shared/mapWalls';
import {NEUTRAL_MINIATURE_LIGHTING} from './miniatureLightingDefaults';
import {
  AdditiveBlending, CustomBlending, OneFactor, BoxGeometry, BufferGeometry, Float32BufferAttribute, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, HalfFloatType, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, TorusGeometry,
  PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget,
  type DirectionalLight, type HemisphereLight, type Texture, type Vector2, type WebGLRenderer,
} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';
import type {TorchLight} from './miniatureTorchLighting';
import {stormLightningAt} from '../../../shared/stormLighting';
import {localShadowGlsl,type createLocalLightShadows} from './localLightShadows';
import {localCreatureShadowStrength} from './creatureShadowStyle';
import {terrainDarknessOpacity} from '../../../shared/terrainLighting';
import {mapLightColorHex} from '../../../shared/mapEnvironment';

const palettes={day:{color:0x1c2230,opacity:0,...NEUTRAL_MINIATURE_LIGHTING},dusk:{color:0x351c2b,opacity:.32,ambient:.8,key:1.65,reflection:.65},night:{color:0x0a142b,opacity:.73,ambient:.30,key:.42,reflection:.20},dungeon:{color:0x100e18,opacity:.84,ambient:.16,key:.15,reflection:.11}};
const lightningColor=new Color(0xd7e7ff);
export type CarriedLanternLight={id:string;x:number;y:number;height:number;fixtureX?:number;fixtureY?:number;fixtureHeight:number;facing:number};
export const torchFieldGlsl=`
  uniform sampler2D torchField;
  uniform vec4 torchBounds;
  uniform float stormFlash;
  vec4 torchFieldAt(vec2 point){
    vec2 uv=(point-torchBounds.xy)/torchBounds.zw;
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);
    return texture2D(torchField,uv);
  }
  vec3 torchIllumination(vec2 point){return torchFieldAt(point).rgb;}
`;

/** All sources splat into a bounded light field; there is no map-wide light-count limit. */
export function createBattlefieldLighting(scene:Scene,key:DirectionalLight,ambient:HemisphereLight|undefined,visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms'],depth:{texture:Texture;resolution:Vector2},shadowUniforms:ReturnType<typeof createLocalLightShadows>['uniforms']){
  const colors=new Map<string,Color>();
  const sourceColor=(value:unknown)=>{
    const hex=mapLightColorHex(value);let color=colors.get(hex);
    if(!color){if(colors.size>=64)colors.clear();color=new Color(hex);colors.set(hex,color);}
    return color;
  };
  const original={key:key.intensity,color:key.color.clone(),ambient:ambient?.intensity??NEUTRAL_MINIATURE_LIGHTING.ambient,sky:ambient?.color.clone()??new Color(0xffffff),ground:ambient?.groundColor.clone()??new Color(0xffffff),reflection:scene.environmentIntensity};
  const field=new WebGLRenderTarget(512,512,{type:HalfFloatType,depthBuffer:false,stencilBuffer:false});
  const fieldUniforms={torchField:{value:field.texture},torchBounds:{value:new Vector4()},stormFlash:{value:0}};
  const uniforms={...visibility,...fieldUniforms,figureDepth:{value:depth.texture},resolution:{value:depth.resolution},gradeColor:{value:new Color()},gradeOpacity:{value:0},sceneTint:{value:new Color(0xffffff)},sceneTintStrength:{value:0},wetness:{value:0},surfaceTime:{value:0},surfaceScale:{value:12.8},wetLight:{value:1}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,uniforms,
    vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}${torchFieldGlsl}${lightFalloffGlsl}
      varying vec3 world;uniform sampler2D figureDepth;uniform vec2 resolution;uniform vec3 gradeColor;uniform float gradeOpacity;
      uniform float wetness,surfaceTime,surfaceScale,wetLight,sceneTintStrength;uniform vec3 sceneTint;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){if(environmentVisible(world.xz)<.5||texture2D(figureDepth,gl_FragCoord.xy/resolution).r<.999999)discard;
        vec4 lightField=torchFieldAt(world.xz);vec3 illumination=lightField.rgb;float strength=max(illumination.r,max(illumination.g,illumination.b));
        float coverage=lightColorCoverage(strength);vec3 tint=illumination/max(.001,strength);
        float alpha=mix(gradeOpacity,.10,coverage);vec3 color=mix(gradeColor,tint*.30,coverage);
        float tintAlpha=sceneTintStrength*(1.-coverage*.75);
        float tintedAlpha=alpha+tintAlpha*(1.-alpha);
        color=(color*alpha*(1.-tintAlpha)+sceneTint*tintAlpha)/max(.001,tintedAlpha);alpha=tintedAlpha;
        if(wetness>0.){
          vec2 p=world.xz/surfaceScale;
          float wetPatch=noise(p*.21)*.65+noise(p*.59)*.35;
          float puddle=smoothstep(.43,.68,wetPatch)*wetness;
          vec3 normal=normalize(vec3(sin(p.x*2.3+surfaceTime*.7)*.035,1.,cos(p.y*2.1-surfaceTime*.6)*.035));
          vec3 halfway=normalize(normalize(cameraPosition-world)+normalize(vec3(-.25,1.,.25)));
          float sheen=pow(max(0.,dot(normal,halfway)),55.);
          float wetAlpha=puddle*(.16+sheen*.28);
          vec3 wetColor=mix(vec3(.035,.05,.065),vec3(.48,.59,.69)*(wetLight+stormFlash),sheen)+tint*coverage*.13;
          float combined=alpha+wetAlpha*(1.-alpha);
          color=(color*alpha*(1.-wetAlpha)+wetColor*wetAlpha)/max(.001,combined);alpha=combined;
        }
        alpha=mix(alpha,.34,stormFlash*.9);color=mix(color,vec3(.67,.76,.9),stormFlash*.85);
        // Bright lantern coverage saturates near the source. Preserve readable
        // creature shadows there by compositing the blocked fraction separately.
        // Additional lights fill the shadow through the summed irradiance field.
        float shade=clamp(lightField.a/max(.001,strength+lightField.a),0.,${localCreatureShadowStrength})*coverage*(1.-stormFlash);
        if(alpha<=0.&&shade<=0.)discard; // Neutral day contributes no color at all.
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
        // Alpha blending happens in output space. Apply the neutral shadow after
        // color conversion; doing it before conversion lifts the dark map pixels
        // into a brown veil instead of darkening the existing floor artwork.
        float shadedAlpha=alpha+shade*(1.-alpha);
        gl_FragColor.rgb*=alpha*(1.-shade)/max(.001,shadedAlpha);
        gl_FragColor.a=shadedAlpha;
      }`});
  // Existing figure depth avoids coplanar ground z-fighting and leaves bodies lit by PBR.
  const plane=new Mesh(new PlaneGeometry(1,1),material);plane.rotation.x=-Math.PI/2;plane.renderOrder=2;plane.frustumCulled=false;scene.add(plane);
  const fieldScene=new Scene(),fieldCamera=new OrthographicCamera(-1,1,1,-1,0,1),fieldClearColor=new Color();
  const quad=new PlaneGeometry(2,2),fieldGeometry=new InstancedBufferGeometry();
  fieldGeometry.index=quad.index;fieldGeometry.attributes=quad.attributes;
  const wallGeometryMode={value:0};
  const fieldMaterial=new ShaderMaterial({uniforms:{...fieldUniforms,...shadowUniforms,wallGeometryMode},transparent:true,blending:CustomBlending,blendSrc:OneFactor,blendDst:OneFactor,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:`attribute vec4 source;attribute vec4 radiance;attribute float shadowSlot;uniform float wallGeometryMode;uniform vec4 torchBounds;varying vec2 world;varying vec4 lightSource;varying vec4 lightRadiance;varying float sourceShadow;
      void main(){sourceShadow=shadowSlot;lightSource=source;lightRadiance=radiance;world=wallGeometryMode>.5?position.xy:source.xz+position.xy*source.w*${LIGHT_SPILL_MULTIPLIER.toFixed(1)};
        gl_Position=vec4((world-torchBounds.xy)/torchBounds.zw*2.-1.,0.,1.);}`,
    fragmentShader:`${lightFalloffGlsl}${localShadowGlsl}
 varying vec2 world;varying vec4 lightSource;varying vec4 lightRadiance;varying float sourceShadow;
      void main(){float d=length(vec3(world-lightSource.xz,lightSource.y));float radius=lightSource.w;
        float irradiance=sourceShadow<-1.5?spellEmissionIrradiance(d,radius,lightRadiance.w):lightIrradiance(d,radius,lightRadiance.w);
        float visible=localLightVisibility(sourceShadow,vec3(world.x,.1,world.y),${localCreatureShadowStrength});
        float blocked=(1.-visible)*irradiance*max(lightRadiance.r,max(lightRadiance.g,lightRadiance.b));
        gl_FragColor=vec4(lightRadiance.rgb*irradiance*visible,blocked);}`});
  const splats=new Mesh(fieldGeometry,fieldMaterial);splats.frustumCulled=false;fieldScene.add(splats);
  const wallSplats=new Mesh(new BufferGeometry(),fieldMaterial);wallSplats.frustumCulled=false;wallSplats.visible=false;fieldScene.add(wallSplats);
  let wallGeometryKey='',vertexSources:number[]=[];
  let lastWalls:EnvironmentPreviewSettings['walls'],wallKey='';
  let nominalRadii=new Map<string,number>();
  const lightPolygons=new Map<string,{key:string;points:{x:number;y:number}[]}>();
  function updateWallField(){
    const walls=settings.walls??[];
    wallGeometryMode.value=walls.length?1:0;splats.visible=!walls.length;wallSplats.visible=!!walls.length;
    if(!walls.length)return;
    if(lastWalls!==settings.walls){lastWalls=settings.walls;wallKey=JSON.stringify(walls);}
    const radiusFor=(l:TorchLight)=>(l.transient?l.radius:(l.carried?20:nominalRadii.get(l.id)??20)*(settings.pixelsPerFoot??12.8))*LIGHT_SPILL_MULTIPLIER*1.2;
    const positions:number[]=[],indices:number[]=[];
    const next=JSON.stringify([wallKey,lights.map(l=>[l.id,l.x,l.y,radiusFor(l)])]);
    if(next!==wallGeometryKey){
      wallGeometryKey=next;
      const ids=new Set(lights.map(l=>l.id));for(const id of lightPolygons.keys())if(!ids.has(id))lightPolygons.delete(id);
      lights.forEach((l,index)=>{
        const radius=radiusFor(l);
        const cacheKey=`${wallKey}:${l.x},${l.y},${radius}`;
        let cached=lightPolygons.get(l.id);
        if(cached?.key!==cacheKey){cached={key:cacheKey,points:wallVisibilityPolygon(l,walls,radius)};lightPolygons.set(l.id,cached);}
        cached.points.forEach((p,i)=>{
          const q=cached.points[(i+1)%cached.points.length];
          positions.push(l.x,l.y,0,p.x,p.y,0,q.x,q.y,0);indices.push(index,index,index);
        });
      });
      // Reuse GPU buffers while a carried light moves; only grow their capacity.
      if((wallSplats.geometry.getAttribute('position')?.count??0)<indices.length){
        const capacity=2**Math.ceil(Math.log2(Math.max(1,indices.length)));
        const geometry=new BufferGeometry();
        geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(capacity*3),3).setUsage(DynamicDrawUsage));
        geometry.setAttribute('source',new Float32BufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage));
        geometry.setAttribute('radiance',new Float32BufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage));
        geometry.setAttribute('shadowSlot',new Float32BufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));
        wallSplats.geometry.dispose();wallSplats.geometry=geometry;
      }
      const points=wallSplats.geometry.getAttribute('position');
      if(points){(points.array as Float32Array).set(positions);points.needsUpdate=true;}
      wallSplats.geometry.setDrawRange(0,indices.length);vertexSources=indices;
    }
    const sources=wallSplats.geometry.getAttribute('source'),radiances=wallSplats.geometry.getAttribute('radiance');
    if(!sources||!radiances)return;
    vertexSources.forEach((index,i)=>{const l=lights[index];sources.setXYZW(i,l.x,l.height,l.y,l.radius);radiances.setXYZW(i,l.color.x,l.color.y,l.color.z,l.strength);});
    sources.needsUpdate=true;radiances.needsUpdate=true;
  }
  const wood=new MeshStandardMaterial({color:0x51331d,roughness:.83,emissive:0x331609,emissiveIntensity:.13});
  const iron=new MeshStandardMaterial({color:0x282321,metalness:.72,roughness:.48,emissive:0x5e2209,emissiveIntensity:.25});
  const flame=new ShaderMaterial({transparent:true,blending:AdditiveBlending,depthWrite:false,toneMapped:false,
    uniforms:{flameTime:{value:0},...visibility},
    vertexShader:`uniform float flameTime;varying vec3 world;varying vec3 local;varying vec3 fireTint;
      void main(){local=position;
        #ifdef USE_INSTANCING_COLOR
          fireTint=instanceColor;
        #else
          fireTint=vec3(1.,.44,.08);
        #endif
        vec3 p=position;float seed=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
        p.x+=sin(flameTime*9.+p.y*6.+seed)*.15*max(0.,p.y+.5);
        p.z+=sin(flameTime*6.7+p.y*8.+seed)*.12*max(0.,p.y+.5);
        world=(modelMatrix*instanceMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}varying vec3 world;varying vec3 local;varying vec3 fireTint;
      void main(){if(environmentVisible(world.xz)<.5)discard;
        vec3 color=mix(fireTint*1.7,vec3(1.,.95,.70),clamp((.35-local.y)*1.6,0.,1.));
        gl_FragColor=vec4(color,.94);}`});
  const shaftGeometry=new CylinderGeometry(.055,.075,1,8),cupGeometry=new CylinderGeometry(.16,.09,.25,10),flameGeometry=new ConeGeometry(.5,1,9,3);
  const lanternGeometry=new BoxGeometry(1,1,1),handleGeometry=new TorusGeometry(.14,.03,5,12);
  const bronze=new MeshStandardMaterial({color:0x5e4929,metalness:.68,roughness:.35,emissive:0x7a360c,emissiveIntensity:.25});
  const glow=new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85,depthWrite:false,toneMapped:false});
  const fixtureColor=new Color(),warmLanternColor=new Color(0xffc768);
  let capacity=0,shafts:InstancedMesh,cups:InstancedMesh,flames:InstancedMesh,frames:InstancedMesh,windows:InstancedMesh,handles:InstancedMesh;
  let sourceAttribute:InstancedBufferAttribute,radianceAttribute:InstancedBufferAttribute,shadowAttribute:InstancedBufferAttribute;
  const matrix=new Matrix4();
  function ensureCapacity(count:number){
    if(capacity>=Math.max(1,count))return;
    capacity=2**Math.ceil(Math.log2(Math.max(16,count)));
    for(const mesh of [shafts,cups,flames,frames,windows,handles])if(mesh){scene.remove(mesh);mesh.dispose();}
    shafts=new InstancedMesh(shaftGeometry,wood,capacity);cups=new InstancedMesh(cupGeometry,iron,capacity);flames=new InstancedMesh(flameGeometry,flame,capacity);
    flames.setColorAt(0,new Color(0xffb258));
    frames=new InstancedMesh(lanternGeometry,bronze,capacity*6);windows=new InstancedMesh(lanternGeometry,glow,capacity);handles=new InstancedMesh(handleGeometry,bronze,capacity);
    shafts.name='3d-torch-shafts';cups.name='3d-torch-baskets';flames.name='3d-torch-flames';
    frames.name='waist-lantern-frames';windows.name='waist-lantern-glass';handles.name='waist-lantern-belt-handles';
    for(const mesh of [shafts,cups,flames,frames,windows,handles]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(DynamicDrawUsage);scene.add(mesh);}
    for(const mesh of [shafts,cups,frames,handles])mesh.layers.enable(1);
    sourceAttribute=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
    radianceAttribute=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
    fieldGeometry.setAttribute('source',sourceAttribute);fieldGeometry.setAttribute('radiance',radianceAttribute);
    shadowAttribute=new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage);fieldGeometry.setAttribute('shadowSlot',shadowAttribute);
  }
  let settings:EnvironmentPreviewSettings,carried:CarriedLanternLight[]=[],lights:TorchLight[]=[],transient:TorchLight[]=[],time=0;
  const baseLight={key:original.key,ambient:original.ambient,reflection:original.reflection,color:original.color.clone()};
  const restore=()=>{key.intensity=original.key;key.color.copy(original.color);if(ambient){ambient.intensity=original.ambient;ambient.color.copy(original.sky);ambient.groundColor.copy(original.ground);}scene.environmentIntensity=original.reflection;};
  const phase=(id:string)=>{let hash=0;for(let i=0;i<id.length;i++)hash=(hash*31+id.charCodeAt(i))|0;return hash*.013;};
  const tick=(seconds:number)=>{
    time=seconds;if(!settings)return;
    // A zero time is the renderer's reduced-motion path: suppress flashes too.
    const flash=plane.visible&&settings.lightning&&settings.weather==='rain'&&seconds>0?stormLightningAt(Date.now()/1000):0;
    fieldUniforms.stormFlash.value=flash;uniforms.surfaceTime.value=seconds;
    if(plane.visible){
      key.intensity=baseLight.key+flash*3.5;key.color.copy(baseLight.color).lerp(lightningColor,flash);
      if(ambient)ambient.intensity=baseLight.ambient+flash*1.1;
      scene.environmentIntensity=baseLight.reflection+flash*.45;
    }
    const ppf=settings.pixelsPerFoot??12.8;
    const sources=[...(settings.lights??[]).map(l=>({...l,height:l.heightFt*ppf,fixtureHeight:l.heightFt*ppf,carried:false,facing:0})),
      ...carried.map(l=>({...l,radiusFt:20,intensity:.85,color:'warm' as const,flicker:true,visibleTorch:false,fixture:'lantern' as const,carried:true}))];
    lights=plane.visible?sources.map(source=>{
      const seed=phase(source.id),f=Math.sin(time*6.3+seed)*.10+Math.sin(time*11.1+seed*3)*.06+Math.sin(time*2.7+seed)*.08;
      const color=sourceColor(source.color);
      return {id:source.id,x:source.x,y:source.y,height:source.height,fixtureHeight:source.fixtureHeight,radius:source.radiusFt*ppf*(source.flicker?1+f*.28:1),
        strength:source.intensity*(source.flicker?1+f:1),nominalRadius:source.radiusFt*ppf,nominalStrength:source.intensity,color:new Vector3(color.r,color.g,color.b),visibleTorch:!!source.visibleTorch,fixture:source.fixture,carried:source.carried,facing:source.facing,fixtureX:'fixtureX' in source?source.fixtureX:source.x,fixtureY:'fixtureY' in source?source.fixtureY:source.y};
    }):[];
    if(plane.visible)lights.push(...transient);
    ensureCapacity(lights.length);let visible=0,lanterns=0;
    lights.forEach((light,i)=>{
      sourceAttribute.setXYZW(i,light.x,light.height,light.y,light.radius);
      radianceAttribute.setXYZW(i,light.color.x,light.color.y,light.color.z,light.strength);
      if(light.carried||(light.visibleTorch&&light.fixture==='lantern')){
        const size=ppf*(light.carried?.8:1.2),angle=light.facing??0,c=Math.cos(angle),s=Math.sin(angle);
        const part=(mesh:InstancedMesh,index:number,x:number,y:number,z:number,w:number,h:number,d:number)=>{
          matrix.makeRotationY(angle).scale(new Vector3(w*size,h*size,d*size));
          matrix.setPosition((light.fixtureX??light.x)+(x*c+z*s)*size,(light.fixtureHeight??light.height)+y*size,(light.fixtureY??light.y)+(-x*s+z*c)*size);mesh.setMatrixAt(index,matrix);
        };
        part(windows,lanterns,0,0,0,.48,.73,.32);
        fixtureColor.setRGB(light.color.x,light.color.y,light.color.z);
        if(fixtureColor.equals(sourceColor('warm')))fixtureColor.copy(warmLanternColor);
        windows.setColorAt(lanterns,fixtureColor.multiplyScalar(.85+light.strength*.15));
        part(frames,lanterns*6,0,.40,0,.64,.09,.47);part(frames,lanterns*6+1,0,-.40,0,.64,.09,.47);
        let corner=2;for(const x of [-.27,.27])for(const z of [-.18,.18])part(frames,lanterns*6+corner++,x,0,z,.055,.8,.055);
        part(handles,lanterns,0,.58,0,1,1,1);lanterns++;return;
      }
      if(!light.visibleTorch)return;
      const length=Math.max(.3*ppf,light.height-.35*ppf);
      const top=light.height-.34*ppf;
      matrix.makeScale(ppf,length,ppf).setPosition(light.x,top-length/2,light.y);shafts.setMatrixAt(visible,matrix);
      matrix.makeScale(ppf,ppf,ppf).setPosition(light.x,top,light.y);cups.setMatrixAt(visible,matrix);
      matrix.makeScale(ppf*.62,ppf*1.18*(.9+light.strength*.1),ppf*.62).setPosition(light.x,light.height+.12*ppf,light.y);flames.setMatrixAt(visible,matrix);
      flames.setColorAt(visible,new Color().setRGB(light.color.x,light.color.y,light.color.z));
      visible++;
    });
    fieldGeometry.instanceCount=lights.length;sourceAttribute.needsUpdate=true;radianceAttribute.needsUpdate=true;updateWallField();
    for(const mesh of [shafts,cups,flames]){mesh.count=visible;mesh.visible=plane.visible;mesh.instanceMatrix.needsUpdate=true;}
    frames.count=lanterns*6;windows.count=handles.count=lanterns;
    for(const mesh of [frames,windows,handles]){mesh.visible=plane.visible;mesh.instanceMatrix.needsUpdate=true;}
    if(windows.instanceColor)windows.instanceColor.needsUpdate=true;
    if(flames.instanceColor)flames.instanceColor.needsUpdate=true;
    flame.uniforms.flameTime.value=time;
  };
  return {fieldUniforms,terrainGrade:{gradeColor:uniforms.gradeColor,gradeOpacity:uniforms.gradeOpacity,sceneTint:uniforms.sceneTint,sceneTintStrength:uniforms.sceneTintStrength},update(next:EnvironmentPreviewSettings){
    settings=next;nominalRadii=new Map((next.lights??[]).map(l=>[l.id,l.radiusFt]));const enabled=next.enabled,preset=palettes[next.lighting??'day'];
    const level=(next.lightLevel??1)*(next.heavyDarkness?.10:1);
    plane.visible=enabled;plane.position.set((next.mapX??0)+next.mapWidth/2,.004,(next.mapY??0)+next.mapHeight/2);plane.scale.set(next.mapWidth,next.mapHeight,1);
    fieldUniforms.torchBounds.value.set(next.mapX??0,next.mapY??0,next.mapWidth,next.mapHeight);
    const maxSize=next.mistQuality==='low'||next.mistQuality==='off'?512:1024,ratio=next.mapWidth/next.mapHeight;
    field.setSize(Math.max(1,Math.round(maxSize*Math.min(1,ratio))),Math.max(1,Math.round(maxSize*Math.min(1,1/ratio))));
    uniforms.gradeColor.value.set(next.heavyDarkness?0x010205:preset.color);
    uniforms.gradeOpacity.value=terrainDarknessOpacity(next,!!next.dmVisibility);
    uniforms.wetness.value=next.groundWetness??0;uniforms.surfaceScale.value=next.pixelsPerFoot??12.8;uniforms.wetLight.value=Math.max(.12,preset.ambient*level);
    const tintAmount=next.sceneTintStrength??0;
    uniforms.sceneTint.value.set(next.sceneTint??'#ffffff');uniforms.sceneTintStrength.value=tintAmount;
    // Daylight needs a balanced fill/key/reflection rig: the brighter showcase
    // rig lifts diffuse atlases into the tone mapper's pale highlight range.
    // This only lights figures; the day ground-grade opacity remains zero.
    baseLight.key=preset.key*level;baseLight.ambient=preset.ambient*level;baseLight.reflection=preset.reflection*level;
    if(next.dmVisibility){
      baseLight.key=Math.max(baseLight.key,NEUTRAL_MINIATURE_LIGHTING.key*.7);
      baseLight.ambient=Math.max(baseLight.ambient,NEUTRAL_MINIATURE_LIGHTING.ambient*.7);
      baseLight.reflection=Math.max(baseLight.reflection,NEUTRAL_MINIATURE_LIGHTING.reflection*.7);
    }
    baseLight.color.set(next.lighting==='dusk'?0xffbb83:next.lighting==='night'?0x9bb9ff:original.color);
    baseLight.color.lerp(uniforms.sceneTint.value,tintAmount);
    if(enabled&&ambient){ambient.color.copy(original.sky).lerp(uniforms.sceneTint.value,tintAmount);ambient.groundColor.copy(original.ground).lerp(uniforms.sceneTint.value,tintAmount);}
    if(enabled){key.intensity=baseLight.key;key.color.copy(baseLight.color);if(ambient)ambient.intensity=baseLight.ambient;scene.environmentIntensity=baseLight.reflection;}
    else restore();tick(time);
  },tick,setCarried(next:CarriedLanternLight[]){carried=next;},setTransient(next:TorchLight[]){transient=next;},get lights(){return lights;},
    renderField(renderer:WebGLRenderer){
      lights.forEach((l,i)=>shadowAttribute.setX(i,l.transient?-2:l.shadowSlot??-1));shadowAttribute.needsUpdate=true;
      const slots=wallSplats.geometry.getAttribute('shadowSlot');if(slots){vertexSources.forEach((index,i)=>slots.setX(i,lights[index].transient?-2:lights[index].shadowSlot??-1));slots.needsUpdate=true;}
      const previous=renderer.getRenderTarget(),pending=renderer.shadowMap.needsUpdate,clearAlpha=renderer.getClearAlpha();renderer.getClearColor(fieldClearColor);renderer.shadowMap.needsUpdate=false;
      // Alpha stores blocked irradiance, so start at zero even in opaque previews.
      try{renderer.setClearColor(0,0);renderer.setRenderTarget(field);renderer.clear();renderer.render(fieldScene,fieldCamera);}
      finally{renderer.setRenderTarget(previous);renderer.setClearColor(fieldClearColor,clearAlpha);renderer.shadowMap.needsUpdate=pending;}
    },
    get animated(){return plane.visible&&(carried.length>0||(settings?.lights??[]).some(l=>l.flicker)||(settings?.groundWetness??0)>0||!!settings?.lightning);},
    get state(){return {lighting:plane.visible?settings.lighting??'day':'off',darkness:settings.heavyDarkness?'heavy':'normal',lightCount:lights.length,visibleTorchCount:lights.filter(l=>l.visibleTorch&&l.fixture!=='lantern').length,placedLanternCount:lights.filter(l=>l.visibleTorch&&l.fixture==='lantern'&&!l.carried).length,carriedLanternCount:carried.length,
      sceneTint:settings.sceneTint??'#ffffff',sceneTintStrength:plane.visible?settings.sceneTintStrength??0:0,sceneGradeOpacity:plane.visible?uniforms.gradeOpacity.value:0,
      wetGround:plane.visible?settings.groundWetness??0:0,lightningEnabled:plane.visible&&!!settings.lightning&&settings.weather==='rain',lightningFlash:fieldUniforms.stormFlash.value,
      carriedLanternPositions:JSON.stringify(lights.filter(l=>l.carried).map(l=>({id:l.id,x:l.x,y:l.y,height:l.height,fixtureHeight:l.fixtureHeight})))};},
    dispose(){scene.remove(plane);plane.geometry.dispose();material.dispose();for(const mesh of [shafts,cups,flames,frames,windows,handles])if(mesh){scene.remove(mesh);mesh.dispose();}
      shaftGeometry.dispose();cupGeometry.dispose();flameGeometry.dispose();lanternGeometry.dispose();handleGeometry.dispose();bronze.dispose();glow.dispose();wood.dispose();iron.dispose();flame.dispose();field.dispose();fieldGeometry.dispose();wallSplats.geometry.dispose();fieldMaterial.dispose();restore();},
  };
}
