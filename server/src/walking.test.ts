import path from 'node:path';
import sharp from 'sharp';
import {afterAll,it,expect} from 'vitest';
import {config} from './config.js';
import {renderedSnapshot} from './renderedSnapshot.js';
import {renderAssetFor} from './renderAssets.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,setActiveMap,updateMapEnvironment,moveToken,listMaps,createMonsterTemplate,instantiateMonster,setFogLayer,setFogRevealed,setTokenHidden} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {recordWalkingMove,walkingRoute} from './walking.js';
import {prepareLegacyMotion} from './legacyMotion.js';
import {resetExploration} from './exploration.js';
import {editMapWalls} from './mapWalls.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import {TokenPresentation} from '../../client/src/canvas/tokenPresentation.js';
afterAll(()=>visibilityWorkers.close());
function contains(shape:ExploredTerrain|undefined,x:number,y:number){const ring=(r:[number,number][])=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [a,b]=r[i],[c,d]=r[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;}return yes;};return shape?.some(p=>ring(p[0])&&!p.slice(1).some(ring))??false;}
function fixture(){
 const session=createSession('Walking route test'),map=createMap(session.id,{name:'Dark corridor'}),pc=createCharacter(session.id,{name:'Walker'});claimCharacter(pc.id,'walker');
 const token=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:100,y:100});setActiveMap(session.id,map.id);updateMapEnvironment(session.id,map.id,{enabled:true,heavyDarkness:true,lighting:'dungeon',lights:[]});
 const snapshot=()=>buildSnapshot(session.id,'player',null,'walker')!;
 return {session,map:listMaps(session.id).find(m=>m.id===map.id)!,token,snapshot};
}
it('remembers the middle of one long accepted walk and preserves history after returning',async()=>{
 const f=fixture();f.snapshot();const moved=moveToken(f.token.id,2100,100,true)!;await recordWalkingMove(f.token,moved,true);
 expect(contains(f.snapshot().exploredTerrain,1100,100)).toBe(true);expect(walkingRoute(moved.id)?.samples).toBe(81);
 const back=moveToken(moved.id,100,100,true)!;await recordWalkingMove(moved,back,true);expect(contains(f.snapshot().exploredTerrain,2100,100)).toBe(true);
});
it('does not explore a relocation, a DM wall crossing or a hidden token path',async()=>{
 for(const kind of ['relocate','wall','hidden']){
  const f=fixture();f.snapshot();if(kind==='wall')editMapWalls(f.session.id,f.map.id,{add:{id:'barrier',ax:1000,ay:-5000,bx:1000,by:5000}});
  const source=kind==='hidden'?{...f.token,isHidden:true}:f.token,moved=moveToken(f.token.id,2100,100)!;
  await recordWalkingMove(source,{...moved,isHidden:source.isHidden},true,kind==='relocate');
  expect(contains(f.snapshot().exploredTerrain,1100,100)).toBe(false);
 }
});
it.each([false,true])('animates doorway moves without exploring across closed walls (membershipOnly=%s)',async(membershipOnly)=>{
 // 1. DM moves a token through an open doorway where its collision radius grazes the jamb (y=106 near jamb at y=100, radius=10px).
 const openDoor=fixture();
 editMapWalls(openDoor.session.id,openDoor.map.id,{add:{id:'jamb-top',ax:200,ay:0,bx:200,by:100}});
 editMapWalls(openDoor.session.id,openDoor.map.id,{add:{id:'jamb-bot',ax:200,ay:150,bx:200,by:400}});
 const startNearJamb=moveToken(openDoor.token.id,100,106)!;
 const beforeDoor=openDoor.snapshot(),throughDoor=moveToken(openDoor.token.id,300,106)!;
 await recordWalkingMove(startNearJamb,throughDoor,true);
 const afterDoor=openDoor.snapshot();
 expect(walkingRoute(throughDoor.id)?.crossedWall).toBeUndefined();
 expect(contains(afterDoor.exploredTerrain,200,106)).toBe(true);
 const doorPlan=await prepareLegacyMotion('walker-door',beforeDoor,afterDoor,undefined,{membershipOnly});
 expect(doorPlan?.frames).toHaveLength(13);
 expect(doorPlan?.moves[throughDoor.id]).toEqual({from:{x:100,y:106},to:{x:300,y:106}});
 // 2. Subsequent move starting within 1ft (6px < 10px radius) of a wall still records a route and animates.
 editMapWalls(openDoor.session.id,openDoor.map.id,{add:{id:'hall-wall',ax:250,ay:100,bx:500,by:100}});
 const beforeParallel=openDoor.snapshot(),parallelMove=moveToken(openDoor.token.id,450,106)!;
 await recordWalkingMove(throughDoor,parallelMove,true);
 const afterParallel=openDoor.snapshot();
 const parallelPlan=await prepareLegacyMotion('walker-door',beforeParallel,afterParallel,undefined,{membershipOnly});
 expect(parallelPlan?.frames).toHaveLength(13);
 // 3. DM moves a token across a solid wall: does not explore intermediate rooms, but still produces a 13-frame motion plan.
 const walled=fixture();
 editMapWalls(walled.session.id,walled.map.id,{add:{id:'wall-a',ax:600,ay:-5000,bx:600,by:5000}});
 editMapWalls(walled.session.id,walled.map.id,{add:{id:'wall-b',ax:1600,ay:-5000,bx:1600,by:5000}});
 const beforeWall=walled.snapshot(),acrossWall=moveToken(walled.token.id,2100,100)!;
 await recordWalkingMove(walled.token,acrossWall,true);
 const afterWall=walled.snapshot();
 expect(walkingRoute(acrossWall.id)?.crossedWall).toBe(true);
 expect(contains(afterWall.exploredTerrain,1100,100)).toBe(false);
 const wallPlan=await prepareLegacyMotion('walker-wall',beforeWall,afterWall,undefined,{membershipOnly});
 expect(wallPlan?.frames).toHaveLength(13);
 expect(wallPlan?.moves[acrossWall.id]).toEqual({from:{x:100,y:100},to:{x:2100,y:100}});
});
it('a reset invalidates an in-flight worker history write',async()=>{
 const f=fixture();f.snapshot();const moved=moveToken(f.token.id,2100,100,true)!,pending=recordWalkingMove(f.token,moved,true);resetExploration(f.session.id,f.map.id);await pending;
 expect(contains(f.snapshot().exploredTerrain,1100,100)).toBe(false);
});
it('DM preview can remain read-only',async()=>{
 const f=fixture();f.snapshot();const moved=moveToken(f.token.id,2100,100,true)!;await recordWalkingMove(f.token,moved,false);
 expect(contains(f.snapshot().exploredTerrain,1100,100)).toBe(false);
});
it('manual map fog restricts the entire walking history',async()=>{
 const f=fixture();setFogLayer(f.map.id,'map',true);setFogRevealed(f.map.id,'map',['22,2']);
 const moved=moveToken(f.token.id,2100,100,true)!;await recordWalkingMove(f.token,moved,true);
 const s=f.snapshot();expect(contains(s.exploredTerrain,1110,110)).toBe(true);expect(contains(s.exploredTerrain,1050,110)).toBe(false);
});
it('motion has bounded intermediate frames and never animates a relocation or reset',async()=>{
 const f=fixture(),before=f.snapshot(),moved=moveToken(f.token.id,300,100,true)!;await recordWalkingMove(f.token,moved,true);
 const after=f.snapshot();
 // No vision case verifies route/membership without needing raster credentials.
 const a={...before,playerVision:undefined},b={...after,playerVision:undefined};
 const plan=await prepareLegacyMotion('walking-test',a,b);expect(plan?.frames).toHaveLength(13);expect(plan?.frames.map(f=>f.at)).toEqual(Array.from({length:13},(_,i)=>i/12));
 expect(plan?.moves[moved.id]).toEqual({from:{x:100,y:100},to:{x:300,y:100}});
 expect(await prepareLegacyMotion('walking-test',a,{...b,explorationEpoch:99})).toBeUndefined();
 await recordWalkingMove(f.token,moved,true,true);expect(await prepareLegacyMotion('walking-test',a,b)).toBeUndefined();
});
it('authorizes transient midpoint creatures, redacts stats and still excludes manual fog and hidden figures',async()=>{
 const f=fixture(),monster=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Passing Goblin',maxHp:7}).id)!;
 const enemy=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:1100,y:100});
 const before=f.snapshot(),moved=moveToken(f.token.id,2100,100,true)!;await recordWalkingMove(f.token,moved,true);const after=f.snapshot();
 expect(before.tokens.some(t=>t.id===enemy.id)).toBe(false);expect(after.tokens.some(t=>t.id===enemy.id)).toBe(false);
 const plan=await prepareLegacyMotion('walker',before,after),mid=plan?.frames[6];
 expect(mid?.tokens?.some(t=>t.id===enemy.id&&!t.sharedSightOnly)).toBe(true);
 expect(mid?.monsters?.find(m=>m.id===enemy.refId)).not.toHaveProperty('curHp');
 expect(plan?.frames[0].tokenIds).not.toContain(enemy.id);
 setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
 // Both snapshots use the restricted map so this exercises intermediate shaping.
 const restricted={...before,map:f.snapshot().map},restrictedAfter=f.snapshot();
 const hidden=await prepareLegacyMotion('walker',restricted,restrictedAfter);expect(hidden?.frames[6].tokenIds).not.toContain(enemy.id);
});
it('presentation shares the server motion clock, redirects smoothly mid-walk, and snaps on cancellation/reduced motion',()=>{
 const f=fixture(),a=f.snapshot(),b={...a,tokens:a.tokens.map(t=>({...t,x:t.x+200}))},p=new TokenPresentation();p.sync(a,10,0,true);
 const token=b.tokens[0],playback={id:'move',start:100,durationMs:400,moves:{[token.id]:{from:{x:100,y:100},to:{x:300,y:100}}}};
 p.sync(b,10,100,false,playback);expect(p.position(token.id)?.x).toBe(100);p.advance(300);expect(p.position(token.id)?.x).toBe(200);
 // Starting a second playback mid-walk redirects from the current position (200) instead of jumping to 300.
 const c={...b,tokens:b.tokens.map(t=>({...t,x:500}))},playback2={id:'move-2',start:300,durationMs:400,moves:{[token.id]:{from:{x:300,y:100},to:{x:500,y:100}}}};
 p.sync(c,10,300,false,playback2);expect(p.position(token.id)?.x).toBe(200);p.advance(500);expect(p.position(token.id)?.x).toBe(350);
 p.sync(c,10,510,true);expect(p.position(token.id)?.x).toBe(500);expect(p.moving()).toBe(false);
});
it('retains vector geometry across rendered snapshots and recomputes first motion frame geometry when stripped',async()=>{
 const f=fixture();
 await sharp({create:{width:500,height:500,channels:4,background:{r:80,g:90,b:100,alpha:1}}}).png().toFile(path.join(config.uploadsDir,'motion-strip-test.png'));
 const rawBefore={...f.snapshot(),map:{...f.snapshot().map!,imagePath:'/uploads/motion-strip-test.png'}};
 const beforeGeometry=await visibilityWorkers.run({mapId:f.map.id,vision:rawBefore.playerVision!,wallFog:true,explored:rawBefore.exploredTerrain,tokens:rawBefore.tokens});
 const deliveredBefore=await renderedSnapshot('walker-stripped',{...rawBefore,legacyGeometry:beforeGeometry},true);
 expect(deliveredBefore.visionRaster).toBeUndefined();
 expect(deliveredBefore.terrainRaster).toBeUndefined();
 expect(deliveredBefore.legacyGeometry?.near.length).toBeGreaterThan(0);
 const strippedBefore={...deliveredBefore,legacyGeometry:{...beforeGeometry,sight:[],near:[],lights:[],memory:[]}};
 const moved=moveToken(f.token.id,300,100,true)!;await recordWalkingMove(f.token,moved,true);
 const rawAfter={...f.snapshot(),map:{...f.snapshot().map!,imagePath:'/uploads/motion-strip-test.png'}};
 const afterGeometry=await visibilityWorkers.run({mapId:f.map.id,vision:rawAfter.playerVision!,wallFog:true,explored:rawAfter.exploredTerrain,tokens:rawAfter.tokens});
 const plan=await prepareLegacyMotion('walker-stripped',strippedBefore,{...rawAfter,legacyGeometry:afterGeometry});
 expect(plan?.atlas).toBeUndefined();
 expect(plan?.frames[0].legacyGeometry?.near).toEqual(beforeGeometry.near);
 expect(plan?.frames.at(-1)?.legacyGeometry?.near).toEqual(afterGeometry.near);
});

