import {
  BackSide, BoxGeometry, Color, Data3DTexture, LinearFilter, Matrix4, Mesh, NoBlending,
  OrthographicCamera, PlaneGeometry, RedFormat, RepeatWrapping, Scene, ShaderMaterial,
  Vector2, Vector3, Vector4, WebGLRenderTarget, type Camera, type Texture, type WebGLRenderer,
} from 'three';
import type {EnvironmentContactToken, EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {createMistFlow} from './mistFlow';
import {environmentVisibilityGlsl, type createEnvironmentVisibility} from './environmentVisibility';
import {torchFieldGlsl,type createBattlefieldLighting} from './battlefieldLighting';

// Shared by the volume and its ground shading, so both move and reshape together.
const densityField = /* glsl */`
  ${environmentVisibilityGlsl}
  uniform highp sampler3D mistNoise;
  uniform sampler2D mistFlow, mistBodyHeight;
  uniform float mistBodyHeightScale;
  uniform float mistTime, mistHeight, mistStrength, mistWholeMap, mistShadowStrength;
  uniform float mistWorldScale;
  uniform vec2 mistWind;
  uniform vec3 mistTint;
  uniform vec2 mistMapSize;
  uniform vec2 mistOrigin;
  uniform vec3 mistToLight;
  uniform int mistPatchCount;
  uniform vec4 mistPatches[8];
  uniform vec2 mistPatchRotation[8];
  float mistNoiseAt(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return texture(mistNoise, (cell + f + .5) / 64.0).r;
  }
  float mistEnvelope(vec2 p) {
    vec2 local = p - mistOrigin;
    vec2 edge = min(local, mistMapSize - local);
    float border = smoothstep(0.0, 24.0, min(edge.x, edge.y));
    if (mistWholeMap > .5) return border;
    float patches = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= mistPatchCount) break;
      vec2 d = p - mistPatches[i].xy;
      vec2 r = mistPatchRotation[i];
      d = vec2(r.x * d.x + r.y * d.y, -r.y * d.x + r.x * d.y);
      d /= mistPatches[i].zw * .5;
      patches = max(patches, 1.0 - smoothstep(.25, 1.0, dot(d, d)));
    }
    return patches * border;
  }
  float mistDensity(vec3 world) {
    float y = world.y / mistHeight;
    if (y <= 0.0 || y >= 1.0) return 0.0;
    float edge = mistEnvelope(world.xz) * environmentVisible(world.xz);
    if (edge < .001) return 0.0;
    vec4 flow = texture2D(mistFlow, (world.xz - mistOrigin) / mistMapSize);
    float bodyHeight = texture2D(mistBodyHeight, (world.xz - mistOrigin) / mistMapSize).r * mistBodyHeightScale;
    // Whole-body contact, tapered above the figure rather than halfway up the mist.
    float bodyContact = bodyHeight > .001 ? 1.0 - smoothstep(bodyHeight*.9,bodyHeight*1.1,world.y) : 1.0;
    vec2 bent = world.xz + (flow.rg * 255.0 - 128.0) * .5 * bodyContact;
    // World-space domain warping and differently oriented octaves prevent long
    // parallel strips showing through when looking along the wind direction.
    vec2 drift = bent / mistWorldScale - mistWind * mistTime;
    vec3 warpPoint = vec3(drift / 115.0, y * .8 + mistTime * .025);
    vec2 warp = vec2(mistNoiseAt(warpPoint),mistNoiseAt(warpPoint + vec3(19.1,7.7,11.3))) - .5;
    vec2 p = drift + warp * 95.0;
    vec2 a = vec2(dot(p,vec2(.94,.342)),dot(p,vec2(-.342,.94)));
    vec2 b = vec2(dot(p,vec2(.64,-.768)),dot(p,vec2(.768,.64)));
    float strands = .64 * mistNoiseAt(vec3(a.x / 88.0, y * 2.7 + 3.0, a.y / 27.0))
                  + .36 * mistNoiseAt(vec3(b.x / 53.0 + 7.0, y * 4.0, b.y / 24.0 + 13.0));
    float bank = mistNoiseAt(vec3(p.x / 83.0 + 21.0, y * 1.5 + 17.0, p.y / 69.0));
    float wisps = smoothstep(.36,.64,strands) * smoothstep(.20,.53,bank) * (1.0 - smoothstep(.13,.5,y));
    float billow = smoothstep(.51,.75,bank) * (1.0 - smoothstep(.28,.93,y));
    float clearing = mix(1.0,flow.b,bodyContact);
    float ambient = wisps * 1.5 + billow * .8;
    // Displaced banks must not refill the fresh body gap in the same sample.
    float compressed = flow.a * bodyContact * smoothstep(.2,.85,flow.b);
    // Compress the existing noisy volume only. Adding density independently of
    // that volume made the wake look like bright lines drawn on top of the fog.
    return edge * smoothstep(0.0,.025,y) * ambient * (clearing + compressed * 1.35);
  }
  float mistGroundShade(vec3 world) {
    if (mistShadowStrength <= 0.0 || mistStrength <= 0.0) return 1.0;
    float opticalDepth = 0.0;
    float pathLength = mistHeight / max(.15, mistToLight.y);
    for (int i = 0; i < 3; i++) {
      vec3 samplePoint = vec3(world.x, 0.0, world.z) + mistToLight * pathLength * (float(i) + .5) / 3.0;
      opticalDepth += mistDensity(samplePoint);
    }
    // A restrained, diffuse loss of light, not an opaque mesh shadow.
    return 1.0 - mistShadowStrength * (1.0 - exp(-opticalDepth * pathLength / mistWorldScale / 3.0 * mistStrength * .065));
  }
`;

const vertexShader = /* glsl */`
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fragmentShader = /* glsl */`
  ${densityField}
  ${torchFieldGlsl}
  uniform sampler2D mistSceneDepth;
  uniform vec2 mistResolution;
  uniform float mistSteps;
  uniform mat4 mistProjectionInverse, mistCameraWorld;
  vec3 reconstructWorld(vec2 ndc, float depth) {
    vec4 p = mistProjectionInverse * vec4(ndc, depth, 1.0);
    return (mistCameraWorld * vec4(p.xyz / p.w, 1.0)).xyz;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / mistResolution;
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 origin = reconstructWorld(ndc, -1.0);
    vec3 farPoint = reconstructWorld(ndc, 1.0);
    vec3 direction = normalize(farPoint - origin);
    vec3 safeDirection = direction + vec3(1e-8);
    vec3 a = (vec3(mistOrigin.x,0.0,mistOrigin.y) - origin) / safeDirection;
    vec3 b = (vec3(mistOrigin.x+mistMapSize.x, mistHeight, mistOrigin.y+mistMapSize.y) - origin) / safeDirection;
    vec3 nearBounds = min(a, b), farBounds = max(a, b);
    float entry = max(0.0, max(nearBounds.x, max(nearBounds.y, nearBounds.z)));
    float exitPoint = min(farBounds.x, min(farBounds.y, farBounds.z));
    float depth = texture2D(mistSceneDepth, uv).r;
    if (depth < .999999) {
      vec3 surface = reconstructWorld(ndc, depth * 2.0 - 1.0);
      exitPoint = min(exitPoint, dot(surface - origin, direction));
    }
    if (exitPoint <= entry) discard;
    float stepLength = (exitPoint - entry) / mistSteps;
    float jitter = .25 + .5 * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      if (float(i) >= mistSteps) break;
      vec3 p = origin + direction * (entry + (float(i) + jitter) * stepLength);
      float density = mistDensity(p);
      if (density > .005) {
        float sunStep = max(1.5, mistHeight * .12);
        float sunward = mistDensity(p + mistToLight * sunStep);
        float sunlight = exp(-sunward * mistHeight / mistWorldScale * mistStrength * .055);
        float illumination = clamp(.22 + .78 * sunlight + (density - sunward) * .18, .3, 1.0);
        vec3 color = mix(vec3(.3, .35, .36), vec3(.72, .78, .77), illumination) * (mistTint+vec3(.52,.60,.72)*stormFlash);
        // Warm scattering follows the same animated sources as the ground and figures.
        vec3 localLight=torchIllumination(p.xz);
        color += (vec3(1.)-exp(-localLight*.42))*exp(-p.y/(mistWorldScale*140.))*.72;
        float alpha = 1.0 - exp(-density * mistStrength * stepLength / mistWorldScale * .12);
        light += transmittance * alpha * color;
        transmittance *= 1.0 - alpha;
        if (transmittance < .035) break;
      }
    }
    float alpha = 1.0 - transmittance;
    if (alpha < .002) discard;
    gl_FragColor = vec4(light / max(alpha, .001), alpha);
  }
