import path from 'node:path';
import sharp from 'sharp';
import {afterAll,it,expect} from 'vitest';
import {config} from './config.js';
import {renderedSnapshot} from './renderedSnapshot.js';
import {renderAssetFor} from './renderAssets.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,setActiveMap,updateMapEnvironment,moveToken,listMaps,createMonsterTemplate,instantiateMonster,setFogLayer,setFogRevealed} from './sessions.js';
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
it('presentation shares the server motion clock and snaps on cancellation/reduced motion',()=>{
 const f=fixture(),a=f.snapshot(),b={...a,tokens:a.tokens.map(t=>({...t,x:t.x+200}))},p=new TokenPresentation();p.sync(a,10,0,true);
 const token=b.tokens[0],playback={id:'move',start:100,durationMs:400,moves:{[token.id]:{from:{x:100,y:100},to:{x:300,y:100}}}};
 p.sync(b,10,100,false,playback);expect(p.position(token.id)?.x).toBe(100);p.advance(300);expect(p.position(token.id)?.x).toBe(200);
 p.sync(b,10,310,true);expect(p.position(token.id)?.x).toBe(300);expect(p.moving()).toBe(false);
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
