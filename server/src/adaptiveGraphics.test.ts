import {describe,it,expect} from 'vitest';
import {createAdaptiveGraphics} from '../../shared/adaptiveGraphics.js';
import {graphicsBudget} from '../../shared/graphicsQuality.js';
import {createLightSightCache} from '../../shared/lightSightCache.js';
import {visionLit,visionContains,type PlayerVision} from '../../shared/playerVision.js';
import type {MapWall} from '../../shared/mapWalls.js';

describe('sustained automatic rendering budgets',()=>{
  it('ignores idle/loading gaps and lowers one tier only after sustained slow rendering',()=>{
    const auto=createAdaptiveGraphics('high');
    for(let t=100;t<10000;t+=50)auto.sample(t,false);
    expect(auto.tier).toBe('high');
    for(let t=10000;t<14000;t+=33)auto.sample(t,true);
    expect(auto.tier).toBe('high');
    for(let t=14000;t<18000;t+=33)auto.sample(t,true);
    expect(auto.tier).toBe('balanced');
    for(let t=18000;t<32000;t+=33)auto.sample(t,true);
    expect(auto.tier).toBe('balanced');
    for(let t=32000;t<52000;t+=33)auto.sample(t,true);
    expect(auto.tier).toBe('low');
  });
  it('recovers gradually after a stable minute and never overrides explicit presets',()=>{
    const auto=createAdaptiveGraphics('low');
    for(let t=100;t<70000;t+=16.67)auto.sample(t,true);
    expect(auto.tier).toBe('balanced');
    expect(graphicsBudget('high',390,auto.tier).resolved).toBe('high');
    expect(graphicsBudget('off',1440,auto.tier).resolved).toBe('off');
    expect(graphicsBudget('auto',1440,auto.tier).resolved).toBe('balanced');
  });
  it('does not count background-tab time as a minute of fast rendering',()=>{
    const auto=createAdaptiveGraphics('low');
    for(let t=100;t<30000;t+=16.67)auto.sample(t,true);
    auto.sample(150000,true);
    for(let t=150017;t<180000;t+=16.67)auto.sample(t,true);
    expect(auto.tier).toBe('low');
  });
});

describe('cached light visibility and doors',()=>{
  const door:MapWall={id:'door',kind:'rectangle',door:true,open:false,ax:95,ay:-25,bx:105,by:25};
  it('reuses sight tests through flicker, and invalidates for movement and door edits',()=>{
    const cache=createLightSightCache(),walls=[door],lamp={x:0,y:0},figure={x:150,y:0};
    expect(cache.visible('lamp:figure',lamp,figure,walls)).toBe(false);
    for(let i=0;i<60;i++)expect(cache.visible('lamp:figure',lamp,figure,walls)).toBe(false);
    expect(cache.state).toEqual({hits:60,misses:1});
    expect(cache.visible('lamp:figure',lamp,{x:50,y:0},walls)).toBe(true);
    expect(cache.visible('lamp:figure',lamp,figure,[{...door,open:true}])).toBe(true);
    expect(cache.visible('lamp:figure',lamp,figure,[door])).toBe(false);
  });
  it('a blocked exterior lamp never cancels the independent lamp inside the next room',()=>{
    const vision:PlayerVision={rangeFt:60,radius:40,heavy:true,origins:[{id:'pc',x:50,y:0}],walls:[{...door,open:true}],lights:[
      {id:'outside',x:0,y:0,radius:40,height:5,strength:1},
      {id:'inside',x:180,y:0,radius:120,height:5,strength:1},
    ]};
    expect(visionLit(vision,180,0)).toBe(true);
    expect(visionContains(vision,180,0)).toBe(true);
    vision.walls=[door];
    expect(visionLit(vision,180,0)).toBe(true);
    expect(visionContains(vision,180,0)).toBe(false);
  });
});
