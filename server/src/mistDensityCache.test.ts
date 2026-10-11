import {describe,it,expect,vi} from 'vitest';
import {Vector2,type WebGLRenderer} from 'three';
import {createMistDensityCache,mistCacheLayout} from '../../client/src/canvas/mistDensityCache.js';

function fixture(){
  const common={mistMapSize:{value:new Vector2(1200,850)},mistOrigin:{value:new Vector2(0,0)},mistWorldScale:{value:1},mistWind:{value:new Vector2(9,3)},mistTime:{value:0}};
  const cache=createMistDensityCache('float mistAmbient(vec2 p,float y){return y;}',common);
  const oldTarget={name:'main'},frames:number[]=[];
  const renderer={capabilities:{maxTextureSize:8192},autoClear:false,shadowMap:{needsUpdate:true},getRenderTarget:()=>oldTarget,setRenderTarget:vi.fn(),
    render:vi.fn((scene:any)=>frames.push(scene.children[0].material.uniforms.mistTime.value))} as unknown as WebGLRenderer;
  return {common,cache,renderer,frames,oldTarget};
}
describe('reusable mist cloud field',()=>{
  it('keeps map-space detail at different map scales and guards atlas slice edges',()=>{
    const a=mistCacheLayout(1200,850,1)!,b=mistCacheLayout(2400,1700,2)!;
    expect(a.x).toBe(b.x);expect(a.y).toBe(b.y);expect(b.padding).toBe(a.padding*2);
    expect(a.width).toBe((a.x+2)*4);expect(a.height).toBe((a.y+2)*2);expect(a.slices).toBe(32);
  });
  it('declines huge or invalid fields instead of reducing their cloud detail',()=>{
    expect(mistCacheLayout(12800,12800,1)).toBeNull();expect(mistCacheLayout(NaN,850,1)).toBeNull();expect(mistCacheLayout(0,850,1)).toBeNull();
  });
  it('reuses two adjacent cloud times, interpolates, and refreshes only the next field',()=>{
    const {cache,renderer,common,frames,oldTarget}=fixture();
    cache.prepare(renderer,true);expect(frames).toEqual([0,1/8]);
    const previous=cache.uniforms.mistCachePrevious.value,next=cache.uniforms.mistCacheNext.value;
    common.mistTime.value=1/16;cache.prepare(renderer,true);
    expect(frames).toHaveLength(2);expect(cache.uniforms.mistCacheBlend.value).toBeCloseTo(.5);
    common.mistTime.value=.13;cache.prepare(renderer,true);
    expect(frames).toHaveLength(3);expect(cache.uniforms.mistCachePrevious.value).toBe(next);expect(cache.uniforms.mistCacheNext.value).toBe(previous);
    expect(renderer.autoClear).toBe(false);expect(renderer.shadowMap.needsUpdate).toBe(true);expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(oldTarget);
    cache.dispose();
  });
  it('refreshes both fields after a wind change or a clock reset, but not for a camera change',()=>{
    const {cache,renderer,common,frames}=fixture();cache.prepare(renderer,true);
    common.mistWind.value.x=30;cache.prepare(renderer,true);expect(frames).toHaveLength(4);
    common.mistTime.value=1;cache.prepare(renderer,true);common.mistTime.value=.02;cache.prepare(renderer,true);expect(frames).toHaveLength(8);
    cache.prepare(renderer,true);expect(frames).toHaveLength(8);cache.dispose();
  });
  it('does no field rendering while off, and falls back within device texture limits',()=>{
    const {cache,renderer,frames}=fixture();cache.prepare(renderer,false);expect(frames).toHaveLength(0);expect(cache.state.densityCache).toBe(false);
    renderer.capabilities.maxTextureSize=256;cache.prepare(renderer,true);expect(frames).toHaveLength(0);expect(cache.state.densityCache).toBe(false);cache.dispose();
  });
});
