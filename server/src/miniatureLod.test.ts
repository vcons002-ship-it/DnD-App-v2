import {describe,it,expect} from 'vitest';
import {miniatureLodForPixels} from '../../shared/miniatureLod.js';
describe('projected miniature detail',()=>{
  it('uses small silhouettes at battle distance and restores detail for inspection',()=>{
    expect([40,120,220,360].map(p=>miniatureLodForPixels(p,'high'))).toEqual(['battlefield','low','balanced','high']);
    expect(miniatureLodForPixels(360,'balanced')).toBe('balanced');
    expect(miniatureLodForPixels(360,'low')).toBe('low');
    expect(miniatureLodForPixels(360,'off')).toBe('low');
  });
  it('avoids thrashing around boundaries while respecting a changed quality ceiling',()=>{
    expect(miniatureLodForPixels(110,'high','battlefield')).toBe('battlefield');
    expect(miniatureLodForPixels(116,'high','battlefield')).toBe('low');
    expect(miniatureLodForPixels(86,'high','low')).toBe('low');
    expect(miniatureLodForPixels(84,'high','low')).toBe('battlefield');
    expect(miniatureLodForPixels(500,'low','high')).toBe('low');
    expect(miniatureLodForPixels(NaN,'balanced')).toBe('battlefield');
  });
});
