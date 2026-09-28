import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, HalfFloatType, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, TorusGeometry,
  PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget,
  type DirectionalLight, type HemisphereLight, type Texture, type Vector2, type WebGLRenderer,
} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';
import type {TorchLight} from './miniatureTorchLighting';

const palettes={day:{color:0x1c2230,opacity:0,ambient:1.35,key:3,reflection:1},dusk:{color:0x351c2b,opacity:.32,ambient:.8,key:1.65,reflection:.65},night:{color:0x0a142b,opacity:.73,ambient:.30,key:.42,reflection:.20},dungeon:{color:0x100e18,opacity:.84,ambient:.16,key:.15,reflection:.11}};
const colors={warm:new Color(0xffb258),cool:new Color(0x89bbff),green:new Color(0x85eab5)};
export type CarriedLanternLight={id:string;x:number;y:number;height:number;facing:number};
export const torchFieldGlsl=`
  uniform sampler2D torchField;
  uniform vec4 torchBounds;
  vec3 torchIllumination(vec2 point){
    vec2 uv=(point-torchBounds.xy)/torchBounds.zw;
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
    return texture2D(torchField,uv).rgb;
  }
`;

/** All sources splat into a bounded light field; there is no map-wide light-count limit. */
export function createBattlefieldLighting(scene:Scene,key:DirectionalLight,ambient:HemisphereLight|undefined,visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms'],depth:{texture:Texture;resolution:Vector2}){
  const original={key:key.intensity,color:key.color.clone(),ambient:ambient?.intensity??2,reflection:scene.environmentIntensity};
  const field=new WebGLRenderTarget(512,512,{type:HalfFloatType,depthBuffer:false,stencilBuffer:false});
  const fieldUniforms={torchField:{value:field.texture},torchBounds:{value:new Vector4()}};
  const uniforms={...visibility,...fieldUniforms,figureDepth:{value:depth.texture},resolution:{value:depth.resolution},gradeColor:{value:new Color()},gradeOpacity:{value:0}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,uniforms,
    vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}${torchFieldGlsl}
      varying vec3 world;uniform sampler2D figureDepth;uniform vec2 resolution;uniform vec3 gradeColor;uniform float gradeOpacity;
      void main(){if(environmentVisible(world.xz)<.5||texture2D(figureDepth,gl_FragCoord.xy/resolution).r<.999999)discard;
        vec3 illumination=torchIllumination(world.xz);float strength=max(illumination.r,max(illumination.g,illumination.b));
        float coverage=1.-exp(-strength);vec3 tint=illumination/max(.001,strength);
        float alpha=mix(gradeOpacity,.10,coverage);vec3 color=mix(gradeColor,tint*.30,coverage);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`});
  // Existing figure depth avoids coplanar ground z-fighting and leaves bodies lit by PBR.
  const plane=new Mesh(new PlaneGeometry(1,1),material);plane.rotation.x=-Math.PI/2;plane.renderOrder=2;plane.frustumCulled=false;scene.add(plane);
  const fieldScene=new Scene(),fieldCamera=new OrthographicCamera(-1,1,1,-1,0,1);
  const quad=new PlaneGeometry(2,2),fieldGeometry=new InstancedBufferGeometry();
  fieldGeometry.index=quad.index;fieldGeometry.attributes=quad.attributes;
  const fieldMaterial=new ShaderMaterial({uniforms:fieldUniforms,transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:`attribute vec4 source;attribute vec4 radiance;uniform vec4 torchBounds;varying vec2 world;varying vec4 lightSource;varying vec4 lightRadiance;
      void main(){lightSource=source;lightRadiance=radiance;world=source.xz+position.xy*source.w;
        gl_Position=vec4((world-torchBounds.xy)/torchBounds.zw*2.-1.,0.,1.);}`,
    fragmentShader:`varying vec2 world;varying vec4 lightSource;varying vec4 lightRadiance;
      void main(){float d=length(vec3(world-lightSource.xz,lightSource.y));float radius=lightSource.w;
        float attenuation=pow(clamp(1.-pow(d/radius,4.),0.,1.),2.);
        float irradiance=radius*radius/max(1.,d*d)*attenuation*lightSource.y/max(1.,d)*.65*lightRadiance.w;
        gl_FragColor=vec4(lightRadiance.rgb*irradiance,1.);}`});
  const splats=new Mesh(fieldGeometry,fieldMaterial);splats.frustumCulled=false;fieldScene.add(splats);
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
  const glow=new MeshBasicMaterial({color:0xffc768,transparent:true,opacity:.85,depthWrite:false,toneMapped:false});
  let capacity=0,shafts:InstancedMesh,cups:InstancedMesh,flames:InstancedMesh,frames:InstancedMesh,windows:InstancedMesh,handles:InstancedMesh;
  let sourceAttribute:InstancedBufferAttribute,radianceAttribute:InstancedBufferAttribute;
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
  }
  let settings:EnvironmentPreviewSettings,carried:CarriedLanternLight[]=[],lights:TorchLight[]=[],time=0;
  const restore=()=>{key.intensity=original.key;key.color.copy(original.color);if(ambient)ambient.intensity=original.ambient;scene.environmentIntensity=original.reflection;};
  const phase=(id:string)=>{let hash=0;for(let i=0;i<id.length;i++)hash=(hash*31+id.charCodeAt(i))|0;return hash*.013;};
  const tick=(seconds:number)=>{
    time=seconds;if(!settings)return;
    const ppf=settings.pixelsPerFoot??12.8;
    const sources=[...(settings.lights??[]).map(l=>({...l,height:l.heightFt*ppf,carried:false,facing:0})),
      ...carried.map(l=>({...l,radiusFt:20,intensity:.85,color:'warm' as const,flicker:true,visibleTorch:false,fixture:'lantern' as const,carried:true}))];
    lights=plane.visible?sources.map(source=>{
      const seed=phase(source.id),f=Math.sin(time*6.3+seed)*.10+Math.sin(time*11.1+seed*3)*.06+Math.sin(time*2.7+seed)*.08;
      const color=colors[source.color];
      return {id:source.id,x:source.x,y:source.y,height:source.height,radius:source.radiusFt*ppf*(source.flicker?1+f*.28:1),
        strength:source.intensity*(source.flicker?1+f:1),color:new Vector3(color.r,color.g,color.b),visibleTorch:!!source.visibleTorch,fixture:source.fixture,carried:source.carried,facing:source.facing};
    }):[];
    ensureCapacity(lights.length);let visible=0,lanterns=0;
    lights.forEach((light,i)=>{
      sourceAttribute.setXYZW(i,light.x,light.height,light.y,light.radius);
      radianceAttribute.setXYZW(i,light.color.x,light.color.y,light.color.z,light.strength);
      if(light.carried||(light.visibleTorch&&light.fixture==='lantern')){
        const size=ppf*(light.carried?.8:1.2),angle=light.facing??0,c=Math.cos(angle),s=Math.sin(angle);
        const part=(mesh:InstancedMesh,index:number,x:number,y:number,z:number,w:number,h:number,d:number)=>{
          matrix.makeRotationY(angle).scale(new Vector3(w*size,h*size,d*size));
          matrix.setPosition(light.x+(x*c+z*s)*size,light.height+y*size,light.y+(-x*s+z*c)*size);mesh.setMatrixAt(index,matrix);
        };
        part(windows,lanterns,0,0,0,.48,.73,.32);
        windows.setColorAt(lanterns,new Color().setScalar(.85+light.strength*.15));
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
    fieldGeometry.instanceCount=lights.length;sourceAttribute.needsUpdate=true;radianceAttribute.needsUpdate=true;
    for(const mesh of [shafts,cups,flames]){mesh.count=visible;mesh.visible=plane.visible;mesh.instanceMatrix.needsUpdate=true;}
    frames.count=lanterns*6;windows.count=handles.count=lanterns;
    for(const mesh of [frames,windows,handles]){mesh.visible=plane.visible;mesh.instanceMatrix.needsUpdate=true;}
    if(windows.instanceColor)windows.instanceColor.needsUpdate=true;
    if(flames.instanceColor)flames.instanceColor.needsUpdate=true;
    flame.uniforms.flameTime.value=time;
  };
  return {fieldUniforms,update(next:EnvironmentPreviewSettings){
    settings=next;const enabled=next.enabled&&next.mistQuality!=='off',preset=palettes[next.lighting??'day'];
    const level=(next.lightLevel??1)*(next.heavyDarkness?.10:1);
    plane.visible=enabled;plane.position.set((next.mapX??0)+next.mapWidth/2,.004,(next.mapY??0)+next.mapHeight/2);plane.scale.set(next.mapWidth,next.mapHeight,1);
    fieldUniforms.torchBounds.value.set(next.mapX??0,next.mapY??0,next.mapWidth,next.mapHeight);
    const maxSize=next.mistQuality==='low'?512:1024,ratio=next.mapWidth/next.mapHeight;
    field.setSize(Math.max(1,Math.round(maxSize*Math.min(1,ratio))),Math.max(1,Math.round(maxSize*Math.min(1,1/ratio))));
    uniforms.gradeColor.value.set(next.heavyDarkness?0x010205:preset.color);uniforms.gradeOpacity.value=1-(1-preset.opacity)*level;
    if(enabled){key.intensity=preset.key*level;key.color.set(next.lighting==='dusk'?0xffbb83:next.lighting==='night'?0x9bb9ff:original.color);if(ambient)ambient.intensity=preset.ambient*level;scene.environmentIntensity=preset.reflection*level;}
    else restore();tick(time);
  },tick,setCarried(next:CarriedLanternLight[]){carried=next;},get lights(){return lights;},
    renderField(renderer:WebGLRenderer){const previous=renderer.getRenderTarget();renderer.setRenderTarget(field);renderer.clear();renderer.render(fieldScene,fieldCamera);renderer.setRenderTarget(previous);},
    get animated(){return plane.visible&&(carried.length>0||(settings?.lights??[]).some(l=>l.flicker));},
    get state(){return {lighting:plane.visible?settings.lighting??'day':'off',darkness:settings.heavyDarkness?'heavy':'normal',lightCount:lights.length,visibleTorchCount:lights.filter(l=>l.visibleTorch&&l.fixture!=='lantern').length,placedLanternCount:lights.filter(l=>l.visibleTorch&&l.fixture==='lantern'&&!l.carried).length,carriedLanternCount:carried.length,
      carriedLanternPositions:JSON.stringify(lights.filter(l=>l.carried).map(l=>({id:l.id,x:l.x,y:l.y,height:l.height})))};},
    dispose(){scene.remove(plane);plane.geometry.dispose();material.dispose();for(const mesh of [shafts,cups,flames,frames,windows,handles])if(mesh){scene.remove(mesh);mesh.dispose();}
      shaftGeometry.dispose();cupGeometry.dispose();flameGeometry.dispose();lanternGeometry.dispose();handleGeometry.dispose();bronze.dispose();glow.dispose();wood.dispose();iron.dispose();flame.dispose();field.dispose();fieldGeometry.dispose();fieldMaterial.dispose();restore();},
  };
}
