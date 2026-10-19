import {it,expect,vi} from 'vitest';
import {MINIATURES,miniatureForLod,miniatureForPreload,refreshMiniatureCatalog,resolveMiniature} from './miniatures';
import {miniatureLodPair,miniatureLodForPixels} from '../../../shared/miniatureLod';

it('only prepares the coarse character model of the selected graphics pair',()=>{
  for(const id of ['druk','varis','vanec'])for(const quality of ['high','balanced','low'] as const){
    const pair=miniatureLodPair(quality),model=MINIATURES[id];
    const preload=miniatureForPreload(model,quality);
    expect(preload.url).toBe(miniatureForLod(model,pair.far).url);
    if(quality!=='low')expect(preload.url).not.toContain('-battlefield-');
    expect(preload.fallbackUrl).toBeUndefined();
    const near=miniatureForLod(model,pair.near,quality);
    expect(near.url).not.toBe(preload.url);
    expect(near.fallbackUrl).toBe(preload.url);
  }
});
it('keeps custom uploads and existing creature sculpts unchanged',()=>{
  const custom={id:'custom-hero',url:'/uploads/miniatures/custom.glb',baseDiameter:1,baseCenter:[0,0,0] as [number,number,number]};
  expect(miniatureForPreload(custom,'high')).toBe(custom);
  expect(miniatureForPreload(MINIATURES.goblin,'low')).toBe(MINIATURES.goblin);
});
it('reserves denser creature geometry for on-screen High close-ups',()=>{
  for(const id of ['goblin','human-bandit']){
    const model=MINIATURES[id];expect(model.highDetail).toBeDefined();
    expect(model.balancedDetail).toBeUndefined();
    for(const quality of ['low','balanced','high'] as const){
      expect(miniatureForPreload(model,quality)).toBe(model);
      const level=miniatureLodForPixels(1000,quality,undefined,false);
      expect(miniatureForLod(model,level,quality)).toBe(model);
      const near=miniatureForLod(model,miniatureLodPair(quality).near,quality);
      expect(near.url).toBe(quality==='high'?model.highDetail!.url:model.url);
      expect(near.baseCenter).toBe(model.baseCenter);
      expect(near.id).toBe(model.id);
    }
    expect(miniatureForLod(model,'high','balanced')).toBe(model);
    expect(miniatureForLod(model,'high','low')).toBe(model);
  }
});
it('routes generated characters to 120k High, 60k Balanced and the standard Low model',async()=>{
  const detail=(tier:string,triangles:number)=>({url:`/uploads/miniatures/hero-${tier}.glb`,bytes:5000000,triangles,sha256:'a'.repeat(64)});
  const model={id:'hero-quality-test',url:'/uploads/miniatures/hero-standard.glb',baseCenter:[0,0,0],baseDiameter:1,bytes:4000000,triangles:20256,sha256:'b'.repeat(64),highDetail:detail('high',120256),balancedDetail:detail('balanced',60256)};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({models:[model]})}));
  try{
    await refreshMiniatureCatalog();
    const hero=resolveMiniature('Test','pc',{modelType:model.id})!;
    for(const quality of ['high','balanced','low'] as const){
      expect(miniatureForPreload(hero,quality).url).toBe(model.url);
      const near=miniatureForLod(hero,miniatureLodPair(quality).near,quality);
      expect(near.url).toBe(quality==='high'?model.highDetail.url:quality==='balanced'?model.balancedDetail.url:model.url);
      if(quality!=='low')expect(near.fallbackUrl).toBe(model.url);
    }
    expect(miniatureForLod(hero,'high','low').url).toBe(model.url);
    expect(miniatureForLod(hero,'balanced','high').url).toBe(model.url);
    model.highDetail.url='https://untrusted.example/high.glb';
    await refreshMiniatureCatalog();
    expect(resolveMiniature('Test','pc',{modelType:model.id})!.highDetail).toBeUndefined();
  }finally{vi.unstubAllGlobals();}
});
