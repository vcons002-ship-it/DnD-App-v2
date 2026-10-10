import {
  AlwaysStencilFunc, EqualStencilFunc, KeepStencilOp, ReplaceStencilOp,
  BufferGeometry, CanvasTexture, CustomBlending, DoubleSide, Float32BufferAttribute, FramebufferTexture, Mesh,
  MeshBasicMaterial, NoBlending, OrthographicCamera, PlaneGeometry, Scene,
  OneFactor, OneMinusSrcColorFactor, ShaderMaterial, ShapeUtils, Vector2, WebGLRenderTarget,
  type Camera, type Texture, type WebGLRenderer,
} from 'three';
import {lightFalloffGlsl} from '../../../shared/lightFalloff';
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
};

/** Composite terrain visibility and personal bodies on the existing canvas.
 * No second color canvas, Canvas2D scene copy, or framebuffer restore pass.
 * The SVG terrain cover/memory and its color grading remain unchanged below it.
 */
export function createMiniatureVisionComposite(renderer:WebGLRenderer, host:HTMLElement, body:Texture) {
  const cover = new WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:true});
  const coverScene = new Scene();
  // Pack current sight in R and remembered terrain in G. Per-channel union
  // preserves the other channel while combining overlapping soft lights.
  const blend={transparent:true,blending:CustomBlending,blendSrc:OneFactor,blendDst:OneMinusSrcColorFactor};
  const white = new MeshBasicMaterial({...blend,color:0xff0000,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  const remembered=new MeshBasicMaterial({...blend,color:0x00ff00,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
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
        gl_FragColor=vec4(a,0.,0.,1.);
      }`,
  });
  const entries = new Map<string,{mesh:Mesh;points:WallPoint[]}>();
  const quadScene = new Scene(), quadCamera = new OrthographicCamera(-1,1,1,-1,0,1);
  let frame:FramebufferTexture|undefined, previous:VisionCoverFrame|undefined, cameraKey='';
  let memory:CanvasTexture|undefined,memoryCanvas:HTMLCanvasElement|null=null,memoryVersion='';
  const composite = new ShaderMaterial({uniforms:{frame:{value:null as Texture|null},cover:{value:cover.texture},body:{value:body},memory:{value:body},hasMemory:{value:0}},
    depthTest:false,depthWrite:false,toneMapped:false,blending:NoBlending,
    vertexShader:'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
    // The finished framebuffer already has output color conversion and premultiplied alpha.
    fragmentShader:`uniform sampler2D frame,cover,body,memory;uniform float hasMemory;varying vec2 uvScreen;
      void main(){vec4 c=texture2D(frame,uvScreen),b=texture2D(body,uvScreen),sight=texture2D(cover,uvScreen);
        float v=sight.r,body=b.r*b.a,f=1.-v;
        vec3 fog=mix(vec3(5.,6.,8.)/255.,texture2D(memory,uvScreen).rgb,sight.g*hasMemory);
        // Collapse the old three-layer composition algebraically: scene below
        // fog, then body-only scene above fog. Preserve premultiplied alpha,
        // including invisible figures and the old soft-boundary appearance.
        float gain=v+body*f*(1.-c.a*v);
        float alpha=c.a*(1.+body*f*(1.-c.a));
        gl_FragColor=vec4(c.rgb*gain+fog*f*c.a*(1.-c.a*body*f),alpha);
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
    next.lights.forEach(({polygon,source},i)=>add('light:'+i,polygon,lamp,3,source));
    next.memoryRange?.forEach((p,i)=>add('range:'+i,p,rangeStencil,4));
    for(const [id,entry] of entries)if(!live.has(id)){coverScene.remove(entry.mesh);entry.mesh.geometry.dispose();if(id.startsWith('light:'))(entry.mesh.material as ShaderMaterial).dispose();entries.delete(id);}
  };
  const originalZ=host.style.zIndex;
  return {
    render(enabled:boolean,next:VisionCoverFrame|undefined,camera:Camera){
      enabled=enabled&&!!next?.enabled;
      host.style.zIndex=enabled?'3':originalZ;
      host.dataset.visionComposite=enabled?'gpu':'off';
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
      renderer.copyFramebufferToTexture(frame);
      composite.uniforms.cover.value=cover.texture;
      renderer.render(quadScene,quadCamera);
    },
    dispose(){host.style.zIndex=originalZ;for(const [id,e] of entries){e.mesh.geometry.dispose();if(id.startsWith('light:'))(e.mesh.material as ShaderMaterial).dispose();}entries.clear();white.dispose();remembered.dispose();rangedMemory.dispose();rangeStencil.dispose();stencil.dispose();lamp.dispose();cover.dispose();frame?.dispose();memory?.dispose();composite.dispose();quadGeometry.dispose();},
  };
}
