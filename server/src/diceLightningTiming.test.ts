import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createLightningTiming} from '../../client/src/lib/diceLightningTiming.js';
import {createDiceEscapingLightning} from '../../client/src/lib/diceEscapingLightning.js';

describe('Vanec lightning cadence',()=>{
 it('lets maximum strikes read with dark gaps and keeps the dice independently staggered',()=>{
  const timing=createLightningTiming(()=>.5),starts:number[]=[];
  let previous=0,visibleFrames=0,darkFrames=0;
  for(let tick=0;tick<300;tick++){
   const frame=timing.advance(tick/60,1,true);
   if(frame.strike!==previous){starts.push(tick/60);previous=frame.strike;}
   if(frame.phase>=.16&&frame.phase<=.9)visibleFrames++;
   if(frame.phase>.9)darkFrames++;
  }
  expect(starts.length).toBeGreaterThanOrEqual(9);
  expect(starts.length).toBeLessThanOrEqual(12);
  expect(visibleFrames).toBeGreaterThan(70);
  expect(darkFrames).toBeGreaterThan(150);
  for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(.36);
  const early=createLightningTiming(()=>0),late=createLightningTiming(()=>1);
  expect(early.advance(0,1,true).strike).toBe(1);
  expect(late.advance(0,1,true).strike).toBe(0);
 });
 it('only lets occasional escaping bolts start during an internal strike',()=>{
  const root=new THREE.Group(),effect=createDiceEscapingLightning(root,[],1);
  const timing=createLightningTiming(()=>.5);
  let previous=0;
  for(let tick=0;tick<600;tick++){
   const now=tick/60,frame=timing.advance(now,1,true);
   effect.update(now*1000,true,now,false,frame);
   const state=effect.state();
   if(state.lightningBursts>previous){
    expect(frame.phase).toBeGreaterThanOrEqual(.18);
    expect(frame.phase).toBeLessThanOrEqual(.6);
    expect(state.escapingBolts).toBeGreaterThan(0);
    previous=state.lightningBursts;
   }
  }
  expect(previous).toBeGreaterThanOrEqual(4);
  effect.update(10000,true,10,true,timing.advance(10,1,true));
  expect(effect.state().escapingBolts).toBe(0);
  effect.reset();expect(effect.state().lightningBursts).toBe(0);
  effect.dispose();expect(root.children).toHaveLength(0);
 });
});
