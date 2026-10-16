import {
  AlwaysStencilFunc, EqualStencilFunc, KeepStencilOp, ReplaceStencilOp,
  BufferGeometry, CanvasTexture, CustomBlending, DataTexture, DoubleSide, Float32BufferAttribute, FramebufferTexture, Mesh, NearestFilter,
  MeshBasicMaterial, NoBlending, OrthographicCamera, PlaneGeometry, Scene,
  OneFactor, OneMinusSrcColorFactor, OneMinusSrcAlphaFactor, ShaderMaterial, ShapeUtils, Vector2, WebGLRenderTarget,
  Matrix4,Vector4,type Camera, type Texture, type WebGLRenderer,
} from 'three';
import {lightFalloffGlsl,lightColorCoverage,lightIrradiance,spellEmissionIrradiance} from '../../../shared/lightFalloff';
import {createLightSightCache} from '../../../shared/lightSightCache';
import {HEAVY_DARKVISION_DESATURATION,REGULAR_DARKVISION_DESATURATION} from '../../../shared/terrainLighting';
import type {VisionLight} from '../../../shared/playerVision';
import type {WallPoint} from '../../../shared/mapWalls';
import type {ExploredTerrain} from '../../../shared/exploration';

/** The same live polygons used by the SVG terrain cover. Cosmetic spell light
 * is deliberately excluded: it must never reveal an unseen room. */
export type VisionCoverFrame = {
  enabled: boolean;
  origins: WallPoint[][];
  sight: WallPoint[][];
  lights: {polygon: WallPoint[]; source: VisionLight}[];
  explored: ExploredTerrain;
  memory: HTMLCanvasElement|null;
  keepRevealed: boolean;
  memoryRange?: WallPoint[][];
  grade?: {heavy:boolean;daylight:boolean;near:WallPoint[][]};
};

/** Composite terrain visibility and personal bodies on the existing canvas.
 * No second color canvas, Canvas2D scene copy, or framebuffer restore pass.
 * The SVG terrain cover/memory and CSS artwork grading remain below it.
 */
