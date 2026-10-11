import {DataTexture,FloatType,RGBAFormat,type Material,type Vector2,type Vector3,type Vector4,type Texture} from 'three';

export type MiniatureLightUniforms={torchCount:{value:number};darkvisionDetail:{value:number};torchShadowSlots:{value:number[]};torchPositions:{value:Vector4[]};torchColors:{value:Vector3[]};torchGroundEnabled?:{value:number};torchGroundField?:{value:Texture};torchGroundBounds?:{value:Vector4};torchGroundPoint?:{value:Vector2};[key:string]:{value:unknown}|undefined};
const WIDTH=19;

/** One row per instance preserves its own nearby lights and wall occlusion.
 * This removes light-set boundaries from otherwise identical model draws.
 * Shared shadow maps stay ordinary uniforms; only source selection is packed. */
export function createMiniatureBatchLighting(capacity:number){
  const data=new Float32Array(WIDTH*capacity*4),texture=new DataTexture(data,WIDTH,capacity,RGBAFormat,FloatType);
  texture.needsUpdate=true;
  const uniforms={batchTorches:{value:texture},batchTorchRows:{value:capacity}};
  let dirty=false;
  const write=(offset:number,value:number)=>{const f=Math.fround(value);if(data[offset]!==f){data[offset]=f;dirty=true;}};
  return {texture,
    write(row:number,source:MiniatureLightUniforms){
      const base=row*WIDTH*4;
      write(base,source.torchCount.value);write(base+1,source.darkvisionDetail.value);
      for(let i=0;i<8;i++){
        const p=source.torchPositions.value[i],c=source.torchColors.value[i],pos=base+(1+i)*4,col=base+(9+i)*4;
        write(pos,p.x);write(pos+1,p.y);write(pos+2,p.z);write(pos+3,p.w);
        write(col,c.x);write(col+1,c.y);write(col+2,c.z);write(col+3,source.torchShadowSlots.value[i]);
      }
    },
    flush(){if(dirty){texture.needsUpdate=true;dirty=false;}},
    attach(material:Material){
      const hook=material.onBeforeCompile,cache=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        hook.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='attribute float instanceTorchRow; varying float batchTorchRow;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nbatchTorchRow=instanceTorchRow;');
        // Basic base materials have no torch hook; their shader is left intact.
        if(shader.fragmentShader.includes('uniform float torchShadowSlots[8];')){
          shader.fragmentShader=shader.fragmentShader.replace('uniform float torchShadowSlots[8]; uniform float darkvisionDetail; uniform int torchCount; uniform vec4 torchPositions[8]; uniform vec3 torchColors[8];',`uniform sampler2D batchTorches; uniform float batchTorchRows; varying float batchTorchRow;
            vec4 batchTorchTexel(float column){return texture2D(batchTorches,vec2((column+.5)/${WIDTH}.,(batchTorchRow+.5)/batchTorchRows));}
            vec4 batchTorchPosition(int i){return batchTorchTexel(1.+float(i));}
            vec4 batchTorchColor(int i){return batchTorchTexel(9.+float(i));}`);
          shader.fragmentShader=shader.fragmentShader.replaceAll('torchPositions[torchIndex]','batchTorchPosition(torchIndex)')
            .replaceAll('torchColors[torchIndex]','batchTorchColor(torchIndex).rgb')
            .replaceAll('torchShadowSlots[torchIndex]','batchTorchColor(torchIndex).a')
            .replaceAll('torchCount','int(batchTorchTexel(0.).x)').replaceAll('darkvisionDetail','batchTorchTexel(0.).y');
        }
      };
      material.customProgramCacheKey=()=>cache+'-batched-light-rows-v1';
    },
    dispose(){texture.dispose();},
  };
}

/** Balanced/Low keep source selection uniform within a draw. This avoids the
 * extra per-fragment texture fetches on bandwidth-limited integrated graphics. */
export function createMiniatureSharedLighting(source:MiniatureLightUniforms){
  const uniforms={torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},
    torchPositions:{value:source.torchPositions.value.map(v=>v.clone())},torchColors:{value:source.torchColors.value.map(v=>v.clone())},
    ...(source.torchGroundEnabled?{torchGroundEnabled:{value:source.torchGroundEnabled.value},torchGroundField:{value:source.torchGroundField!.value},torchGroundBounds:{value:source.torchGroundBounds!.value}}:{})};
  return {
    write(row:number,next:MiniatureLightUniforms){
      if(row!==0)return;
      uniforms.torchCount.value=next.torchCount.value;uniforms.darkvisionDetail.value=next.darkvisionDetail.value;
      if(uniforms.torchGroundEnabled&&next.torchGroundEnabled){uniforms.torchGroundEnabled.value=next.torchGroundEnabled.value;uniforms.torchGroundField!.value=next.torchGroundField!.value;uniforms.torchGroundBounds!.value=next.torchGroundBounds!.value;}
      for(let i=0;i<8;i++){uniforms.torchPositions.value[i].copy(next.torchPositions.value[i]);uniforms.torchColors.value[i].copy(next.torchColors.value[i]);uniforms.torchShadowSlots.value[i]=next.torchShadowSlots.value[i];}
    },flush(){},dispose(){},
    attach(material:Material){
      const hook=material.onBeforeCompile,cache=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){hook.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='attribute vec2 instanceGroundPoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('vec2 groundPoint=torchGroundPoint;','vec2 groundPoint=instanceGroundPoint;');
      };
      material.customProgramCacheKey=()=>cache+'-batched-shared-lights-v2-ground';
    },
  };
}
