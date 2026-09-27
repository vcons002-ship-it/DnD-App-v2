import {
  BackSide, BoxGeometry, Data3DTexture, Group, LinearFilter, Matrix4, Mesh,
  RedFormat, RepeatWrapping, ShaderMaterial, Vector2, Vector3, Vector4,
  type Texture,
} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';

// Shared by the volume and its ground shading, so both move and reshape together.
const densityField = /* glsl */`
  uniform highp sampler3D mistNoise;
  uniform float mistTime, mistHeight, mistStrength, mistWholeMap, mistShadowStrength;
  uniform vec2 mistMapSize;
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
    vec2 edge = min(p, mistMapSize - p);
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
    float edge = mistEnvelope(world.xz);
    if (edge < .001) return 0.0;
    vec2 advected = world.xz + vec2(mistTime * 2.1, mistTime * .75);
    vec3 p = vec3(advected.x / 78.0, y * 2.1, advected.y / 78.0);
    float banks = mistNoiseAt(vec3(p.x * .7, 17.3, p.z * .7));
    banks = .12 + .88 * smoothstep(.32, .69, banks);
    float shape = .62 * mistNoiseAt(p + vec3(4.7, 8.1, 2.3))
                + .26 * mistNoiseAt(p * 2.03 + 13.7)
                + .12 * mistNoiseAt(p * 4.07 + 27.1);
    float roof = mix(.17, .98, banks) * (.8 + .2 * shape);
    float vertical = (1.0 - smoothstep(roof * .5, roof, y)) * smoothstep(0.0, .055, y);
    float billow = smoothstep(.29, .67, shape);
    return edge * banks * vertical * billow * 1.6;
  }
  float mistGroundShade(vec3 world) {
    if (mistShadowStrength <= 0.0 || mistStrength <= 0.0) return 1.0;
    float opticalDepth = 0.0;
    float pathLength = mistHeight / max(.15, mistToLight.y);
    for (int i = 0; i < 6; i++) {
      vec3 samplePoint = vec3(world.x, 0.0, world.z) + mistToLight * pathLength * (float(i) + .5) / 6.0;
      opticalDepth += mistDensity(samplePoint);
    }
    // A restrained, diffuse loss of light, not an opaque mesh shadow.
    return 1.0 - mistShadowStrength * (1.0 - exp(-opticalDepth * pathLength / 6.0 * mistStrength * .065));
  }
`;

const vertexShader = /* glsl */`
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fragmentShader = /* glsl */`
  ${densityField}
  uniform sampler2D mistSceneDepth;
  uniform vec2 mistResolution;
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
    vec3 a = (vec3(0.0) - origin) / safeDirection;
    vec3 b = (vec3(mistMapSize.x, mistHeight, mistMapSize.y) - origin) / safeDirection;
    vec3 nearBounds = min(a, b), farBounds = max(a, b);
    float entry = max(0.0, max(nearBounds.x, max(nearBounds.y, nearBounds.z)));
    float exitPoint = min(farBounds.x, min(farBounds.y, farBounds.z));
    float depth = texture2D(mistSceneDepth, uv).r;
    if (depth < .999999) {
      vec3 surface = reconstructWorld(ndc, depth * 2.0 - 1.0);
      exitPoint = min(exitPoint, dot(surface - origin, direction));
    }
    if (exitPoint <= entry) discard;
    float stepLength = (exitPoint - entry) / 32.0;
    float jitter = .25 + .5 * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      vec3 p = origin + direction * (entry + (float(i) + jitter) * stepLength);
      float density = mistDensity(p);
      if (density > .005) {
        float sunStep = max(1.5, mistHeight * .12);
        float sunward = mistDensity(p + mistToLight * sunStep);
        float farther = mistDensity(p + mistToLight * sunStep * 3.0);
        float sunlight = exp(-(sunward + farther * .7) * mistHeight * mistStrength * .075);
        float illumination = clamp(.22 + .78 * sunlight + (density - sunward) * .18, .3, 1.0);
        vec3 color = mix(vec3(.23, .28, .31), vec3(.84, .87, .86), illumination);
        float alpha = 1.0 - exp(-density * mistStrength * stepLength * .095);
        light += transmittance * alpha * color;
        transmittance *= 1.0 - alpha;
        if (transmittance < .035) break;
      }
    }
    float alpha = 1.0 - transmittance;
    if (alpha < .002) discard;
    gl_FragColor = vec4(light / max(alpha, .001), alpha);
    #include <colorspace_fragment>
  }
`;

/** One bounded density volume, clipped against the scene's opaque depth. */
export function createBattlefieldMist(parent: Group, depth: Texture, resolution: Vector2) {
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
    mistNoise:{value:noise}, mistTime:{value:0}, mistHeight:{value:25.6}, mistStrength:{value:0},
    mistWholeMap:{value:1}, mistMapSize:{value:new Vector2(1216,832)},
    mistToLight:{value:new Vector3(-.5,1,-.7).normalize()}, mistShadowStrength:{value:0},
    mistPatchCount:{value:0}, mistPatches:{value:Array.from({length:8},()=>new Vector4())},
    mistPatchRotation:{value:Array.from({length:8},()=>new Vector2(1,0))},
  };
  const material = new ShaderMaterial({uniforms:{...common,
    mistSceneDepth:{value:depth}, mistResolution:{value:resolution},
    mistProjectionInverse:{value:new Matrix4()}, mistCameraWorld:{value:new Matrix4()},
  }, vertexShader, fragmentShader, side:BackSide, transparent:true, depthWrite:false, depthTest:false, toneMapped:false});
  const geometry = new BoxGeometry(1,1,1);
  const volume = new Mesh(geometry, material);
  volume.name = 'billowing-mist-volume'; volume.renderOrder=3;
  volume.onBeforeRender=(_renderer,_scene,camera)=>{
    material.uniforms.mistProjectionInverse.value.copy(camera.projectionMatrixInverse);
    material.uniforms.mistCameraWorld.value.copy(camera.matrixWorld);
  };
  parent.add(volume);
  let coverage:'patches'|'map'='map';
  return {
    update(settings:EnvironmentPreviewSettings) {
      const height=Math.max(.5,settings.mistHeight??25.6);
      const visible=settings.enabled&&settings.mist;
      coverage=settings.mistCoverage??'patches';
      volume.visible=visible;
      volume.position.set(settings.mapWidth/2,height/2,settings.mapHeight/2);
      volume.scale.set(settings.mapWidth,height,settings.mapHeight);
      common.mistHeight.value=height;
      common.mistStrength.value=visible?Math.max(0,Math.min(.7,settings.mistOpacity??.28)):0;
      common.mistMapSize.value.set(settings.mapWidth,settings.mapHeight);
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
    extendGroundShader(shader:{uniforms:Record<string,{value:unknown}>;vertexShader:string;fragmentShader:string}) {
      Object.assign(shader.uniforms,common);
      shader.vertexShader='varying vec3 mistGroundWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\n mistGroundWorld = (modelMatrix * vec4(position,1.0)).xyz;');
      shader.fragmentShader='varying vec3 mistGroundWorld;\n'+densityField+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',
        'gl_FragColor.rgb *= mistGroundShade(mistGroundWorld);\n#include <tonemapping_fragment>');
    },
    tick(seconds:number){common.mistTime.value=seconds;return volume.visible;},
    get state(){return {visible:volume.visible,coverage,height:common.mistHeight.value,layers:1,shadows:common.mistShadowStrength.value>0};},
    dispose(){volume.removeFromParent();geometry.dispose();material.dispose();noise.dispose();},
  };
}