it('lightweight movement keeps departing creatures and authorizes midpoint-only creatures without raster work',async()=>{
 const f=fixture(),monster=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Route guard',maxHp:7}).id)!;
 const near=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:400,y:100});
 const middle=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:1100,y:100});
 const secret=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:1100,y:120});setTokenHidden(secret.id,true);
 const before=f.snapshot(),moved=moveToken(f.token.id,2100,100,true)!;await recordWalkingMove(f.token,moved,true);const after=f.snapshot();
 const jobs=visibilityWorkers.metrics.jobs;
 const plan=await prepareLegacyMotion('walker',before,after,undefined,{membershipOnly:true});
 expect(plan?.membershipOnly).toBe(true);expect(visibilityWorkers.metrics.jobs).toBe(jobs);
 expect(plan?.frames[0].tokenIds).toContain(near.id);expect(plan?.frames[6].tokenIds).toContain(middle.id);
 expect(plan?.frames.every(frame=>!frame.tokenIds.includes(secret.id))).toBe(true);
 expect(plan?.frames.at(-1)?.tokenIds).not.toContain(near.id);expect(plan?.frames.at(-1)?.tokenIds).not.toContain(middle.id);
 expect(plan?.frames.every(frame=>!frame.legacyGeometry&&!frame.tokenSprites&&!frame.visionRaster)).toBe(true);
 expect(plan?.frames[6].monsters?.find(m=>m.id===middle.refId)).not.toHaveProperty('curHp');
 setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
 const restricted=f.snapshot();const hidden=await prepareLegacyMotion('walker',{...before,map:restricted.map},restricted,undefined,{membershipOnly:true});
 expect(hidden?.frames[6].tokenIds).not.toContain(middle.id);
 expect(await prepareLegacyMotion('walker',{...before,playerVision:undefined},{...after,playerVision:undefined},undefined,{membershipOnly:true})).toBeUndefined();
});