`;

// Four neighboring fog samples, weighted by the actual opaque surface depth.
// This keeps a low-resolution wisp from leaking across a sharp miniature edge.
const compositeFragment=/* glsl */`
  ${environmentVisibilityGlsl}
  uniform sampler2D mistColor, mistSceneDepth;
  uniform vec2 lowResolution;
  uniform mat4 mistProjectionInverse;
  uniform mat4 mistCameraWorld;
  varying vec2 vUv;
  float viewDepth(vec2 uv) {
    float d=texture2D(mistSceneDepth,uv).r;
    vec4 p=mistProjectionInverse*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);
    return p.z/p.w;
  }
  void main(){
    // Screen-space clipping as well as density clipping keeps even low-res fog
    // interpolation from brightening the concealed terrain behind it.
    vec4 nearP=mistProjectionInverse*vec4(vUv*2.0-1.0,-1.0,1.0);
    vec4 farP=mistProjectionInverse*vec4(vUv*2.0-1.0,1.0,1.0);
    vec3 start=(mistCameraWorld*vec4(nearP.xyz/nearP.w,1.0)).xyz;
    vec3 end=(mistCameraWorld*vec4(farP.xyz/farP.w,1.0)).xyz;
    vec3 direction=end-start;
    vec3 ground=start-direction*start.y/direction.y;
    if(environmentVisible(ground.xz)<.5)discard;
    vec2 p=vUv*lowResolution-.5, f=fract(p), base=floor(p);
    float center=viewDepth(vUv), total=0.0;
    vec4 color=vec4(0.0);
    for(int y=0;y<2;y++)for(int x=0;x<2;x++){
      vec2 uv=(base+vec2(float(x),float(y))+.5)/lowResolution;
      float bilinear=(x==0?1.0-f.x:f.x)*(y==0?1.0-f.y:f.y);
      float weight=bilinear*exp(-abs(viewDepth(uv)-center)*.3);
      vec4 sampleColor=texture2D(mistColor,uv);
      color+=vec4(sampleColor.rgb*sampleColor.a,sampleColor.a)*weight;total+=weight;
    }
    if(total<.00001)discard;
    color/=total;
    gl_FragColor=vec4(color.rgb/max(color.a,.00001),color.a);
    #include <colorspace_fragment>
  }
