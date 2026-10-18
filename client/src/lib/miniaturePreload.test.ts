import {it,expect} from 'vitest';
import {MINIATURES,miniatureForLod,miniatureForPreload} from './miniatures';
import {miniatureLodPair} from '../../../shared/miniatureLod';

it('only prepares the coarse character model of the selected graphics pair',()=>{
  for(const id of ['druk','varis','vanec'])for(const quality of ['high','balanced','low'] as const){
    const pair=miniatureLodPair(quality),model=MINIATURES[id];
    const preload=miniatureForPreload(model,quality);
    expect(preload.url).toBe(miniatureForLod(model,pair.far).url);
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
