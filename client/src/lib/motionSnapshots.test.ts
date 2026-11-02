import {expect,it} from 'vitest';
import type {StateSnapshot} from '../../../shared/types';
import {compactMotionEntities,type LegacyMotion,motionFrameTokens,motionFrameMonsters} from '../../../shared/legacyMotion';
import {createMotionSnapshots} from './motionSnapshots';

const pc={id:'pc',kind:'pc',refId:'hero',x:300,y:100};
const guard={id:'guard',kind:'monster',refId:'goblin',x:200,y:100};
const monster={id:'goblin',name:'Guard',conditions:[]};
const source=()=>({role:'player',tokens:[pc],monsters:[],characters:[]} as unknown as StateSnapshot);
const plan=()=>({membershipOnly:true,id:'walk',durationMs:400,moves:{pc:{from:{x:100,y:100},to:{x:300,y:100}}},frames:[
 {at:0,tokenIds:['pc','guard'],tokens:[guard],monsters:[monster]},
 {at:.25,tokenIds:['pc','guard'],tokens:[{...guard}],monsters:[{...monster}]},
 {at:.5,tokenIds:['pc','guard'],tokens:[{...guard,sharedSightOnly:true}],monsters:[{...monster}]},
 {at:1,tokenIds:['pc']},
]} as LegacyMotion);

it('round-trips authorization, appearance changes, timing and images without mutating older-client plans',()=>{
 const original=plan(),before=JSON.stringify(original),packed=compactMotionEntities(original);
 expect(JSON.stringify(original)).toBe(before);expect(packed.entities?.tokens).toHaveLength(2);expect(packed.entities?.monsters).toHaveLength(1);
 expect(compactMotionEntities(original)).toBe(packed);
 const wire=JSON.parse(JSON.stringify(packed)) as LegacyMotion;
 for(const [i,frame] of wire.frames.entries()){
  expect(frame.at).toBe(original.frames[i].at);expect(frame.tokenIds).toEqual(original.frames[i].tokenIds);
  expect(motionFrameTokens(wire,frame)).toEqual(original.frames[i].tokens??[]);
  expect(motionFrameMonsters(wire,frame)).toEqual(original.frames[i].monsters??[]);
 }
 expect(motionFrameTokens(wire,wire.frames[0])[0]).toBe(motionFrameTokens(wire,wire.frames[1])[0]);
 expect(motionFrameTokens(wire,wire.frames[2])[0].sharedSightOnly).toBe(true);
});

it.each([false,true])('shares unchanged frame records and arrays, without leaking departed creatures (packed=%s)',packed=>{
 const input=source(),motion=packed?compactMotionEntities(plan()):plan();
 const wire=JSON.parse(JSON.stringify(motion)),frames=createMotionSnapshots(input,wire);
 expect(frames[0].tokens[0]).toBe(input.tokens[0]);
 if(packed)expect(frames[1]).toBe(frames[0]);
 expect(frames[1].tokens).toBe(frames[0].tokens);expect(frames[1].monsters).toBe(frames[0].monsters);
 expect(frames[2].tokens[1]).not.toBe(frames[1].tokens[1]);expect(frames[2].tokens[1].sharedSightOnly).toBe(true);
 expect(frames.at(-1)?.tokens.map(t=>t.id)).toEqual(['pc']);expect(frames.at(-1)?.monsters).toEqual([]);
 // A fresh accepted plan that never authorizes this guard must not inherit it.
 const revoked={...plan(),frames:[{at:0,tokenIds:['pc']},{at:1,tokenIds:['pc']}]};
 expect(createMotionSnapshots(input,revoked).every(f=>f.tokens.every(t=>t.id!=='guard'))).toBe(true);
});

it('retains raster geometry and sprite appearance while normalizing moving records to the destination',()=>{
 const input=source(),motion=plan();motion.membershipOnly=false;
 const geometry={sight:['path'],near:[],lights:[],memory:[],affinity:['pc']};
 motion.frames[0]={...motion.frames[0],tokens:[{...pc,x:100} as StateSnapshot['tokens'][number]],legacyGeometry:geometry};
 const frames=createMotionSnapshots(input,compactMotionEntities(motion));
 expect(frames[0].tokens[0]).toBe(input.tokens[0]);expect(frames[0].legacyGeometry).toBe(geometry);
 expect(motion.frames[0].tokens?.[0].x).toBe(100);
});
