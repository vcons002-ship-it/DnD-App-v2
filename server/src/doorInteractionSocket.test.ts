import {it,expect,vi} from 'vitest';
import {registerSocketHandlers} from './socketHandlers.js';import {setConn,dropConn,type IOServer} from './connections.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,claimCharacter,moveToken,getMap,getToken,setCondition,clearCondition,setTokenHidden} from './sessions.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
it('checks committed footprint reach on the server and preserves locked/hidden door restrictions',async()=>{
 const session=createSession('Door guards'),map=createMap(session.id,{name:'Room'});setActiveMap(session.id,map.id);
 editMapWalls(session.id,map.id,{add:{id:'wall',kind:'rectangle',ax:0,ay:200,bx:800,by:220}});
 expect(editMapWalls(session.id,map.id,{door:{wallId:'wall',id:'door',ax:300,ay:210,bx:500,by:210}})).toBeNull();
 const c=createCharacter(session.id,{name:'Player'}),t=createToken({mapId:map.id,kind:'pc',refId:c.id,x:400,y:340});
 const id='door-guard-'+session.id,emit=vi.fn(),handlers=new Map<string,(p:any)=>unknown>();let connect!:(s:any)=>void;
 const io={on:(_:string,cb:typeof connect)=>{connect=cb;},to:()=>({emit:vi.fn()})};registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
 connect({id,on:(event:string,fn:(p:any)=>unknown)=>handlers.set(event,fn),emit});setConn(id,{sessionId:session.id,role:'player',viewMapId:map.id,playerId:null});claimCharacter(c.id,id);
 const door=getMap(map.id)!.walls!.find(w=>w.id==='door')!,objectId=getToken(door.tokenId!)!.refId;
 const use=()=>handlers.get('map:setDoor')!({mapId:map.id,doorId:'door',open:true}),opened=()=>getMap(map.id)!.walls!.find(w=>w.id==='door')!.open;
 try{
  await use();expect(opened()).toBe(false);expect(emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringContaining('within 5 ft')}));
  moveToken(t.id,400,290);await use();expect(opened()).toBe(true); // 7 ft center, 4.5 ft from footprint edge.
  expect(setWallDoor(session.id,map.id,'door',false)).toBeNull();setCondition('monster',objectId,{id:'locked',label:'Locked',aura:'red',isConcentration:false});
  await use();expect(opened()).toBe(false);expect(emit).toHaveBeenCalledWith('notice',{message:'The door is locked. Unlock it first.'});
  clearCondition('monster',objectId,'locked');setTokenHidden(door.tokenId!,true);await use();expect(opened()).toBe(false);
 }finally{dropConn(id);}
});
