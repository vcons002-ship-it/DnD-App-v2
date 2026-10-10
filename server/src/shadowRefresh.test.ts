import {describe,it,expect} from 'vitest';
import {shadowRefreshDue,projectFloorShadow} from '../../shared/shadowRefresh.js';
import {simplifyShadowIndices} from '../../client/src/canvas/shadowMeshSimplifier.js';
import {SphereGeometry} from 'three';

describe('shadow refresh budget',()=>{
 it('caches stationary shadows, throttles movement and renders the final position',()=>{
  expect(shadowRefreshDue(0,-Infinity,'first','',false)).toBe(true);
  expect(shadowRefreshDue(500,0,'stationary','stationary',false)).toBe(false);
  expect(shadowRefreshDue(16,0,'moving','old',false)).toBe(false);
  expect(shadowRefreshDue(34,0,'moving','old',false)).toBe(true);
  expect(shadowRefreshDue(40,34,'final','moving',false)).toBe(false);
  expect(shadowRefreshDue(68,34,'final','moving',false)).toBe(true);
 });
 it('immediately refreshes after a door or caster visibility change',()=>{
  expect(shadowRefreshDue(1,0,'door opened','door closed',true)).toBe(true);
  expect(shadowRefreshDue(1,0,'hidden','visible',true)).toBe(true);
 });
 it('projects the full silhouette away from each light while keeping floor contact fixed',()=>{
  const ground={x:100,y:0,z:100},top={...ground,y:50};
  expect(projectFloorShadow(ground,{x:0,y:100,z:100})).toEqual(ground);
  expect(projectFloorShadow(top,{x:0,y:100,z:100})).toEqual({x:200,y:0,z:100});
  expect(projectFloorShadow(top,{x:200,y:100,z:100})).toEqual({x:0,y:0,z:100});
  expect(projectFloorShadow(top,{x:0,y:150,z:100}).x).toBe(150);
 });
 it('reduces only shadow topology and leaves original index and position data intact',async()=>{
  const geometry=new SphereGeometry(10,64,32),indices=new Uint32Array(geometry.index!.array),positions=new Float32Array(geometry.attributes.position.array);
  const oldIndices=indices.slice(),oldPositions=positions.slice();
  const reduced=await simplifyShadowIndices(indices,positions);
  expect(reduced.length).toBeLessThan(indices.length*.35);
  expect(reduced.length%3).toBe(0);
  expect([...reduced].every(i=>i>=0&&i<positions.length/3)).toBe(true);
  expect(indices).toEqual(oldIndices);expect(positions).toEqual(oldPositions);
  // Keep the sphere silhouette within the configured 0.75% extent error.
  for(const axis of [0,1,2]){
   const coordinates=[...reduced].map(i=>positions[i*3+axis]);
   expect(Math.max(...coordinates)).toBeGreaterThan(9.8);
   expect(Math.min(...coordinates)).toBeLessThan(-9.8);
  }
  geometry.dispose();
 });
 it('keeps small detailed parts intact',async()=>{
  const indices=new Uint32Array([0,1,2]),positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
  expect(await simplifyShadowIndices(indices,positions)).toBe(indices);
 });
});
