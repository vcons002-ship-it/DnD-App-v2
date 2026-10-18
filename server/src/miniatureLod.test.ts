import {describe,it,expect} from 'vitest';
import {miniatureLodForPixels,miniatureLodPair,type MiniatureLodBudget} from '../../shared/miniatureLod.js';
describe('two-tier miniature detail',()=>{
  it('keeps each graphics mode on its own two-model pair',()=>{
    expect([40,120,220,360].map(p=>miniatureLodForPixels(p,'high'))).toEqual(['battlefield','battlefield','battlefield','high']);
    expect([40,120,220,360].map(p=>miniatureLodForPixels(p,'balanced'))).toEqual(['battlefield','battlefield','balanced','balanced']);
    expect([40,120,220,360].map(p=>miniatureLodForPixels(p,'low'))).toEqual(['battlefield','low','low','low']);
    expect(miniatureLodForPixels(360,'balanced')).toBe('balanced');
    expect(miniatureLodForPixels(360,'low')).toBe('low');
    expect(miniatureLodForPixels(360,'off')).toBe('low');
    expect(miniatureLodForPixels(360,'auto')).toBe('high');
  });
  it('never upgrades off-screen figures even at extreme zoom',()=>{
    for(const quality of ['high','balanced','low','off','auto'] as const){
      const pair=miniatureLodPair(quality);
      expect(miniatureLodForPixels(10000,quality,pair.near,false)).toBe(pair.far);
      expect(miniatureLodForPixels(10000,quality,undefined,false)).toBe(pair.far);
      expect(miniatureLodForPixels(10000,quality,pair.far,true)).toBe(pair.near);
    }
  });
  it('avoids thrashing around boundaries while respecting a changed quality ceiling',()=>{
    for(const quality of ['high','balanced','low'] as MiniatureLodBudget[]){
      const pair=miniatureLodPair(quality);
      expect(miniatureLodForPixels(pair.pixels*1.1,quality,pair.far)).toBe(pair.far);
      expect(miniatureLodForPixels(pair.pixels*1.16,quality,pair.far)).toBe(pair.near);
      expect(miniatureLodForPixels(pair.pixels*.86,quality,pair.near)).toBe(pair.near);
      expect(miniatureLodForPixels(pair.pixels*.84,quality,pair.near)).toBe(pair.far);
    }
    expect(miniatureLodForPixels(100,'high','low')).toBe('battlefield');
    expect(miniatureLodForPixels(500,'low','high')).toBe('low');
    expect(miniatureLodForPixels(NaN,'balanced')).toBe('battlefield');
  });
});
