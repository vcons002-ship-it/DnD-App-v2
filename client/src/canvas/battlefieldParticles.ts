import {InstancedBufferAttribute,InstancedBufferGeometry,Matrix4,Mesh,PlaneGeometry,ShaderMaterial,Vector2,Vector4,type Scene,type Texture} from 'three';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
import {environmentVisibilityGlsl,type createEnvironmentVisibility} from './environmentVisibility';

/** One bounded draw call; motion stays in map coordinates as the camera moves. */
export function createBattlefieldParticles(scene:Scene,depth:{texture:Texture;resolution:Vector2},visibility:ReturnType<typeof createEnvironmentVisibility>['uniforms']){
  const quad=new PlaneGeometry(1,1),geometry=new InstancedBufferGeometry();geometry.index=quad.index;geometry.attributes=quad.attributes;
  const seeds=new Float32Array(1400*4);let seed=491;
  for(let i=0;i<seeds.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;seeds[i]=seed/4294967296;}
  geometry.setAttribute('seed',new InstancedBufferAttribute(seeds,4));
  const uniforms={...visibility,time:{value:0},kind:{value:0},scaleFt:{value:12.8},bounds:{value:new Vector4()},wind:{value:new Vector2()},ambient:{value:1},
    resolution:{value:depth.resolution},cameraInverse:{value:new Matrix4()},cameraWorld:{value:new Matrix4()}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms,
    vertexShader:`attribute vec4 seed;uniform float time,kind,scaleFt,ambient;uniform vec4 bounds;uniform vec2 wind;
      varying vec2 tex;varying vec3 world,color;varying float alpha;
      void main(){tex=uv;float t=time,phase=fract(seed.z+t*.075);
        vec2 drift=wind*t*scaleFt+vec2(sin(t*.65+seed.w*41.),cos(t*.48+seed.x*32.))*scaleFt*.75;
        float height=(1.-phase)*9.*scaleFt,angle=t*(1.+seed.x)+seed.w*31.;
        vec2 size=vec2(.35,.7)*scaleFt;alpha=.88;
        color=mix(vec3(.68,.19,.035),vec3(.98,.64,.10),seed.w)*ambient;
        if(kind>1.5&&kind<2.5){
          drift=wind*t*scaleFt*.08+vec2(sin(t*.48+seed.w*41.)*1.6,cos(t*.39+seed.x*32.)*1.2)*scaleFt;
          height=(1.3+seed.z*3.+sin(t*.6+seed.w*31.)*.55)*scaleFt;
          size=vec2(.85)*scaleFt;angle=0.;alpha=.45+.5*pow(.5+.5*sin(t*1.5+seed.w*43.),2.);
          color=mix(vec3(.65,1.,.20),vec3(1.,.88,.35),seed.w);
        }else if(kind>2.5&&kind<3.5){
          float spark=step(.45,seed.w);height=mix(1.-phase,phase,spark)*10.*scaleFt;
          size=vec2(mix(.19,.34,spark))*scaleFt;
          color=mix(vec3(.48,.44,.39)*ambient,vec3(1.,.34,.035),spark);alpha=mix(.75,.9,spark);
        }else if(kind>3.5){
          height=(.5+seed.z*7.+sin(t*.5+seed.w*30.)*.4)*scaleFt;
          size=vec2(.10,.22)*scaleFt;color=vec3(.76,.60,.37)*ambient;alpha=.55;
        }
        vec2 ground=bounds.xy+mod(seed.xy*bounds.zw+drift,bounds.zw);
        world=vec3(ground.x,height,ground.y);vec4 p=viewMatrix*vec4(world,1.);
        vec2 corner=position.xy*size;
        if(kind<1.5){corner.x*=.35+.65*abs(sin(t*1.7+seed.z*31.));alpha*=smoothstep(0.,.05,phase)*smoothstep(0.,.08,1.-phase);}
        p.xy+=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*corner;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`${environmentVisibilityGlsl}
      uniform float kind;uniform vec4 bounds;uniform vec2 resolution;uniform mat4 cameraInverse,cameraWorld;
      varying vec2 tex;varying vec3 world,color;varying float alpha;
      vec3 unproject(vec2 ndc,float z){vec4 p=cameraInverse*vec4(ndc,z,1.);return (cameraWorld*vec4(p.xyz/p.w,1.)).xyz;}
      void main(){if(environmentVisible(world.xz)<.5)discard;
        vec2 ndc=gl_FragCoord.xy/resolution*2.-1.;vec3 a=unproject(ndc,-1.),b=unproject(ndc,1.);vec3 ray=b-a;
        if(abs(ray.y)<.0001)discard;vec2 ground=(a+ray*(-a.y/ray.y)).xz;
        if(any(lessThan(ground,bounds.xy))||any(greaterThan(ground,bounds.xy+bounds.zw))||environmentVisible(ground)<.5)discard;
        vec2 q=tex*2.-1.;float radius=length(q),mask;vec3 shaded=color;
        if(kind<1.5){
          float edge=(1.-q.y*q.y)*(.82+.1*sin(q.y*18.));
          mask=(1.-smoothstep(edge-.09,edge,abs(q.x)))*(1.-smoothstep(.92,1.,abs(q.y)));
          shaded*=.8+.2*smoothstep(.01,.08,abs(q.x));
        }else if(kind<2.5){
          mask=exp(-radius*radius*5.)*.3+exp(-radius*radius*90.);
          mask*=1.-smoothstep(.7,1.,radius);shaded=mix(color,vec3(1.,1.,.8),exp(-radius*radius*75.));
        }else mask=exp(-radius*radius*3.5)*(1.-smoothstep(.6,1.,radius));
        if(mask*alpha<.005)discard;gl_FragColor=vec4(shaded,mask*alpha);
      }`});
  const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=4;
  mesh.onBeforeRender=(_r,_s,camera)=>{uniforms.cameraInverse.value.copy(camera.projectionMatrixInverse);uniforms.cameraWorld.value.copy(camera.matrixWorld);};scene.add(mesh);
  let settings:EnvironmentPreviewSettings,quality='high';
  const budgets={none:0,leaves:350,fireflies:140,embers:900,dust:1400};
  function updateBudget(){
    const low=settings.mistQuality==='low'||settings.mistQuality==='auto'&&(innerWidth<600||depth.resolution.x*depth.resolution.y>2e6);
    quality=low?'low':'high';geometry.instanceCount=Math.round(budgets[settings.particles??'none']*(low?.35:1)*(settings.particleIntensity??.5));
  }
  return {update(next:EnvironmentPreviewSettings){settings=next;
    mesh.visible=next.enabled&&next.mistQuality!=='off'&&!!next.particles&&next.particles!=='none'&&(next.particleIntensity??.5)>0;
    uniforms.kind.value=['none','leaves','fireflies','embers','dust'].indexOf(next.particles??'none');
    uniforms.scaleFt.value=next.pixelsPerFoot??12.8;uniforms.bounds.value.set(next.mapX??0,next.mapY??0,next.mapWidth,next.mapHeight);
    const angle=(next.windDirectionDegrees??20)*Math.PI/180,speed=(next.windStrength??.4)*5;
    uniforms.wind.value.set(Math.cos(angle)*speed,Math.sin(angle)*speed);
    uniforms.ambient.value=(next.lighting==='night'||next.lighting==='dungeon'?.35:next.lighting==='dusk'?.8:1)*(next.lightLevel??1)*(next.heavyDarkness?.1:1);
    updateBudget();
  },tick(seconds:number){uniforms.time.value=seconds;if(settings)updateBudget();},
    get animated(){return mesh.visible;},
    get state(){return {particles:mesh.visible?settings.particles??'none':'none',particleCount:mesh.visible?geometry.instanceCount:0,particleQuality:quality,particleTime:uniforms.time.value};},
    dispose(){scene.remove(mesh);geometry.dispose();material.dispose();},
  };
}
