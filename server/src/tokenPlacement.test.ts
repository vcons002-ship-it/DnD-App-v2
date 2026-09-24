import { describe, it, expect } from 'vitest';
import { baseOverlap, baseSeparation, placeBase } from '../../shared/tokenPlacement.js';
import { createSession, createMap, createCharacter, createToken, moveToken, getToken, resizeMiniature, updateMapGrid } from './sessions.js';

describe('40 percent base overlap placement', () => {
  it('preserves legal positions and pushes exact overlap toward the approach', () => {
    const other={x:0,y:0,radius:20};
    expect(placeBase({x:50,y:0,radius:20},[other])).toEqual({x:50,y:0});
    const p=placeBase({...other},[other],{x:-100,y:0,radius:20});
    expect(p.x).toBeLessThan(0);
    expect(baseOverlap(20,20,Math.hypot(p.x,p.y))).toBeCloseTo(.4,5);
  });
  it('uses the smaller area for unequal bases and containment', () => {
    expect(baseOverlap(10,50,0)).toBe(1);
    const d=baseSeparation(10,50);
    expect(baseOverlap(10,50,d)).toBeCloseTo(.4,8);
    expect(baseOverlap(50,10,d)).toBeCloseTo(.4,8);
  });
  it('resolves crowded clusters without push-out oscillation', () => {
    const others=Array.from({length:12},(_,i)=>({x:35*Math.cos(i*Math.PI/6),y:35*Math.sin(i*Math.PI/6),radius:25}));
    others.push({x:0,y:0,radius:40});
    const p=placeBase({x:0,y:0,radius:20},others);
    for(const o of others) expect(baseOverlap(20,o.radius,Math.hypot(p.x-o.x,p.y-o.y))).toBeLessThanOrEqual(.400001);
    expect(Math.hypot(p.x,p.y)).toBeLessThan(100);
  });
  it('enforces spawn and move using custom bases and map scale without moving bystanders', () => {
    const session=createSession('base placement');
    const map=createMap(session.id,{name:'board'});
    updateMapGrid(map.id,100,5,60);
    const pc=createCharacter(session.id,{name:'Druk'});
    const a=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:300,y:300});
    resizeMiniature(a.id,10);
    const b=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:300,y:300});
    expect(baseOverlap(100,45,Math.hypot(b.x-a.x,b.y-a.y))).toBeLessThanOrEqual(.400001);
    const moved=moveToken(b.id,300,300)!;
    expect(baseOverlap(100,45,Math.hypot(moved.x-a.x,moved.y-a.y))).toBeLessThanOrEqual(.400001);
    expect(getToken(a.id)).toMatchObject({x:300,y:300});
    expect(moveToken(b.id,800,600)).toMatchObject({x:800,y:600});
  });
});
