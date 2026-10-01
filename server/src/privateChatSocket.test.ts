import {afterEach,describe,expect,it,vi} from 'vitest';
import {registerSocketHandlers} from './socketHandlers.js';
import {dropConn,setConn,type IOServer} from './connections.js';
import {claimCharacter,createCharacter,createSession,listChat,listRollLog} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {db,newId} from './db.js';
import type {ChatSendPayload} from '../../shared/types.js';

const connected:string[]=[];
afterEach(()=>{connected.splice(0).forEach(dropConn);vi.restoreAllMocks();});
function client(sessionId:string,role:'dm'|'player',playerId:string|null) {
  let connect!:(socket:unknown)=>void;
  const routed:{socketId:string;event:string}[]=[];
  const io={on:(_:string,fn:typeof connect)=>{connect=fn;},to:(socketId:string)=>({emit:(event:string)=>routed.push({socketId,event})})};
  // Use the ordinary live-physics wrapper: private /roll must never start it.
  registerSocketHandlers(io as unknown as IOServer);
  const handlers=new Map<string,(...args:any[])=>void>(),id=`whisper-${Math.random()}`;
  const emit=vi.fn();
  connect({id,connected:true,on:(event:string,fn:(...args:any[])=>void)=>handlers.set(event,fn),emit});
  setConn(id,{sessionId,role,viewMapId:null,playerId});connected.push(id);
  return {id,emit,routed,send:(payload:ChatSendPayload)=>{const ack=vi.fn();handlers.get('chat:send')!(payload,ack);return ack;}};
}
function fixture() {
  const session=createSession('Private socket checks');
  const a=client(session.id,'player','owner-a'),b=client(session.id,'player','owner-b'),dm=client(session.id,'dm',null);
  const alice=createCharacter(session.id,{name:'Alice'}),bob=createCharacter(session.id,{name:'Bob'});
  claimCharacter(alice.id,a.id,'owner-a');claimCharacter(bob.id,b.id,'owner-b');
  return {session,a,b,dm,alice,bob};
}
describe('private chat commands',()=>{
  it('keeps replies with the original players after either character changes owners',()=>{
    const f=fixture(),replacement=client(f.session.id,'player','replacement-owner');
    f.a.send({text:'Original secret',whisperTo:f.bob.id});
    const message=listChat(f.session.id)[0];
    claimCharacter(f.alice.id,replacement.id,'replacement-owner');
    claimCharacter(f.bob.id,replacement.id,'replacement-owner');
    const aView=buildSnapshot(f.session.id,'player',null,f.a.id,'owner-a')!;
    const bView=buildSnapshot(f.session.id,'player',null,f.b.id,'owner-b')!;
    expect(aView.chat[0].whisper?.replyTo).toBe(f.bob.id);
    expect(bView.chat[0].whisper?.replyTo).toBe(f.alice.id);
    expect(f.a.send({text:'Still to original Bob',whisperTo:f.bob.id,replyToMessageId:message.id})).toHaveBeenCalledWith({ok:true});
    expect(f.b.send({text:'Still to original Alice',whisperTo:f.alice.id,replyToMessageId:message.id})).toHaveBeenCalledWith({ok:true});
    expect(buildSnapshot(f.session.id,'player',null,f.b.id,'owner-b')!.chat.map(m=>m.text)).toEqual(['Original secret','Still to original Bob','Still to original Alice']);
    expect(buildSnapshot(f.session.id,'player',null,replacement.id,'replacement-owner')!.chat).toEqual([]);
    expect(replacement.send({text:'Intrude',whisperTo:'dm',replyToMessageId:message.id})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    expect(f.dm.send({text:'Intrude as DM',whisperTo:f.alice.id,replyToMessageId:message.id})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
  });
  it('acknowledges DM, peer and Party sends without public speech bubbles',()=>{
    const f=fixture();
    expect(f.dm.send({text:'Only Alice',whisperTo:f.alice.id})).toHaveBeenCalledWith({ok:true});
    expect(f.a.send({text:'Only Bob',whisperTo:f.bob.id})).toHaveBeenCalledWith({ok:true});
    expect(f.b.send({text:'Players only',whisperTo:'party'})).toHaveBeenCalledWith({ok:true});
    expect(f.a.send({text:'Reply to DM',whisperTo:'dm'})).toHaveBeenCalledWith({ok:true});
    expect(buildSnapshot(f.session.id,'dm')!.chat.map(m=>m.text)).toEqual(['Only Alice','Reply to DM']);
    expect(buildSnapshot(f.session.id,'player',null,f.b.id,'owner-b')!.chat.map(m=>m.text)).toEqual(['Only Bob','Players only']);
    expect([...f.dm.routed,...f.a.routed,...f.b.routed].every(e=>!e.event.startsWith('fx:'))).toBe(true);
  });
  it.each(['/roll 1d20','/r 2d6','/ask what happened','/recap'])('rejects private command %s before the live roll or AI workflow',text=>{
    const f=fixture();
    const ack=f.a.send({text,whisperTo:'party'});
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    expect(listChat(f.session.id)).toEqual([]);expect(listRollLog(f.session.id)).toEqual([]);
    expect(f.a.emit.mock.calls.some(([event])=>String(event).startsWith('dice:'))).toBe(false);
  });
  it('rejects foreign recipients, DM Party access and stolen attachments; accepts an image-only whisper',()=>{
    const f=fixture(),foreign=createCharacter(createSession('Other campaign').id,{name:'Foreign'});
    claimCharacter(foreign.id,'foreign','foreign-owner');
    expect(f.a.send({text:'Wrong campaign',whisperTo:foreign.id})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    expect(f.dm.send({text:'Intrude',whisperTo:'party'})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    const imageId=newId();
    db.prepare('INSERT INTO chat_images(id,session_id,uploader_owner_id,name,file_name,mime,created_at) VALUES(?,?,?,?,?,?,?)').run(imageId,f.session.id,'owner-a','Secret.png',`${imageId}.png`,'image/png',Date.now());
    expect(f.b.send({text:'Steal',whisperTo:'dm',imageId})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    expect(f.a.send({text:'',whisperTo:f.bob.id,imageId})).toHaveBeenCalledWith({ok:true});
    expect(buildSnapshot(f.session.id,'player',null,f.b.id,'owner-b')!.chat[0].image).toEqual({id:imageId,name:'Secret.png'});
    expect(buildSnapshot(f.session.id,'dm')!.chat).toEqual([]);
    expect(f.dm.send({text:'Publish',imageId})).toHaveBeenCalledWith(expect.objectContaining({ok:false}));
    expect(listChat(f.session.id)).toHaveLength(1);
  });
});
