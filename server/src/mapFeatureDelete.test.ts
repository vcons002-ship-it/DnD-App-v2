import {it,expect,vi} from 'vitest';
import {createSession,createMap,getMap,getToken,updateMapEnvironment} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {deleteMapFeatures} from './mapFeatureDelete.js';
import {popUndo,peekUndo} from './undo.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {setConn,dropConn,type IOServer} from './connections.js';

function fixture(){
 const s=createSession('Map editing'),m=createMap(s.id,{name:'Building'});
 editMapWalls(s.id,m.id,{add:{id:'building',kind:'rectangle',ax:0,ay:100,bx:600,by:120}});
 editMapWalls(s.id,m.id,{add:{id:'window',kind:'rectangle',ax:50,ay:100,bx:80,by:120,window:true}});
 editMapWalls(s.id,m.id,{door:{wallId:'building',id:'door',ax:200,ay:110,bx:250,by:110}});
 updateMapEnvironment(s.id,m.id,{lighting:'dungeon',lights:[{id:'light',x:80,y:80},{id:'keep-light',x:400,y:80}]});
 return {s,m,original:getMap(m.id)!};
}
it('deletes a mixed selection as one undo, restores linked doors and keeps later unrelated edits',()=>{
 const {s,m,original}=fixture(),door=original.walls!.find(w=>w.id==='door')!;
 const token=getToken(door.tokenId!)!;
 expect(deleteMapFeatures(s.id,m.id,['window','door'],['light'])).toBeNull();
 expect(getMap(m.id)!.walls).toEqual(original.walls!.filter(w=>!['window','door'].includes(w.id)));
 expect(getToken(token.id)).toBeNull();
 expect(getMap(m.id)!.environment!.lights.map(l=>l.id)).toEqual(['keep-light']);
 expect(peekUndo(s.id)).toBe('Delete map features');
 editMapWalls(s.id,m.id,{add:{id:'later',ax:100,ay:0,bx:100,by:50}});
 updateMapEnvironment(s.id,m.id,{lightLevel:.3,lights:[...getMap(m.id)!.environment!.lights,{id:'later-light',x:500,y:100}]});
 popUndo(s.id)!.run();
 const restored=getMap(m.id)!;
 expect(restored.walls).toEqual(expect.arrayContaining(original.walls!));
 expect(restored.walls!.map(w=>w.id)).toContain('later');
 expect(restored.environment!.lights.map(l=>l.id).sort()).toEqual(['keep-light','later-light','light']);
 expect(restored.environment!.lightLevel).toBe(.3);
 expect(getToken(token.id)).toEqual(token);
});
it('rejects malformed selections and foreign maps without changing anything; stale selections do nothing',()=>{
 const {s,m,original}=fixture(),other=createSession('Other campaign');
 for(const [walls,lights] of [[null,[]],[['window','window'],[]],[[],[1]]])expect(deleteMapFeatures(s.id,m.id,walls,lights)).toBeTruthy();
 expect(deleteMapFeatures(other.id,m.id,['building'],['light'])).toBeTruthy();
 expect(getMap(m.id)).toEqual(original);
 expect(deleteMapFeatures(s.id,m.id,['gone'],['gone'])).toBeNull();
 expect(peekUndo(s.id)).toBeNull();
});
it('permits only the DM socket to delete map features',async()=>{
 const {s,m}=fixture(),handlers=new Map<string,(p:any)=>unknown>();let connect!:(socket:any)=>void;
 const io={on:(_:string,cb:typeof connect)=>{connect=cb;},to:()=>({emit:vi.fn()})};
 registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
 const id='feature-delete-'+s.id;connect({id,on:(event:string,fn:(p:any)=>unknown)=>handlers.set(event,fn),emit:vi.fn()});
 const use=()=>handlers.get('map:deleteFeatures')!({mapId:m.id,wallIds:['window'],lightIds:['light']});
 try{
  setConn(id,{sessionId:s.id,role:'player',viewMapId:m.id,playerId:null});await use();
  expect(getMap(m.id)!.walls!.some(w=>w.id==='window')).toBe(true);
  setConn(id,{sessionId:s.id,role:'dm',viewMapId:m.id,playerId:null});await use();
  expect(getMap(m.id)!.walls!.some(w=>w.id==='window')).toBe(false);
  expect(getMap(m.id)!.environment!.lights.map(l=>l.id)).toEqual(['keep-light']);
 }finally{dropConn(id);}
});
