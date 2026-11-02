import {afterAll,expect,it} from 'vitest';
import clipping from 'polygon-clipping';
import {createSession,createMap,createCharacter,claimCharacter,createToken,setActiveMap,updateMapEnvironment,moveToken,setCondition,clearCondition,setSharedPartyVision,setVisionFog,getToken,setTokenLantern,createMonsterTemplate,instantiateMonster} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {recordWalkingMove,walkingRoute} from './walking.js';
import {prepareLegacyMotion} from './legacyMotion.js';
import {clearExplorationCache} from './exploration.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {needsVisibilityLayer,usesMapVision,visionContains} from '../../shared/playerVision.js';
import {TokenPresentation} from '../../client/src/canvas/tokenPresentation.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
afterAll(()=>visibilityWorkers.close());
const contains=(shape:ExploredTerrain|undefined,x:number)=>clipping.intersection(shape??[],[[[[x-1,99],[x+1,99],[x+1,101],[x-1,101],[x-1,99]]]]).length>0;
function fixture(shared=true,dark=true){
 const session=createSession('Blind and teleport'),map=createMap(session.id,{name:'Corridor'}),pc=createCharacter(session.id,{name:'Walker'});
 setActiveMap(session.id,map.id);claimCharacter(pc.id,'walker');setSharedPartyVision(session.id,map.id,shared);
 if(dark)updateMapEnvironment(session.id,map.id,{enabled:true,heavyDarkness:true,lighting:'dungeon',lights:[]});
 const token=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:100,y:100});
 const snapshot=()=>buildSnapshot(session.id,'player',null,'walker')!;
 const blind=()=>setCondition('pc',pc.id,{id:'blind',label:' Blinded ',aura:'red',isConcentration:false});
 return {session,map,pc,token,snapshot,blind};
}
it.each([true,false])('blind walkers do not reveal or remember the path or destination (shared=%s)',async shared=>{
 const f=fixture(shared);f.snapshot();f.blind();
 const before=f.snapshot();expect(before.playerVision?.origins).toEqual([]);
 const start=getToken(f.token.id)!,moved=moveToken(f.token.id,2100,100)!;await recordWalkingMove(start,moved,true);
 clearExplorationCache();const after=f.snapshot();
 expect(after.playerVision?.blind).toBe(true);expect(contains(after.exploredTerrain,100)).toBe(true);
 expect(contains(after.exploredTerrain,1100)).toBe(false);expect(contains(after.exploredTerrain,2100)).toBe(false);
 expect(visionContains(after.playerVision,2100,100)).toBe(false);
 const motion=await prepareLegacyMotion('blind-walker',before,after,undefined,{membershipOnly:true});
 expect(motion?.frames.length).toBe(13);
 clearCondition('pc',f.pc.id,'blind');expect(f.snapshot().playerVision?.origins).toHaveLength(1);
 expect(contains(f.snapshot().exploredTerrain,2100)).toBe(true);expect(contains(f.snapshot().exploredTerrain,1100)).toBe(false);
});
it('blindness conceals daylight terrain and intermediate creatures with automatic fog off',async()=>{
 const f=fixture(false,false);setVisionFog(f.session.id,f.map.id,'map',false);setVisionFog(f.session.id,f.map.id,'tokens',false);f.blind();
 const enemy=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Unseen',maxHp:10}).id)!;
 const target=createToken({mapId:f.map.id,kind:'monster',refId:enemy.id,x:300,y:100});
 const s=f.snapshot();expect(s.playerVision?.origins).toEqual([]);expect(needsVisibilityLayer(s.map,s.playerVision)).toBe(true);
 expect(usesMapVision(s.map,s.playerVision)).toBe(true);expect(s.exploredTerrain).toEqual([]);expect(s.tokens.some(t=>t.id===target.id)).toBe(false);
 const start=getToken(f.token.id)!,moved=moveToken(f.token.id,900,100)!;await recordWalkingMove(start,moved,true);
 const after=f.snapshot(),motion=await prepareLegacyMotion('blind-daylight',s,after,undefined,{membershipOnly:true});
 expect(after.exploredTerrain).toEqual([]);expect(motion?.frames).toHaveLength(13);
 expect(motion?.frames.every(frame=>frame.tokenIds.includes(f.token.id)&&!frame.tokenIds.includes(target.id))).toBe(true);
});
it('sighted allies still contribute shared vision and a blinded carrier still emits light',()=>{
 const f=fixture();f.blind();setTokenLantern(f.token.id,true);const other=createCharacter(f.session.id,{name:'Sighted'});createToken({mapId:f.map.id,kind:'pc',refId:other.id,x:200,y:100});
 const dm=buildSnapshot(f.session.id,'dm',f.map.id,'dm',null,true)!.partyView!;
 expect(dm.playerVision?.origins).toHaveLength(1);expect(dm.playerVision?.origins[0].id).not.toBe(f.token.id);
 expect(contains(dm.exploredTerrain,200)).toBe(true);expect(dm.playerVision?.lights.some(l=>l.id===f.token.id)).toBe(true);
});
it('teleport snaps without path exploration, then the next ordinary move animates and explores',async()=>{
 const f=fixture(),before=f.snapshot(),moved=moveToken(f.token.id,2100,100,false,true)!;
 await recordWalkingMove(f.token,moved,true,true);const after=f.snapshot();
 expect(moved.teleportedAt).toBeDefined();expect(walkingRoute(moved.id)).toBeUndefined();
 expect(contains(after.exploredTerrain,1100)).toBe(false);expect(contains(after.exploredTerrain,2100)).toBe(true);
 expect(await prepareLegacyMotion('teleport',before,after)).toBeUndefined();
 const presentation=new TokenPresentation();presentation.sync(before,10,0);presentation.sync(after,10,1);
 expect(presentation.position(moved.id)?.x).toBe(2100);
 const walked=moveToken(moved.id,4100,100)!;await recordWalkingMove(moved,walked,true);
 const walkedSnapshot=f.snapshot();expect(contains(walkedSnapshot.exploredTerrain,3100)).toBe(true);
 expect((await prepareLegacyMotion('walk-after-teleport',after,walkedSnapshot,undefined,{membershipOnly:true}))?.frames).toHaveLength(13);
});
