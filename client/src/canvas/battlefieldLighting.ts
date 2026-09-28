import {Color,Mesh,PlaneGeometry,PointLight,ShaderMaterial,Vector3,Vector4,type DirectionalLight,type HemisphereLight,type Scene,type Texture,type Vector2} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';

const palettes={day:{color:0x1c2230,opacity:0,ambient:1.35,key:3,reflection:1},dusk:{color:0x351c2b,opacity:.32,ambient:.8,key:1.65,reflection:.65},night:{color:0x0a142b,opacity:.73,ambient:.30,key:.42,reflection:.20},dungeon:{color:0x100e18,opacity:.84,ambient:.16,key:.15,reflection:.11}};
const colors={warm:0xffb258,cool:0x89bbff,green:0x85eab5};

/** A transparent grade preserves the painted ground, including in the DOM map below WebGL. */
export function createBattlefieldLighting(scene:Scene,key:DirectionalLight,ambient:HemisphereLight|undefined,visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms'],depth:{texture:Texture;resolution:Vector2}){
  const original={key:key.intensity,color:key.color.clone(),ambient:ambient?.intensity??2,reflection:scene.environmentIntensity};
  const uniforms={...visibility,figureDepth:{value:depth.texture},resolution:{value:depth.resolution},gradeColor:{value:new Color()},gradeOpacity:{value:0},lightCount:{value:0},
    pools:{value:Array.from({length:8},()=>new Vector4())},poolHeights:{value:new Float32Array(8)},poolColors:{value:Array.from({length:8},()=>new Vector3())}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,uniforms,
    vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`${environmentVisibilityGlsl}
      varying vec3 world;uniform sampler2D figureDepth;uniform vec2 resolution;uniform vec3 gradeColor;uniform float gradeOpacity;uniform int lightCount;uniform vec4 pools[8];uniform float poolHeights[8];uniform vec3 poolColors[8];
      void main(){if(environmentVisible(world.xz)<.5||texture2D(figureDepth,gl_FragCoord.xy/resolution).r<.999999)discard;
        float strength=0.;vec3 tint=vec3(0.);
        for(int i=0;i<8;i++){if(i>=lightCount)break;float planar=distance(world.xz,pools[i].xy);float distance3d=length(vec2(planar,poolHeights[i]));float d=distance3d/pools[i].z;
          float falloff=pow(clamp(1.-pow(d,4.),0.,1.),2.);
          float illumination=pools[i].z*pools[i].z/max(1.,distance3d*distance3d)*falloff*poolHeights[i]/max(1.,distance3d);
          float p=(1.-exp(-illumination*.65*pools[i].w));strength+=p;tint+=poolColors[i]*p;}
        float coverage=clamp(strength,0.,.96);tint/=max(.001,strength);
        float alpha=mix(gradeOpacity,.10,coverage);vec3 color=mix(gradeColor,tint*.30,coverage);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`});
  // Sample the existing figure mask instead of depth-testing two nearly coplanar
  // surfaces. The wide battlefield camera otherwise produces z-fighting bands.
  const plane=new Mesh(new PlaneGeometry(1,1),material);plane.rotation.x=-Math.PI/2;plane.renderOrder=2;plane.frustumCulled=false;scene.add(plane);
  let settings:EnvironmentPreviewSettings,lights:PointLight[]=[],time=0;
  const restore=()=>{key.intensity=original.key;key.color.copy(original.color);if(ambient)ambient.intensity=original.ambient;scene.environmentIntensity=original.reflection;};
  const tick=(seconds:number)=>{
    time=seconds;if(!settings)return;
    const ppf=settings.pixelsPerFoot??12.8;
    (settings.lights??[]).slice(0,8).forEach((light,i)=>{
      // The same flame drives illumination and its pool; reach breathes more
      // slowly and less strongly than brightness, without jumping the source.
      const flame=Math.sin(time*6.3+i*7)*.10+Math.sin(time*11.1+i*3)*.06+Math.sin(time*2.7+i)*.08;
      const flicker=light.flicker?1+flame:1;
      const reach=light.flicker?1+flame*.28:1;
      const strength=light.intensity*flicker,radius=light.radiusFt*ppf*reach;
      uniforms.pools.value[i].set(light.x,light.y,radius,strength);
      uniforms.poolHeights.value[i]=light.heightFt*ppf;
      lights[i].distance=radius;
      lights[i].intensity=(light.radiusFt*ppf)**2*.55*strength;
    });
  };
  return {update(next:EnvironmentPreviewSettings){
    settings=next;const enabled=next.enabled&&next.mistQuality!=='off',preset=palettes[next.lighting??'day'];
    const level=next.lightLevel??1;
    plane.visible=enabled;plane.position.set((next.mapX??0)+next.mapWidth/2,.004,(next.mapY??0)+next.mapHeight/2);plane.scale.set(next.mapWidth,next.mapHeight,1);
    uniforms.gradeColor.value.set(preset.color);uniforms.gradeOpacity.value=1-(1-preset.opacity)*level;
    const count=Math.min(8,next.lights?.length??0);uniforms.lightCount.value=count;
    while(lights.length>count){const removed=lights.pop()!;scene.remove(removed);removed.dispose();}
    while(lights.length<count){const light=new PointLight();scene.add(light);lights.push(light);}
    lights.forEach((light,i)=>{const source=next.lights![i],ppf=next.pixelsPerFoot??12.8;light.visible=enabled;light.position.set(source.x,source.heightFt*ppf,source.y);light.color.set(colors[source.color]);light.distance=source.radiusFt*ppf;light.decay=2;uniforms.poolColors.value[i].set(light.color.r,light.color.g,light.color.b);});
    if(enabled){key.intensity=preset.key*level;key.color.set(next.lighting==='dusk'?0xffbb83:next.lighting==='night'?0x9bb9ff:original.color);if(ambient)ambient.intensity=preset.ambient*level;scene.environmentIntensity=preset.reflection*level;}
    else restore();tick(time);
  },tick,
    get animated(){return plane.visible&&(settings?.lights??[]).some(l=>l.flicker);},
    get state(){return {lighting:plane.visible?settings.lighting??'day':'off',lightCount:plane.visible?lights.length:0};},
    dispose(){scene.remove(plane);plane.geometry.dispose();material.dispose();for(const light of lights){scene.remove(light);light.dispose();}lights=[];restore();},
  };
}