`;

/** One bounded density volume, clipped against the scene's opaque depth. */
export function createBattlefieldMist(depth: Texture, resolution: Vector2, visibility: ReturnType<typeof createEnvironmentVisibility>['uniforms'],torchField:ReturnType<typeof createBattlefieldLighting>['fieldUniforms']) {
  const flow=createMistFlow();
  const data = new Uint8Array(64 * 64 * 64);
  let seed = 572919;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    data[i] = seed >>> 24;
  }
  const noise = new Data3DTexture(data, 64, 64, 64);
  noise.format = RedFormat;
  noise.minFilter = noise.magFilter = LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = RepeatWrapping;
  noise.needsUpdate = true;
  const common = {
    ...visibility, mistOrigin:{value:new Vector2()}, mistWorldScale:{value:1},mistWind:{value:new Vector2(9.4,3.42)},mistTint:{value:new Vector3(1,1,1)},
    mistNoise:{value:noise}, mistFlow:{value:flow.texture},mistBodyHeight:{value:flow.heightTexture},mistBodyHeightScale:{value:1216}, mistTime:{value:0}, mistHeight:{value:25.6}, mistStrength:{value:0},
    mistWholeMap:{value:1}, mistMapSize:{value:new Vector2(1216,832)},
    mistToLight:{value:new Vector3(-.5,1,-.7).normalize()}, mistShadowStrength:{value:0},
    mistPatchCount:{value:0}, mistPatches:{value:Array.from({length:8},()=>new Vector4())},
    mistPatchRotation:{value:Array.from({length:8},()=>new Vector2(1,0))},
  };
  const lowResolution=new Vector2(1,1);
  const material = new ShaderMaterial({uniforms:{...common,...torchField,
    mistSceneDepth:{value:depth}, mistResolution:{value:lowResolution},mistSteps:{value:24},
    mistProjectionInverse:{value:new Matrix4()}, mistCameraWorld:{value:new Matrix4()},
  }, vertexShader, fragmentShader, side:BackSide, blending:NoBlending, depthWrite:false, depthTest:false, toneMapped:false});
  const geometry = new BoxGeometry(1,1,1);
  const volume = new Mesh(geometry, material);
  volume.name = 'billowing-mist-volume'; volume.renderOrder=3;
  volume.onBeforeRender=(_renderer,_scene,camera)=>{
    material.uniforms.mistProjectionInverse.value.copy(camera.projectionMatrixInverse);
    material.uniforms.mistCameraWorld.value.copy(camera.matrixWorld);
  };
  const volumeScene=new Scene();volumeScene.add(volume);
  const target=new WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter});
  const composite=new ShaderMaterial({uniforms:{...visibility,mistColor:{value:target.texture},mistSceneDepth:{value:depth},lowResolution:{value:lowResolution},
    mistProjectionInverse:material.uniforms.mistProjectionInverse,mistCameraWorld:material.uniforms.mistCameraWorld},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:compositeFragment,
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  const quadGeometry=new PlaneGeometry(2,2),quad=new Mesh(quadGeometry,composite),compositeScene=new Scene();
  const quadCamera=new OrthographicCamera(-1,1,1,-1,0,1);compositeScene.add(quad);
  let coverage:'patches'|'map'='map';
  let quality:EnvironmentPreviewSettings['mistQuality']='auto',resolvedQuality='high',scale=.5;
  return {
    update(settings:EnvironmentPreviewSettings) {
      const height=Math.max(.5,settings.mistHeight??25.6);
      quality=settings.mistQuality??'auto';
      const visible=settings.enabled&&settings.mist&&quality!=='off';
      const ox=settings.mapX??0,oy=settings.mapY??0;
      if(common.mistOrigin.value.x!==ox||common.mistOrigin.value.y!==oy)flow.reset();
      flow.update({...settings,mistInteraction:visible&&settings.mistInteraction!==false,props:settings.props?.map(p=>({...p,x:p.x-ox,y:p.y-oy}))});
      common.mistBodyHeightScale.value=flow.heightScale;
      coverage=settings.mistCoverage??'patches';
      volume.visible=visible;
      volume.position.set(ox+settings.mapWidth/2,height/2,oy+settings.mapHeight/2);
      volume.scale.set(settings.mapWidth,height,settings.mapHeight);
      common.mistHeight.value=height;
      common.mistWorldScale.value=Math.max(.001,(settings.pixelsPerFoot??12.8)/12.8);
      const wind=(settings.windDirectionDegrees??20)*Math.PI/180,windSpeed=(settings.windStrength??.4)*25;
      common.mistWind.value.set(Math.cos(wind)*windSpeed,Math.sin(wind)*windSpeed);
      const tint=settings.lighting==='night'?[.25,.35,.55]:settings.lighting==='dungeon'?[.25,.23,.3]:settings.lighting==='dusk'?[.8,.61,.6]:[1,1,1];
      const palette={natural:[1,1,1],cool:[.65,.9,1.2],green:[.6,1.55,.62],ash:[.64,.61,.59],sand:[1.25,.88,.43]}[settings.mistColor??'natural'];
      const sceneTint=new Color(0xffffff).lerp(new Color(settings.sceneTint??'#ffffff'),settings.sceneTintStrength??0);
      common.mistTint.value.fromArray(tint.map((v,i)=>v*palette[i])).multiply(new Vector3(sceneTint.r,sceneTint.g,sceneTint.b)).multiplyScalar((settings.lightLevel??1)*(settings.heavyDarkness?.10:1));
      common.mistStrength.value=visible?Math.max(0,Math.min(.7,settings.mistOpacity??.28)):0;
      common.mistMapSize.value.set(settings.mapWidth,settings.mapHeight);
      common.mistOrigin.value.set(ox,oy);
      common.mistWholeMap.value=coverage==='map'?1:0;
      const angle=settings.shadowDirectionDegrees*Math.PI/180;
      common.mistToLight.value.set(-Math.cos(angle)*settings.shadowLength,1,-Math.sin(angle)*settings.shadowLength).normalize();
      common.mistShadowStrength.value=visible&&settings.mistShadows!==false?.16:0;
      const patches=(settings.mistPatches??[]).slice(0,8);
      common.mistPatchCount.value=patches.length;
      patches.forEach((patch,index)=>{
        common.mistPatches.value[index].set(patch.x,patch.y,patch.width,patch.depth);
        const a=(patch.rotation??0)*Math.PI/180;
        common.mistPatchRotation.value[index].set(Math.cos(a),Math.sin(a));
      });
    },
    setTokens(tokens:readonly EnvironmentContactToken[]){
      const {x,y}=common.mistOrigin.value;
      flow.setTokens(tokens.map(t=>({...t,x:t.x-x,y:t.y-y,body:t.body?{...t.body,x:t.body.x-x,y:t.body.y-y}:undefined})));
    },
    render(renderer:WebGLRenderer,camera:Camera){
      if(!volume.visible)return;
      // Auto caps fog pixel work; main scene and miniatures keep full resolution.
      resolvedQuality=quality==='auto'?(resolution.x*resolution.y>2_000_000||renderer.domElement.clientWidth<600?'low':'high'):quality??'high';
      scale=resolvedQuality==='low'?.25:.5;
      const width=Math.max(1,Math.ceil(resolution.x*scale)),height=Math.max(1,Math.ceil(resolution.y*scale));
      if(target.width!==width||target.height!==height){target.setSize(width,height);lowResolution.set(width,height);}
      material.uniforms.mistSteps.value=resolvedQuality==='low'?12:24;
      const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear,shadowUpdate=renderer.shadowMap.needsUpdate;
      try{
        renderer.shadowMap.needsUpdate=false;
        renderer.setRenderTarget(target);renderer.autoClear=true;renderer.render(volumeScene,camera);
        renderer.setRenderTarget(previous);renderer.autoClear=false;renderer.render(compositeScene,quadCamera);
      }finally{renderer.setRenderTarget(previous);renderer.autoClear=autoClear;renderer.shadowMap.needsUpdate=shadowUpdate;}
    },
    extendGroundShader(shader:{uniforms:Record<string,{value:unknown}>;vertexShader:string;fragmentShader:string},overlay=false) {
      Object.assign(shader.uniforms,common);
      shader.vertexShader='varying vec3 mistGroundWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\n mistGroundWorld = (modelMatrix * vec4(position,1.0)).xyz;');
      shader.fragmentShader='varying vec3 mistGroundWorld;\n'+densityField+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() {\n if(environmentVisible(mistGroundWorld.xz)<.5)discard;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',
        (overlay?'gl_FragColor.a = 1.0-(1.0-gl_FragColor.a)*mistGroundShade(mistGroundWorld);':'gl_FragColor.rgb *= mistGroundShade(mistGroundWorld);')+'\n#include <tonemapping_fragment>');
    },
    tick(seconds:number){common.mistTime.value=seconds;flow.tick(seconds);return volume.visible;},
    get state(){return {visible:volume.visible,coverage,height:common.mistHeight.value,layers:1,shadows:common.mistShadowStrength.value>0,
      quality:volume.visible?resolvedQuality:'off',scale,steps:material.uniforms.mistSteps.value,bufferWidth:target.width,bufferHeight:target.height,...flow.state};},
    dispose(){geometry.dispose();material.dispose();noise.dispose();target.dispose();quadGeometry.dispose();composite.dispose();flow.dispose();},
  };
}
