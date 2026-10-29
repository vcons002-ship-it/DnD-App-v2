import {afterEach,it,expect,vi} from 'vitest';
import {registerSocketHandlers} from './socketHandlers.js';
import {setConn,dropConn,sendSnapshot,type IOServer} from './connections.js';
import {createSession,createMap,createCharacter,createToken,claimCharacter,getToken,setActiveMap} from './sessions.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import type {MovementPreview} from '../../shared/movementPreview.js';
import {changeRenderingPolicy} from './renderingPolicy.js';
const ids:string[]=[];
afterEach(async()=>{ids.splice(0).forEach(dropConn);await visibilityWorkers.close();});
function fixture(){
 const session=createSession('Preview authorization'),map=createMap(session.id,{name:'Room'}),foreign=createMap(createSession('Other').id,{name:'Other'});
 setActiveMap(session.id,map.id);
 const mine=createCharacter(session.id,{name:'Mine'}),theirs=createCharacter(session.id,{name:'Theirs'});
 const token=createToken({mapId:map.id,kind:'pc',refId:mine.id,x:100,y:100}),other=createToken({mapId:map.id,kind:'pc',refId:theirs.id,x:300,y:100}),foreignToken=createToken({mapId:foreign.id,kind:'pc',refId:mine.id,x:100,y:100});
 let connect!:(s:any)=>void;const io={on:(_:string,handler:typeof connect)=>connect=handler,to:()=>({emit:vi.fn()})};
 registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
 const handlers=new Map<string,(...args:any[])=>unknown>(),id=`preview-${session.id}`;ids.push(id);
 connect({id,connected:true,on:(event:string,handler:(...args:any[])=>unknown)=>handlers.set(event,handler),emit:vi.fn()});
 claimCharacter(mine.id,id);claimCharacter(theirs.id,'someone-else');setConn(id,{sessionId:session.id,viewMapId:map.id,role:'player',playerId:null});sendSnapshot(io as unknown as IOServer,id);
 const preview=(point:unknown)=>new Promise<MovementPreview|null>(resolve=>handlers.get('token:preview')!(point,resolve));
 return {preview,token,other,foreignToken,id,session,map};
}
it('rejects unknown, other-owner, foreign-map and non-finite preview requests',async()=>{
 const f=fixture();
 for(const tokenId of ['unknown',f.other.id,f.foreignToken.id])expect(await f.preview({tokenId,x:120,y:120})).toBeNull();
 expect(await f.preview({tokenId:f.token.id,x:Infinity,y:120})).toBeNull();
 expect(await f.preview(null)).toBeNull();
});
it('returns an advisory worker result only to the authorized connection without mutating placement',async()=>{
 const f=fixture();
 changeRenderingPolicy(f.session.id,{mapId:f.map.id,value:'off'});
 expect(await f.preview({tokenId:f.token.id,x:150,y:150})).toBeNull();
 changeRenderingPolicy(f.session.id,{mapId:f.map.id,value:'inherit'});
 const result=await f.preview({tokenId:f.token.id,x:150,y:150});expect(result).toMatchObject({x:150,y:150});expect(result!.costFt).toBeGreaterThan(0);expect(getToken(f.token.id)).toMatchObject({x:100,y:100});
 expect(await f.preview({tokenId:f.token.id,x:160,y:160})).toBeNull();
 dropConn(f.id);expect(await f.preview({tokenId:f.token.id,x:150,y:150})).toBeNull();
});
