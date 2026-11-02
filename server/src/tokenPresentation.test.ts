import {describe,it,expect} from 'vitest';
import {TokenPresentation} from '../../client/src/canvas/tokenPresentation.js';
import {createPlayerVision,visionContains,visionLit} from '../../shared/playerVision.js';
import type {StateSnapshot,Token} from '../../shared/types.js';
import type {ExploredTerrain} from '../../shared/exploration.js';

const oldMemory:ExploredTerrain=[[[[420,600],[650,600],[650,900],[420,900],[420,600]]]];
const newMemory:ExploredTerrain=[...oldMemory,[[[600,330],[1400,330],[1400,600],[600,600],[600,330]]]];
function snapshot(y=650,shared=false,dark=false):StateSnapshot {
  const map={id:'dungeon',gridSizePx:50,feetPerSquare:5,mapFogEnabled:false,tokenFogEnabled:false,
    environment:{enabled:dark,lighting:'dungeon',heavyDarkness:dark,lights:[]},
    walls:[{id:'wall',kind:'rectangle',ax:650,ay:600,bx:1430,by:630}]};
  const tokens=[{id:'varis',refId:'varis-sheet',kind:'pc',x:600,y,carriedLantern:true},
    {id:'druk',refId:'druk-sheet',kind:'pc',x:500,y:800},
    ...(y===650?[]:[{id:'goblin',refId:'goblin-sheet',kind:'monster',x:1050,y:550,sharedSightOnly:shared}])] as Token[];
  const result={role:'player',map,tokens,exploredTerrain:y===650?oldMemory:newMemory} as unknown as StateSnapshot;
  result.playerVision=createPlayerVision(result.map,tokens,new Set([shared?'druk-sheet':'varis-sheet']));
  return result;
}

describe('movement-aligned reveal presentation',()=>{
  it('snaps an in-progress move immediately when reduced motion is selected on the same snapshot',()=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);
    const next=snapshot(550);p.sync(next,10,1001);expect(p.moving()).toBe(true);
    p.sync(next,10,1050,true);expect(p.moving()).toBe(false);expect(p.position('varis')).toEqual({x:600,y:550});
  });
  it('reuses stationary personal and party vision instead of rebuilding them for an idle clock',()=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);
    const personal=p.personalVision(),party=p.partyVision();
    p.advance(1200);p.advance(1400);
    expect(p.personalVision()).toBe(personal);expect(p.partyVision()).toBe(party);
  });
  it.each([false,true])('waits for the displayed scout to clear the wall (darkness=%s)',dark=>{
    const p=new TokenPresentation();p.sync(snapshot(650,false,dark),10,1000);
    p.sync(snapshot(550,false,dark),10,1001);
    expect(p.position('varis')).toEqual({x:600,y:650});
    expect(visionContains(p.personalVision(),1050,550)).toBe(false);
    expect(p.explored()).toBe(oldMemory);
    p.advance(1120);expect(visionContains(p.personalVision(),1050,550)).toBe(false);
    p.advance(1180);expect(visionContains(p.personalVision(),1050,550)).toBe(true);
    if(dark)expect(visionLit(p.personalVision(),1050,550)).toBe(false);
    expect(p.explored()).toBe(oldMemory);
    p.advance(1281);expect(p.position('varis')).toEqual({x:600,y:550});
    expect(p.explored()).toBe(newMemory);
  });
  it('also delays the distant observer shared reveal, while leaving personal sight blocked',()=>{
    const p=new TokenPresentation();p.sync(snapshot(650,true),10,1000);p.sync(snapshot(550,true),10,1001);
    expect(visionContains(p.partyVision(),1050,550)).toBe(false);
    p.advance(1180);expect(visionContains(p.partyVision(),1050,550)).toBe(true);
    expect(visionContains(p.personalVision(),1050,550)).toBe(false);
  });
  it('does not restart movement on model readiness or an unrelated snapshot; redirects from the displayed pose',()=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);p.sync(snapshot(550),10,1001);p.advance(1141);
    const half=p.position('varis')!;expect(half.y).toBe(600);
    p.sync(snapshot(550),10,1141);expect(p.position('varis')).toEqual(half);
    p.sync(snapshot(800),10,1141);expect(p.position('varis')).toEqual(half);
    p.advance(1500);expect(p.position('varis')!.y).toBe(800);
  });
  it('immediately removes revoked tokens and clears memory, even during movement',()=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);p.sync(snapshot(550),10,1001);
    const next=snapshot(550);next.tokens=next.tokens.filter(t=>t.id!=='goblin');next.exploredTerrain=[];
    p.sync(next,10,1050);expect(p.position('goblin')).toBeUndefined();expect(p.explored()).toEqual([]);
  });
  it.each(['sharing','reset'])('replaces nonempty memory immediately when %s changes during movement',change=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);p.sync(snapshot(550),10,1001);
    const next=snapshot(550);next.exploredTerrain=[newMemory[1]];
    if(change==='sharing')next.map={...next.map!,sharedPartyVision:false};else next.explorationEpoch=1;
    p.sync(next,10,1050);expect(p.moving()).toBe(true);expect(p.explored()).toBe(next.exploredTerrain);
  });
  it('resets on map switches and applies reduced motion without delayed sight',()=>{
    const p=new TokenPresentation();p.sync(snapshot(),10,1000);p.sync(snapshot(550),10,1001,true);
    expect(p.moving()).toBe(false);expect(p.position('varis')!.y).toBe(550);expect(p.explored()).toBe(newMemory);
    const next=snapshot();next.map={...next.map!,id:'other'};p.sync(next,10,1002);
    expect(p.moving()).toBe(false);expect(p.position('varis')!.y).toBe(650);expect(p.explored()).toBe(oldMemory);
  });
});
