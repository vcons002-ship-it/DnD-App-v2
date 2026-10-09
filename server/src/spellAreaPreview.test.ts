import {afterEach,describe,expect,it} from 'vitest';
import {SpellAreaPreviewController} from './spellAreaPreview.js';
import {dropConn,setConn,type IOServer} from './connections.js';
import {claimCharacter,createCharacter,createMap,createSession,createToken,setActiveMap,setSheetAbility} from './sessions.js';
import {getSpell} from './spells/srd.js';
import type {SpellAreaPreviewIntent} from '../../shared/types.js';
const ids:string[]=[],controllers:SpellAreaPreviewController[]=[];
afterEach(()=>{controllers.splice(0).forEach(c=>c.clear());ids.splice(0).forEach(dropConn);});
function fixture(){
 const session=createSession('Shared spell area'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);
 const character=createCharacter(session.id,{name:'Wizard',className:'Wizard',level:5});
 setSheetAbility('pc',character.id,{...getSpell('Fireball')!,id:'fireball'});
 createToken({mapId:map.id,kind:'pc',refId:character.id,x:100,y:100});
 const routed:{id:string;event:string;payload:any}[]=[],io={to:(id:string)=>({emit:(event:string,payload:any)=>routed.push({id,event,payload})})} as unknown as IOServer;
 const connect=(name:string,role:'dm'|'player',mapId=map.id,sid=session.id)=>{const id=name+session.id;ids.push(id);setConn(id,{sessionId:sid,role,viewMapId:role==='dm'?mapId:null,playerId:null});return id;};
 const owner=connect('owner','player'),dm=connect('dm','dm'),other=connect('other','player');claimCharacter(character.id,owner);
 const controller=new SpellAreaPreviewController(io,owner);controllers.push(controller);
 const intent:SpellAreaPreviewIntent={kind:'pc',refId:character.id,abilityId:'fireball',area:{mapId:map.id,points:[{x:400,y:200}],angle:0}};
 return {session,map,character,routed,connect,owner,dm,other,controller,intent};
}
describe('shared spell area preview',()=>{
 it('relays exact canonical geometry to the caster and map DM without revealing targets to other players',()=>{
  const f=fixture(),staging=createMap(f.session.id,{name:'Staging'}),stagingDm=f.connect('staging','dm',staging.id),foreign=f.connect('foreign','dm',f.map.id,createSession('Other').id);
  f.controller.update(f.intent);
  const shown=f.routed.filter(r=>r.payload.preview);
  expect(shown.map(r=>r.id).sort()).toEqual([f.owner,f.dm].sort());
  expect(shown[0].payload.preview).toMatchObject({name:'Fireball',spec:{kind:'sphere',sizeFt:20},area:f.intent.area,resolving:false});
  expect(JSON.stringify(shown)).not.toContain('targets');expect(shown.some(r=>[f.other,stagingDm,foreign].includes(r.id))).toBe(false);
  f.controller.update({...f.intent,area:{...f.intent.area,points:[{x:450,y:250}]}});
  expect(f.routed.filter(r=>r.id===f.dm).at(-1)!.payload.preview.area.points).toEqual([{x:450,y:250}]);
  f.controller.update(null);expect(f.routed.filter(r=>r.id===f.dm).at(-1)!.payload.preview).toBeNull();
 });
 it('locks the confirmed shape through saves and approval; cancellation or late pointer updates cannot remove it',()=>{
  const f=fixture();f.controller.update(f.intent);expect(f.controller.begin(f.intent)).toBe(true);
  const count=f.routed.length;f.controller.update(null);f.controller.update({...f.intent,area:{...f.intent.area,points:[{x:900,y:900}]}});
  expect(f.routed).toHaveLength(count);expect(f.routed.at(-1)!.payload.preview).toMatchObject({resolving:true,area:f.intent.area});
  f.controller.clear();expect(f.routed.at(-1)!.payload.preview).toBeNull();
 });
 it('rejects another character, another map, excessive points and malformed coordinates',()=>{
  const f=fixture(),otherCharacter=createCharacter(f.session.id,{name:'Other'}),otherMap=createMap(f.session.id,{name:'Other map'});
  for(const intent of [{...f.intent,refId:otherCharacter.id},{...f.intent,abilityId:'missing'},{...f.intent,area:{...f.intent.area,mapId:otherMap.id}},{...f.intent,area:{...f.intent.area,points:[{x:1,y:2},{x:3,y:4}]}},{...f.intent,area:{...f.intent.area,points:[{x:NaN,y:1}]}},{...f.intent,area:{...f.intent.area,mapId:42}}])f.controller.update(intent as SpellAreaPreviewIntent);
  expect(f.routed).toHaveLength(0);
 });
});
