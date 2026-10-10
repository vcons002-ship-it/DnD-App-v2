import {InstancedBufferAttribute,InstancedBufferGeometry,Matrix4,Mesh,PlaneGeometry,ShaderMaterial,Vector2,Vector4,type Scene,type Texture} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';

/** Fixed GPU particle budget. Positions are evaluated in map coordinates without per-particle JS work. */
export function createBattlefieldWeather(scene:Scene,depth:{texture:Texture;resolution:Vector2},visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms']){
  const quad=new PlaneGeometry(1,1),geometry=new InstancedBufferGeometry();geometry.index=quad.index;geometry.attributes=quad.attributes;
  const seeds=new Float32Array(2200*4);let seed=713;
  for(let i=0;i<seeds.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;seeds[i]=seed/4294967296;}
  geometry.setAttribute('seed',new InstancedBufferAttribute(seeds,4));
  const uniforms={...visibility,time:{value:0},snow:{value:0},scaleFt:{value:12.8},bounds:{value:new Vector4()},wind:{value:new Vector2()},
    resolution:{value:depth.resolution},cameraInverse:{value:new Matrix4()},cameraWorld:{value:new Matrix4()}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms,
    vertexShader:`attribute vec4 seed;uniform float time,snow,scaleFt;uniform vec4 bounds;uniform vec2 wind;
      varying vec2 tex;varying vec3 world;varying float alpha,splash;
      void main(){tex=uv;float height=16.*scaleFt;float speed=mix(29.,2.5,snow)*scaleFt;
        float phase=fract(seed.z+time*speed/height);splash=snow<.5&&phase>.94?1.:0.;
        float gustTime=time+sin(time*.65)*.4+sin(time*.23)*.8;
        vec2 drift=wind*gustTime*scaleFt+snow*vec2(sin(time*.7+seed.w*41.),cos(time*.5+seed.x*32.))*scaleFt*.7;
        vec2 ground=bounds.xy+mod(seed.xy*bounds.zw+drift,bounds.zw);
        world=vec3(ground.x,height*(1.-phase),ground.y);
        if(splash>.5)world.y=.06;
        vec4 p=viewMatrix*vec4(world,1.);
        float width=mix(.085,.20,snow)*scaleFt*(.7+seed.w*.6),length=mix(1.5,.20,snow)*scaleFt;
        float gustVelocity=1.+cos(time*.65)*.26+cos(time*.23)*.184;
        vec3 velocity=(viewMatrix*vec4(wind.x*scaleFt*gustVelocity,-speed,wind.y*scaleFt*gustVelocity,0.)).xyz;
        vec2 along=normalize(velocity.xy+vec2(.01)),across=vec2(along.y,-along.x);
        if(splash>.5){float age=(phase-.94)/.06;float radius=(.10+age*.55)*scaleFt;
          world+=vec3(position.x*radius,0.,-position.y*radius);p=viewMatrix*vec4(world,1.);alpha=(1.-age)*.26;
        }else{p.xy+=across*position.x*width+along*position.y*length;alpha=mix(.52,.85,snow)*smoothstep(0.,.06,phase);}
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`${environmentVisibilityGlsl}
      uniform float snow;uniform vec4 bounds;uniform vec2 resolution;uniform mat4 cameraInverse,cameraWorld;
      varying vec2 tex;varying vec3 world;varying float alpha,splash;
      vec3 unproject(vec2 ndc,float z){vec4 p=cameraInverse*vec4(ndc,z,1.);return (cameraWorld*vec4(p.xyz/p.w,1.)).xyz;}
      void main(){if(environmentVisible(world.xz)<.5)discard;
        vec2 ndc=gl_FragCoord.xy/resolution*2.-1.;vec3 a=unproject(ndc,-1.),b=unproject(ndc,1.);vec3 ray=b-a;
        if(abs(ray.y)<.0001)discard;vec2 ground=(a+ray*(-a.y/ray.y)).xz;
        if(any(lessThan(ground,bounds.xy))||any(greaterThan(ground,bounds.xy+bounds.zw))||environmentVisible(ground)<.5)discard;
        vec2 uv=tex*2.-1.;float mask;
        if(splash>.5){float r=length(uv);mask=smoothstep(.58,.74,r)*(1.-smoothstep(.79,1.,r));}
        else if(snow>.5)mask=exp(-dot(uv,uv)*3.8)*(1.-smoothstep(.6,1.,length(uv)));
        else mask=(1.-abs(uv.x))*pow(1.-abs(uv.y),.5);
        gl_FragColor=vec4(mix(vec3(.65,.77,.89),vec3(.92,.96,1.),snow),alpha*mask);
      }`});
  const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=4;
  mesh.onBeforeRender=(_r,_s,camera)=>{uniforms.cameraInverse.value.copy(camera.projectionMatrixInverse);uniforms.cameraWorld.value.copy(camera.matrixWorld);};scene.add(mesh);
  let settings:EnvironmentPreviewSettings,quality='high';
  function updateBudget(){const low=settings.mistQuality==='low'||settings.mistQuality==='auto'&&(innerWidth<600||depth.resolution.x*depth.resolution.y>2e6);quality=low?'low':'high';geometry.instanceCount=Math.round((settings.weather==='snow'?1100:2200)*(settings.particleScale??(low?.35:1))*(settings.weatherIntensity??.5));}
  return {update(next:EnvironmentPreviewSettings){settings=next;mesh.visible=next.enabled&&next.mistQuality!=='off'&&!!next.weather&&next.weather!=='none'&&(next.weatherIntensity??.5)>0;
    uniforms.snow.value=next.weather==='snow'?1:0;uniforms.scaleFt.value=next.pixelsPerFoot??12.8;
    uniforms.bounds.value.set(next.mapX??0,next.mapY??0,next.mapWidth,next.mapHeight);
    const angle=(next.windDirectionDegrees??20)*Math.PI/180,speed=(next.windStrength??.4)*7;
    uniforms.wind.value.set(Math.cos(angle)*speed,Math.sin(angle)*speed);updateBudget();
  },tick(seconds:number){uniforms.time.value=seconds;if(settings)updateBudget();},
    get animated(){return mesh.visible;},
    get state(){return {weather:mesh.visible?settings.weather??'none':'none',weatherCount:mesh.visible?geometry.instanceCount:0,weatherQuality:quality,weatherTime:uniforms.time.value,windStrength:settings.windStrength??.4,weatherWindFt:uniforms.wind.value.length()};},
    dispose(){scene.remove(mesh);geometry.dispose();material.dispose();},
  };
}
