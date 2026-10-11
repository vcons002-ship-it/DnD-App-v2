import {LinearFilter,Mesh,NoBlending,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector2,Vector4,WebGLRenderTarget,type WebGLRenderer} from 'three';

const SLICES=32,COLUMNS=4,INTERVAL=1/8,PADDING=80;
/** Retain cloud detail in map units. Very large fields use the procedural path. */
export function mistCacheLayout(width:number,height:number,worldScale:number){
  const scale=Math.max(.001,worldScale),padding=PADDING*scale;
  const x=Math.ceil((width+padding*2)/(6*scale))+1,y=Math.ceil((height+padding*2)/(6*scale))+1;
  if(!Number.isFinite(x+y)||width<=0||height<=0||x*y*SLICES>2_000_000)return null;
  return {x,y,padding,width:(x+2)*COLUMNS,height:(y+2)*2,slices:SLICES};
}

export const mistCacheSampler=/* glsl */`
  uniform sampler2D mistCachePrevious,mistCacheNext;
  uniform vec4 mistCacheBounds;
  uniform vec2 mistCacheGrid;
  uniform float mistCacheEnabled,mistCacheBlend;
  vec4 mistCachedGroup(sampler2D field,vec2 uv,float group){
    vec2 tile=vec2(mod(group,4.0),floor(group/4.0));
    vec2 point=tile*(mistCacheGrid+2.0)+1.5+uv*(mistCacheGrid-1.0);
    return texture2D(field,point/((mistCacheGrid+2.0)*vec2(4.0,2.0)));
  }
  float mistCachedField(sampler2D field,vec2 uv,float y){
    float z=clamp(y*32.0-.5,0.0,31.0),layer=floor(z),group=floor(layer/4.0);
    int channel=int(mod(layer,4.0));vec4 values=mistCachedGroup(field,uv,group);
    float a=values[channel],b=a;
    if(channel<3)b=values[channel+1];
    else if(layer<31.0)b=mistCachedGroup(field,uv,group+1.0).r;
    return mix(a,b,fract(z))*2.3;
  }
  float mistAmbientAt(vec2 bent,float y){
    vec2 uv=(bent-mistCacheBounds.xy)/mistCacheBounds.zw;
    if(mistCacheEnabled<.5||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return mistAmbient(bent,y);
    return mix(mistCachedField(mistCachePrevious,uv,y),mistCachedField(mistCacheNext,uv,y),mistCacheBlend);
  }
`;

/** Interpolate an 8 Hz cloud field. Contact, visibility and light remain live. */
export function createMistDensityCache(source:string,common:Record<string,{value:any}>){
  const options={depthBuffer:false,stencilBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter};
  const targets=[0,1].map(()=>new WebGLRenderTarget(1,1,options));
  const uniforms={mistCachePrevious:{value:targets[0].texture},mistCacheNext:{value:targets[1].texture},
    mistCacheBounds:{value:new Vector4()},mistCacheGrid:{value:new Vector2(1,1)},mistCacheEnabled:{value:0},mistCacheBlend:{value:0}};
  const clock={value:0};
  const material=new ShaderMaterial({uniforms:{...common,...uniforms,mistTime:clock},blending:NoBlending,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:source+/* glsl */`
      uniform vec4 mistCacheBounds;uniform vec2 mistCacheGrid;
      void main(){
        vec2 stride=mistCacheGrid+2.0,tile=floor(gl_FragCoord.xy/stride);
        vec2 uv=(mod(gl_FragCoord.xy,stride)-1.5)/(mistCacheGrid-1.0);
        vec2 point=mistCacheBounds.xy+uv*mistCacheBounds.zw;
        float layer=(tile.y*4.0+tile.x)*4.0;
        // Four neighboring heights share one texel: most depth interpolation
        // uses a single read, with a second read only at a group boundary.
        gl_FragColor=vec4(mistAmbient(point,(layer+.5)/32.0),mistAmbient(point,(layer+1.5)/32.0),
          mistAmbient(point,(layer+2.5)/32.0),mistAmbient(point,(layer+3.5)/32.0))/2.3;
      }`});
  const geometry=new PlaneGeometry(2,2),scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,0,1);
  scene.add(new Mesh(geometry,material));
  let previous=0,next=1,start=-Infinity,key='',updates=0;
  function prepare(renderer:WebGLRenderer,enabled:boolean){
    uniforms.mistCacheEnabled.value=0;
    if(!enabled)return;
    const size=common.mistMapSize.value as Vector2,origin=common.mistOrigin.value as Vector2;
    const layout=mistCacheLayout(size.x,size.y,common.mistWorldScale.value);
    if(!layout||layout.width>renderer.capabilities.maxTextureSize||layout.height>renderer.capabilities.maxTextureSize)return;
    const wind=common.mistWind.value as Vector2;
    const nextKey=[size.x,size.y,origin.x,origin.y,common.mistWorldScale.value,wind.x,wind.y].join(',');
    const time=common.mistTime.value as number;
    const oldTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear,shadowUpdate=renderer.shadowMap.needsUpdate;
    const render=(index:number,at:number)=>{clock.value=at;renderer.setRenderTarget(targets[index]);renderer.render(scene,camera);updates++;};
    try{
      renderer.autoClear=true;renderer.shadowMap.needsUpdate=false;
      if(key!==nextKey||time<start||time>=start+2*INTERVAL){
        key=nextKey;start=Math.floor(time/INTERVAL)*INTERVAL;previous=0;next=1;
        uniforms.mistCacheBounds.value.set(origin.x-layout.padding,origin.y-layout.padding,size.x+layout.padding*2,size.y+layout.padding*2);
        uniforms.mistCacheGrid.value.set(layout.x,layout.y);
        for(const target of targets)if(target.width!==layout.width||target.height!==layout.height)target.setSize(layout.width,layout.height);
        render(previous,start);render(next,start+INTERVAL);
      }else if(time>=start+INTERVAL){
        [previous,next]=[next,previous];start+=INTERVAL;render(next,start+INTERVAL);
      }
      uniforms.mistCachePrevious.value=targets[previous].texture;uniforms.mistCacheNext.value=targets[next].texture;
      uniforms.mistCacheBlend.value=Math.max(0,Math.min(1,(time-start)/INTERVAL));uniforms.mistCacheEnabled.value=1;
    }finally{renderer.setRenderTarget(oldTarget);renderer.autoClear=autoClear;renderer.shadowMap.needsUpdate=shadowUpdate;}
  }
  return {uniforms,prepare,get state(){return {densityCache:uniforms.mistCacheEnabled.value>.5,cacheUpdates:updates,cacheResolution:`${targets[0].width}x${targets[0].height}`,cacheSlices:SLICES,cacheHz:1/INTERVAL};},
    dispose(){for(const target of targets)target.dispose();material.dispose();geometry.dispose();}};
}