export function createMiniatureVisionComposite(renderer:WebGLRenderer, host:HTMLElement, body:Texture) {
  const cover = new WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:true});
  const coverScene = new Scene();
  // Pack current sight in R and remembered terrain in G. Per-channel union
  // preserves the other channel while combining overlapping soft lights.
  const blend={transparent:true,blending:CustomBlending,blendSrc:OneFactor,blendDst:OneMinusSrcColorFactor,blendSrcAlpha:OneFactor,blendDstAlpha:OneMinusSrcAlphaFactor};
  const white = new MeshBasicMaterial({...blend,opacity:0,color:0xff0000,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  const remembered=new MeshBasicMaterial({...blend,opacity:0,color:0x00ff00,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  const near=white.clone();near.color.set(0x0000ff);
  const stencil = new MeshBasicMaterial({colorWrite:false,side:DoubleSide,depthTest:false,depthWrite:false,
    stencilWrite:true,stencilRef:1,stencilFunc:AlwaysStencilFunc,
    stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:ReplaceStencilOp});
  const rangeStencil=stencil.clone();rangeStencil.stencilRef=2;rangeStencil.transparent=true;
  const rangedMemory=remembered.clone();Object.assign(rangedMemory,{stencilWrite:true,stencilRef:2,stencilFunc:EqualStencilFunc,
    stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:KeepStencilOp});
  const lamp = new ShaderMaterial({...blend,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false,
    stencilWrite:true,stencilRef:1,stencilFunc:EqualStencilFunc,
    stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:KeepStencilOp,
    uniforms:{source:{value:new Float32Array(4)},strength:{value:0}},
    vertexShader:'varying vec2 world; void main(){world=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`${lightFalloffGlsl}
      uniform vec4 source;uniform float strength;varying vec2 world;
      void main(){
        // Match the existing 48 nested SVG attenuation bands, including their
        // sampling offset, rather than changing light reach during optimization.
        float d=length(world-source.xz),r=source.w;
        float band=ceil(d*32./max(.001,r));
        float sampleDistance=max(0.,band*r/32.-r/64.);
        float a=band>48.?0.:lightColorCoverage(lightIrradiance(length(vec2(sampleDistance,source.y)),r,strength));
        gl_FragColor=vec4(a,0.,0.,a);
      }`,
  });
  const entries = new Map<string,{mesh:Mesh;points:WallPoint[]}>();
  const quadScene = new Scene(), quadCamera = new OrthographicCamera(-1,1,1,-1,0,1);
  let frame:FramebufferTexture|undefined, previous:VisionCoverFrame|undefined, cameraKey='';
  let memory:CanvasTexture|undefined,memoryCanvas:HTMLCanvasElement|null=null,memoryVersion='';
  const gradeBytes=new Uint8Array(256*4),bodyGrades=new DataTexture(gradeBytes,256,1);gradeBytes[0]=gradeBytes[255*4]=255;bodyGrades.minFilter=bodyGrades.magFilter=NearestFilter;bodyGrades.needsUpdate=true;
  const bodyCoverCache=new Map<number,{x:number;y:number;polygons:WeakMap<WallPoint[],boolean>}>();
  const flashSight=new Map<number,ReturnType<typeof createLightSightCache>>();
  const inside=(p:WallPoint,polygon:WallPoint[])=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
  }return yes;};
  const composite = new ShaderMaterial({uniforms:{frame:{value:null as Texture|null},cover:{value:cover.texture},body:{value:body},memory:{value:body},hasMemory:{value:0},fogEnabled:{value:0},gradeMode:{value:0},retained:{value:0},bodyGrades:{value:bodyGrades},groundLight:{value:body},hasGroundLight:{value:0},lightBounds:{value:new Vector4()},cameraWorld:{value:new Matrix4()},projectionInverse:{value:new Matrix4()}},
    depthTest:false,depthWrite:false,toneMapped:false,blending:NoBlending,
    vertexShader:'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
    // The finished framebuffer already has output color conversion and premultiplied alpha.
    fragmentShader:`${lightFalloffGlsl}uniform sampler2D frame,cover,body,memory,bodyGrades,groundLight;uniform float hasMemory,fogEnabled,gradeMode,retained,hasGroundLight;uniform mat4 cameraWorld,projectionInverse;uniform vec4 lightBounds;varying vec2 uvScreen;
      float lightCoverage(){
        vec4 n=cameraWorld*projectionInverse*vec4(uvScreen*2.-1.,-1.,1.),f=cameraWorld*projectionInverse*vec4(uvScreen*2.-1.,1.,1.);
        vec3 a=n.xyz/n.w,b=f.xyz/f.w,d=b-a;
        vec2 world=(a+d*(-a.y/(abs(d.y)<.0001?.0001:d.y))).xz,uv=(world-lightBounds.xy)/max(lightBounds.zw,vec2(.001));
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;
        vec3 light=texture2D(groundLight,uv).rgb;return lightColorCoverage(max(light.r,max(light.g,light.b)));
      }
      vec3 grade(vec3 c,float unlit,float near){
        float saturation=gradeMode>1.5?${HEAVY_DARKVISION_DESATURATION}:mix(.88,${REGULAR_DARKVISION_DESATURATION},near);
        float brightness=gradeMode>1.5?1.:mix(.78,1.18,near);
        return mix(c,mix(c,vec3(dot(c,vec3(.2126,.7152,.0722))),saturation)*brightness,unlit);
      }
      void main(){vec4 c=texture2D(frame,uvScreen),b=texture2D(body,uvScreen),sight=texture2D(cover,uvScreen);
        float v=mix(1.,sight.r,fogEnabled),bodyCoverage=b.r*b.a,f=1.-v;
        if(gradeMode>.5){
          vec2 token=texture2D(bodyGrades,vec2((floor(b.b*255.+.5)+.5)/256.,.5)).rg;
          float lit=hasGroundLight>.5?lightCoverage():sight.a;
          vec3 terrain=grade(c.rgb,(1.-lit)*(1.-retained*sight.g),sight.b);
          c.rgb=mix(terrain,grade(c.rgb,token.r,token.g),bodyCoverage);
        }
        vec3 fog=mix(vec3(5.,6.,8.)/255.,texture2D(memory,uvScreen).rgb,sight.g*hasMemory);
        // Collapse the old three-layer composition algebraically: scene below
        // fog, then body-only scene above fog. Preserve premultiplied alpha,
        // including invisible figures and the old soft-boundary appearance.
        float gain=v+bodyCoverage*f*(1.-c.a*v);
        float alpha=c.a*(1.+bodyCoverage*f*(1.-c.a));
        gl_FragColor=vec4(c.rgb*gain+fog*f*c.a*(1.-c.a*bodyCoverage*f),alpha);
      }`,
  });
  const quadGeometry=new PlaneGeometry(2,2);quadScene.add(new Mesh(quadGeometry,composite));
  const geometry=(points:WallPoint[],holes:WallPoint[][]=[])=>{
    const vertices=points.map(p=>new Vector2(p.x,p.y));
    const rings=holes.map(r=>r.map(p=>new Vector2(p.x,p.y)));
    const indices=ShapeUtils.triangulateShape(vertices,rings).flat();
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([...vertices,...rings.flat()].flatMap(p=>[p.x,0,p.y]),3));g.setIndex(indices);return g;
  };
  let updates=0;
  const exploredRings=new WeakMap<object,{outer:WallPoint[];holes:WallPoint[][]}>();
  const sync=(next:VisionCoverFrame)=>{
    const live=new Set<string>();
    const add=(id:string,points:WallPoint[],material:MeshBasicMaterial|ShaderMaterial,order:number,source?:VisionLight,holes?:WallPoint[][])=>{
      if(points.length<3)return;live.add(id);let entry=entries.get(id);
      if(!entry){const mesh=new Mesh(geometry(points,holes),source?material.clone():material);mesh.frustumCulled=false;mesh.renderOrder=order;coverScene.add(mesh);entry={mesh,points};entries.set(id,entry);}
      else if(entry.points!==points){entry.mesh.geometry.dispose();entry.mesh.geometry=geometry(points,holes);entry.points=points;}
      entry.mesh.renderOrder=order;if(!source)entry.mesh.material=material;
      if(source){const m=entry.mesh.material as ShaderMaterial;m.uniforms.source.value.set([source.x,source.height,source.y,source.radius]);m.uniforms.strength.value=source.strength;}
    };
    next.explored.forEach((rings,i)=>{
      let converted=exploredRings.get(rings);
      if(!converted){const [outer,...holes]=rings.map(r=>r.map(([x,y])=>({x,y})));converted={outer,holes};exploredRings.set(rings,converted);}
      if(converted.outer)add('memory:'+i,converted.outer,next.memoryRange?rangedMemory:remembered,next.memoryRange?5:1,undefined,converted.holes);
    });
    next.sight.forEach((p,i)=>add('sight:'+i,p,stencil,0));
    next.origins.forEach((p,i)=>add('origin:'+i,p,white,2));
    next.grade?.near.forEach((p,i)=>add('near:'+i,p,near,2));
    next.lights.forEach(({polygon,source},i)=>add('light:'+i,polygon,lamp,3,source));
    next.memoryRange?.forEach((p,i)=>add('range:'+i,p,rangeStencil,4));
    for(const [id,entry] of entries)if(!live.has(id)){coverScene.remove(entry.mesh);entry.mesh.geometry.dispose();if(id.startsWith('light:'))(entry.mesh.material as ShaderMaterial).dispose();entries.delete(id);}
  };
  const originalZ=host.style.zIndex;
  return {
    gradeBodies(next:VisionCoverFrame|undefined,bodies:readonly {slot:number;x:number;y:number}[],field?:{torchField:{value:Texture};torchBounds:{value:Vector4}},flashes:readonly VisionLight[]=[],walls:import('../../../shared/mapWalls').MapWall[]=[]){
      composite.uniforms.hasGroundLight.value=field?1:0;
      if(field){composite.uniforms.groundLight.value=field.torchField.value;composite.uniforms.lightBounds.value.copy(field.torchBounds.value);}
      if(!next?.grade)return;
      let changed=false;
      for(const p of bodies){if(!p.slot)continue;let irradiance=0;
        let cache=bodyCoverCache.get(p.slot);if(!cache||cache.x!==p.x||cache.y!==p.y){cache={x:p.x,y:p.y,polygons:new WeakMap()};bodyCoverCache.set(p.slot,cache);}
        const covered=(poly:WallPoint[])=>{let yes=cache!.polygons.get(poly);if(yes===undefined){yes=inside(p,poly);cache!.polygons.set(poly,yes);}return yes;};
        for(const {source,polygon} of next.lights)if(covered(polygon))irradiance+=lightIrradiance(Math.hypot(p.x-source.x,p.y-source.y,source.height),source.radius,source.strength);
        let sight=flashSight.get(p.slot);if(!sight){sight=createLightSightCache();flashSight.set(p.slot,sight);}
        for(const source of flashes)if(Math.hypot(p.x-source.x,p.y-source.y)<source.radius*1.5&&sight.visible(source.id,source,p,walls))irradiance+=spellEmissionIrradiance(Math.hypot(p.x-source.x,p.y-source.y,source.height),source.radius,source.strength);
        const offset=p.slot*4,unlit=next.grade.daylight?0:Math.round((1-lightColorCoverage(irradiance))*255),near=next.grade.near.some(covered)?255:0;
        if(gradeBytes[offset]!==unlit||gradeBytes[offset+1]!==near){gradeBytes[offset]=unlit;gradeBytes[offset+1]=near;changed=true;}
      }
      if(changed)bodyGrades.needsUpdate=true;
    },
    /** This frame's screen-space visibility (red = in sight), for clipping spell art. */
    get cover(){return {texture:cover.texture,width:cover.width,height:cover.height};},
    render(enabled:boolean,next:VisionCoverFrame|undefined,camera:Camera){
      const grading=enabled&&!!next?.grade&&!next.grade.daylight;
      const fog=enabled&&!!next?.enabled;
      enabled=fog||grading;
      host.style.zIndex=enabled?'3':originalZ;
      host.dataset.visionComposite=enabled?'gpu':'off';
      composite.uniforms.fogEnabled.value=fog?1:0;
      if(host.parentElement)host.parentElement.dataset.gpuVisionGrade=String(grading);
      composite.uniforms.gradeMode.value=grading?(next!.grade!.heavy?2:1):0;
      composite.uniforms.retained.value=next?.keepRevealed?1:0;
      composite.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      composite.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
      if(!enabled||!next)return;
      const {width,height}=renderer.domElement;
      if(!frame||frame.image.width!==width||frame.image.height!==height){frame?.dispose();frame=new FramebufferTexture(width,height);composite.uniforms.frame.value=frame;cover.setSize(width,height);previous=undefined;}
      const key=camera.projectionMatrix.elements.join(',')+':'+camera.matrixWorld.elements.join(',');
      if(previous!==next||cameraKey!==key){
        sync(next);const target=renderer.getRenderTarget(),pending=renderer.shadowMap.needsUpdate;
        renderer.shadowMap.needsUpdate=false;
        try{renderer.setRenderTarget(cover);renderer.clear(true,true,true);renderer.render(coverScene,camera);}
        finally{renderer.setRenderTarget(target);renderer.shadowMap.needsUpdate=pending;}
        previous=next;cameraKey=key;updates++;
      }
      host.dataset.visionCoverUpdates=String(updates);
      if(next.memory&&next.memory.dataset.ready==='true'){
        if(memoryCanvas!==next.memory){memory?.dispose();memoryCanvas=next.memory;memory=new CanvasTexture(memoryCanvas);composite.uniforms.memory.value=memory;memoryVersion='';}
        const version=next.memory.dataset.version??'ready';
        if(memoryVersion!==version){memory!.needsUpdate=true;memoryVersion=version;}
        composite.uniforms.hasMemory.value=1;
      }else composite.uniforms.hasMemory.value=0;
      // A reused framebuffer texture may already be bound to unit 0 while a
      // mask/grade sampler is the active unit. bindTexture's cache can then
      // skip activating unit 0, causing the copy to overwrite that mask.
      renderer.state.activeTexture(renderer.getContext().TEXTURE0);
      renderer.copyFramebufferToTexture(frame);
      composite.uniforms.cover.value=cover.texture;
      // Preserve model depth for the visible spell color pass after terrain fog.
      const autoClear=renderer.autoClear;
      try{renderer.autoClear=false;renderer.render(quadScene,quadCamera);}
      finally{renderer.autoClear=autoClear;}
    },
    dispose(){host.style.zIndex=originalZ;if(host.parentElement)delete host.parentElement.dataset.gpuVisionGrade;for(const [id,e] of entries){e.mesh.geometry.dispose();if(id.startsWith('light:'))(e.mesh.material as ShaderMaterial).dispose();}entries.clear();white.dispose();near.dispose();remembered.dispose();rangedMemory.dispose();rangeStencil.dispose();stencil.dispose();lamp.dispose();cover.dispose();frame?.dispose();memory?.dispose();bodyGrades.dispose();composite.dispose();quadGeometry.dispose();},
  };
}
