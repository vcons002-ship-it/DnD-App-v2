import {describe,it,expect} from 'vitest';
import {createMistFlow} from '../../client/src/canvas/mistFlow.js';

const settings={mapWidth:1000,mapHeight:700,scenery:false,mistInteraction:true};
const token=(x:number,y=350,visible=true)=>({id:'walker',x,y,diameter:60,visible});
function field(){const flow=createMistFlow();flow.update(settings);flow.tick(1);return flow;}
function pixel(flow:ReturnType<typeof field>,x:number,y:number){
  const {data,width,height}=flow.texture.image;
  const offset=(Math.floor(y/700*height)*width+Math.floor(x/1000*width))*4;
  return Array.from((data as Uint8Array).slice(offset,offset+4));
}
function walk(flow:ReturnType<typeof field>){
  flow.setTokens([token(200)]);
  for(let i=1;i<=20;i++){flow.setTokens([token(200+i*10)]);flow.tick(1+i*.1);}
}

describe('mist movement history',()=>{
  it.each([[1,0,0],[0,1,Math.PI/2]])('starts at the measured body, leaving mist ahead untouched (%s,%s)',(dx,dy,facing)=>{
    const flow=field();
    const at=(distance:number)=>({...token(250+dx*distance,250+dy*distance),diameter:100,
      body:{x:250+dx*distance,y:250+dy*distance,radiusX:20,radiusY:8,facing}});
    flow.setTokens([at(0)]);
    for(let i=1;i<=10;i++){flow.setTokens([at(i*8)]);flow.tick(1+i*.08);}
    flow.tick(2.1);
    // Still inside the decorative base's radius, but beyond the body's front.
    expect(pixel(flow,250+dx*108,250+dy*108)).toEqual([128,128,255,0]);
    // The shallow leading cap must not open a wide bow wave beside the nose.
    expect(pixel(flow,250+dx*95-dy*25,250+dy*95+dx*25)).toEqual([128,128,255,0]);
    // Motion still displaces mist beside the travelled lower-body corridor.
    expect(flow.state.wakes).toBeGreaterThan(0);
    expect(pixel(flow,250+dx*50-dy*7,250+dy*50+dx*7)).not.toEqual([128,128,255,0]);
    flow.dispose();
  });
  it('preserves the trail when a camera redraw is followed by an older animation timestamp',()=>{
    const flow=field();walk(flow);
    const before=flow.state, pixels=(flow.texture.image.data as Uint8Array).slice();
    flow.tick(2.995);
    expect(flow.state).toEqual(before);
    expect(flow.texture.image.data).toEqual(pixels);
    flow.tick(3.1);
    expect(flow.state.wakes).toBe(before.wakes);
    expect(flow.state.oldestWakeAge).toBeGreaterThan(before.oldestWakeAge);
    flow.tick(0);expect(flow.state.wakes).toBe(0);
    flow.dispose();
  });
  it('parts mist along a narrow path without erasing it or creating a halo ahead',()=>{
    const flow=field();walk(flow);
    expect(pixel(flow,300,350)[2]).toBeLessThan(245);
    expect(pixel(flow,300,350)[2]).toBeGreaterThan(175); // preserve most density: displacement creates the gap
    expect(pixel(flow,440,350)[2]).toBe(255);
    expect(pixel(flow,300,410)[2]).toBe(255);
    // Edge roll-up behind the walker does not disturb the mist ahead of it.
    expect(pixel(flow,440,350).slice(0,2)).toEqual([128,128]);
    flow.dispose();
  });
  it('keeps the old path and its rolling edges after a turn, then fully refills it',()=>{
    const flow=field();walk(flow);
    for(let i=1;i<=8;i++){flow.setTokens([token(400,350-i*10)]);flow.tick(3+i*.1);}
    flow.tick(4.5);
    expect(pixel(flow,310,355)[2]).toBeLessThan(250);
    const {data,width,height}=flow.texture.image;
    let curls=0;
    for(let y=Math.floor(280/700*height);y<Math.ceil(420/700*height);y++)for(let x=Math.floor(240/1000*width);x<Math.ceil(365/1000*width);x++)if((data as Uint8Array)[(y*width+x)*4+3]>15)curls++;
    expect(curls).toBeGreaterThan(3); // displaced mist remains along the old leg
    expect(width*height).toBeLessThanOrEqual(320*224);
    flow.tick(11);
    expect(flow.state.wakes).toBe(0);
    expect(pixel(flow,310,355)).toEqual([128,128,255,0]);
    flow.dispose();
  });
  it('clears hidden or disabled history and does not draw a trail across a teleport',()=>{
    const flow=field();walk(flow);expect(flow.state.wakes).toBeGreaterThan(0);
    flow.setTokens([token(400,350,false)]);flow.tick(3.2);
    expect(flow.state.wakes).toBe(0);
    flow.setTokens([token(400)]);flow.setTokens([token(900)]);flow.tick(3.4);
    expect(flow.state.wakes).toBe(0);
    flow.setTokens([token(910)]);flow.tick(3.6);expect(flow.state.wakes).toBeGreaterThan(0);
    flow.update({...settings,mistInteraction:false});flow.tick(3.8);
    expect(flow.state.wakes).toBe(0);
    expect(pixel(flow,905,350)).toEqual([128,128,255,0]);
    flow.dispose();
  });
});
