import {it,expect} from 'vitest';
import {diceFlightPoint,diceFlightKeyframes,DIE_FLASH_MS,DIE_REVEAL_MS} from '../../client/src/lib/diceFlightPosition.js';
it('maps face and result-box points correctly at player UI scales',()=>{
 for(const scale of [.6,.85,1,1.25,1.5])for(const point of [{x:25,y:45},{x:680,y:380},{x:360,y:550}]){
  const root={left:350,top:120,width:720*scale};
  const p=diceFlightPoint(root,720,root.left+point.x*scale,root.top+point.y*scale);
  expect(p.x).toBeCloseTo(point.x,8);expect(p.y).toBeCloseTo(point.y,8);
 }
});

it('holds the flash on left/right faces and lands exactly at the box center',()=>{
 for(const sx of [15,700]){
  const frames=diceFlightKeyframes(sx,75,360,550,1);
  const location=(frame:{transform:string})=>frame.transform.match(/^translate3d\(([-\d.]+)px,([-\d.]+)px,0\)/)!.slice(1).map(Number);
  for(const f of frames.filter(f=>f.offset<=DIE_FLASH_MS/DIE_REVEAL_MS))expect(location(f)).toEqual([sx,75]);
  expect(location(frames.at(-1)!)).toEqual([360,550]);
  expect(frames.at(-1)!.offset).toBe(1);
 }
});
