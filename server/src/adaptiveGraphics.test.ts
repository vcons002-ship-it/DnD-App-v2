import {describe,it,expect} from 'vitest';
import {createAdaptiveGraphics} from '../../shared/adaptiveGraphics.js';
import {graphicsBudget} from '../../shared/graphicsQuality.js';
import {createLightSightCache} from '../../shared/lightSightCache.js';
import {visionLit,visionContains,type PlayerVision} from '../../shared/playerVision.js';
import type {MapWall} from '../../shared/mapWalls.js';

describe('sustained automatic rendering budgets',()=>{
  /** Feed frames whose interval depends on the current tier, from t0 to t1. */
  const run=(auto:ReturnType<typeof createAdaptiveGraphics>,t0:number,t1:number,frame:(tier:string)=>number)=>{
    for(let t=t0;t<t1;t+=frame(auto.tier))auto.sample(t,true);
  };
  it('ignores idle/loading gaps and lowers one tier only after sustained slow rendering that the drop fixes',()=>{
    const auto=createAdaptiveGraphics('high');
    for(let t=100;t<10000;t+=50)auto.sample(t,false);
    expect(auto.tier).toBe('high');
    const cost=(tier:string)=>tier==='high'?33:20; // high is too heavy for this machine
    run(auto,10000,14000,cost);
    expect(auto.tier).toBe('high');
    run(auto,14000,18000,cost);
    expect(auto.tier).toBe('balanced');
    run(auto,18000,60000,cost);
    expect(auto.tier).toBe('balanced'); // the drop helped, so it sticks
  });
  it('restores quality when the display, not the renderer, caps frames at 30 Hz',()=>{
    const auto=createAdaptiveGraphics('high');
    run(auto,100,10000,()=>33.4);
    expect(auto.tier).toBe('balanced');
    run(auto,10000,20000,()=>33.4);
    expect(auto.tier).toBe('high'); // balanced was no faster: put high back
    run(auto,20000,200000,()=>33.4);
    expect(auto.tier).toBe('high'); // and steady 30 Hz is no longer "slow"
  });
  it('recovers gradually after a stable minute and never overrides explicit presets',()=>{
    const auto=createAdaptiveGraphics('low');
    for(let t=100;t<70000;t+=16.67)auto.sample(t,true);
    expect(auto.tier).toBe('balanced');
    expect(graphicsBudget('high',390,auto.tier).resolved).toBe('high');
    expect(graphicsBudget('off',1440,auto.tier).resolved).toBe('off');
    expect(graphicsBudget('auto',1440,auto.tier).resolved).toBe('balanced');
  });
  it('recovers on a 50 Hz display too',()=>{
    const auto=createAdaptiveGraphics('low');
    run(auto,100,70000,()=>20);
    expect(auto.tier).toBe('balanced');
  });
  it('counts only time actually spent rendering toward recovery, without resetting on pauses',()=>{
    const auto=createAdaptiveGraphics('low');
    for(let t=100;t<30000;t+=16.67)auto.sample(t,true);
    auto.sample(150000,true); // a long background-tab gap counts for nothing
    for(let t=150017;t<170000;t+=16.67)auto.sample(t,true);
    expect(auto.tier).toBe('low'); // ~50 s of real fast rendering so far
    for(let t=170000;t<185000;t+=16.67)auto.sample(t,true);
    expect(auto.tier).toBe('balanced');
  });
  it('does not bounce back into a tier that just failed',()=>{
    const auto=createAdaptiveGraphics('balanced');
    // Fast enough at balanced to climb, but high itself is too heavy.
    const cost=(tier:string)=>tier==='high'?33:16.67;
    run(auto,100,70000,cost);
    expect(auto.tier).toBe('high');
    run(auto,70000,110000,cost);
    expect(auto.tier).toBe('balanced');
    const climbs:number[]=[];
    for(let t=110000;t<110000+40*60000;t+=cost(auto.tier))if(auto.sample(t,true)==='high')climbs.push(t);
    // One retry after the 10-minute back-off; it fails again, so the next wait
    // doubles to 20 minutes instead of bouncing every 2.5 minutes.
    expect(climbs).toHaveLength(2);
    expect(climbs[0]).toBeGreaterThan(90000+10*60000-1000);
    expect(climbs[1]-climbs[0]).toBeGreaterThan(20*60000);
  });
  it('downgrades severely struggling low-end hardware below 13 FPS and through >250ms frame hitches',()=>{
    const auto=createAdaptiveGraphics('high');
    const cost=(tier:string)=>tier==='high'?320:tier==='balanced'?110:22;
    run(auto,100,8000,cost);
    expect(auto.tier).toBe('balanced');
    run(auto,8000,46000,cost);
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
    expect(cache.visible('lamp:figure',lamp,figure,[{...door}])).toBe(false);
    expect(cache.state).toEqual({hits:61,misses:1});
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
