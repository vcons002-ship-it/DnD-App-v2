import {CanvasTexture,DoubleSide,Mesh,MeshBasicMaterial,PlaneGeometry,Scene,SRGBColorSpace,type DepthTexture,type Vector2} from 'three';
import type {MiniatureNameLabel} from './miniatureNameLabels';

/** Name and health HUD pixels share the miniature depth mask. Covered pixels
 * remain faint; uncovered pixels retain their full opacity. */
export function createMiniatureNameLayer(scene:Scene,depth:DepthTexture,resolution:{value:Vector2}) {
  const labels=new Map<string,{mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;texture:CanvasTexture;canvas:HTMLCanvasElement;covered:{value:number};points:number[]}>();
  let textureUpdates=0,positionUpdates=0;
  const remove=(id:string)=>{
    const entry=labels.get(id);if(!entry)return;
    scene.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh.material.dispose();entry.texture.dispose();labels.delete(id);
  };
  return {
    sync(descriptors:MiniatureNameLabel[],visible:ReadonlySet<string>,shared:ReadonlySet<string>=new Set()){
      const rendered=new Set<string>();
      for(const label of descriptors){
        if(!visible.has(label.id))continue;
        rendered.add(label.id);
        let entry=labels.get(label.id);
        if(!entry){
          const texture=new CanvasTexture(label.canvas);texture.colorSpace=SRGBColorSpace;
          const material=new MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:DoubleSide});
          const covered={value:.22};
          material.onBeforeCompile=shader=>{
            shader.uniforms.nameDepth={value:depth};shader.uniforms.nameResolution=resolution;shader.uniforms.nameCoveredOpacity=covered;
            shader.fragmentShader='uniform sampler2D nameDepth; uniform vec2 nameResolution; uniform float nameCoveredOpacity;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
              float bodyDepth = texture2D(nameDepth, gl_FragCoord.xy / nameResolution).x;
              float covered = step(bodyDepth + 0.000001, gl_FragCoord.z);
              diffuseColor.a *= mix(1.0, nameCoveredOpacity, covered);
            `);
          };
          material.customProgramCacheKey=()=> 'miniature-name-depth-v1';
          const mesh=new Mesh(new PlaneGeometry(1,1),material);
          mesh.name='miniature-name';mesh.renderOrder=10000;mesh.frustumCulled=false;mesh.raycast=()=>{};
          scene.add(mesh);entry={mesh,texture,canvas:label.canvas,covered,points:[]};labels.set(label.id,entry);textureUpdates++;
        }
        if(entry.canvas!==label.canvas){
          entry.texture.dispose();entry.texture=new CanvasTexture(label.canvas);entry.texture.colorSpace=SRGBColorSpace;
          entry.canvas=label.canvas;entry.mesh.material.map=entry.texture;textureUpdates++;
        }
        entry.covered.value=label.emphasized?1:.22;
        entry.mesh.layers.set(shared.has(label.id)?4:0);
        entry.mesh.material.opacity=label.opacity;
        const position=entry.mesh.geometry.getAttribute('position');
        // Keep exact map-space points separately from the Float32 GPU buffer.
        // Stationary labels need no geometry upload during lighting animation.
        if(label.points.some((p,i)=>entry!.points[i*2]!==p.x||entry!.points[i*2+1]!==p.y)){
          label.points.forEach((p,i)=>{position.setXYZ(i,p.x,0,p.y);entry!.points[i*2]=p.x;entry!.points[i*2+1]=p.y;});
          position.needsUpdate=true;positionUpdates++;
        }
      }
      for(const id of labels.keys())if(!rendered.has(id))remove(id);
      return rendered;
    },
    dispose(){for(const id of labels.keys())remove(id);},
    get state(){return {nameTextureUpdates:textureUpdates,namePositionUpdates:positionUpdates};},
  };
}
