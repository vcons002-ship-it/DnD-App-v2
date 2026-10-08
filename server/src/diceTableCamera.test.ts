import {describe,it,expect} from 'vitest';
import {diceTableSeats,diceTableCameraPose} from '../../client/src/lib/diceTableCamera.js';

const party=[{id:'d',name:'Druk',className:'Fighter'},{id:'v',name:'Varis',className:'Ranger'},{id:'n',name:'Vanec',className:'Sorcerer'}];
describe('shared dice table camera',()=>{
 it('seats the viewer near, other players at distinct side trays and every DM roll across the table',()=>{
  const seats=diceTableSeats(party,'v',c=>c);
  expect(seats.find(s=>s.id==='v')).toMatchObject({x:0,y:-18,side:'bottom'});
  expect(seats.find(s=>s.id==='dm')).toMatchObject({x:0,y:18,side:'top'});
  expect(new Set(seats.filter(s=>!['v','dm'].includes(s.id)).map(s=>s.side))).toEqual(new Set(['left','right']));
  expect(diceTableSeats([...party].reverse(),'v',c=>c)).toEqual(seats);
 });
 it('uses separate trays for a larger party without overlapping or giving a player the DM seat',()=>{
  const seats=diceTableSeats(Array.from({length:8},(_,i)=>({id:String(i),name:`Player ${i}`,className:'Fighter'})),'3',c=>c);
  expect(new Set(seats.map(s=>`${s.x},${s.y}`)).size).toBe(9);
  expect(seats.filter(s=>s.side==='top').map(s=>s.id)).toEqual(['dm']);
 });
 it('starts at the previous tray, rises during travel and finishes exactly at the live tray',()=>{
  const from={x:-24,y:0},to={x:0,y:18};
  expect(diceTableCameraPose(from,to,0)).toEqual({x:-24,y:-18,lift:0});
  expect(diceTableCameraPose(from,to,.5)).toMatchObject({x:-12,y:-9,lift:35});
  const last=diceTableCameraPose(from,to,1);expect(last.x).toBeCloseTo(0);expect(last.y).toBeCloseTo(0);expect(last.lift).toBeCloseTo(0);
  expect(diceTableCameraPose(undefined,to,0)).toEqual({x:-0,y:-18,lift:110});
 });
});
