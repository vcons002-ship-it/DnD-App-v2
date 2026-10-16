import {describe,it,expect} from 'vitest';
import {lightSourceDistance,nearestLightPoint,lightBeamExtent,lightBeamOutline,spellEmissionIrradiance} from '../../shared/lightFalloff.js';
describe('beam-shaped spell light',()=>{
 const light={x:50,y:0,height:2.5,beam:{ax:0,ay:0,bx:100,by:0}};
 it('illuminates a continuous narrow strip, with no gaps between emitter centers',()=>{
  const brightness=(x:number,y:number)=>spellEmissionIrradiance(lightSourceDistance(light,x,y),7,2);
  for(let x=0;x<=100;x+=2)expect(brightness(x,0)).toBeCloseTo(brightness(50,0),10);
  expect(brightness(50,5)).toBeLessThan(brightness(50,0)*.03);
  expect(brightness(110,0)).toBeLessThan(brightness(100,0)*.001);
  expect(lightBeamExtent(light)).toBe(50);
 });
 it('rotates in map space and keeps point sources and zero-length beams unchanged',()=>{
  const diagonal={x:30,y:40,height:2.5,beam:{ax:0,ay:0,bx:60,by:80}};
  expect(lightSourceDistance(diagonal,30,40)).toBe(2.5);
  expect(nearestLightPoint(diagonal,34,37)).toEqual({x:30,y:40});
  const point={x:30,y:40,height:2.5};
  expect(lightSourceDistance(point,33,44)).toBe(Math.hypot(3,4,2.5));
  expect(lightSourceDistance({...point,beam:{ax:30,ay:40,bx:30,by:40}},33,44)).toBe(lightSourceDistance(point,33,44));
  const outline=lightBeamOutline(light.beam,7);
  expect(Math.min(...outline.map(p=>p.x))).toBe(-7);expect(Math.max(...outline.map(p=>p.x))).toBe(107);
 });
});
