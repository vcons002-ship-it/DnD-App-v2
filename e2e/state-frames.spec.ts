import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {applySnapshotDelta,type StateFrame} from '../shared/stateDelta';
import type {StateSnapshot} from '../shared/types';

test('server frames remove hidden figures, resync completely and restore a Legacy connection without stale geometry',async({request})=>{
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Revision and visibility regression'}})).json();
 const image=await sharp({create:{width:900,height:600,channels:3,background:'#544937'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']}),player=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const frames:StateFrame[]=[];let current:StateSnapshot|null=null,revision=0;
 player.on('state:frame',(frame:StateFrame)=>{frames.push(frame);if('full' in frame)current=frame.full;else{expect(frame.base).toBe(revision);current=applySnapshotDelta(current!,frame.delta);}revision=frame.revision;});
 try{
  const initial=await snapshot(),pc=initial.characters.find((c:any)=>c.name==='Druk');
  admin.emit('map:setActive',{mapId:map.id});for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:150,y:300});
  admin.emit('monster:create',{name:'Private enemy',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  let state=await snapshot();const template=state.monsterTemplates.find((m:any)=>m.name==='Private enemy');admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:220,y:300});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[{id:'lamp',x:200,y:300,radiusFt:30,heightFt:6,color:'warm',intensity:1,flicker:false,visibleTorch:true}]}});
  state=await snapshot();const enemy=state.tokens.find((t:any)=>t.kind==='monster'),hero=state.tokens.find((t:any)=>t.kind==='pc');
  const join=async()=>{const ack=await player.timeout(10000).emitWithAck('join',{sessionCode:code,role:'player',playerId:'frame-regression',stateProtocol:1,legacyRendering:true});expect(ack.ok).toBe(true);expect(ack.snapshot.legacyGeometry).toBeNull();};
  await join();player.emit('character:claim',{characterId:pc.id});
  await expect.poll(()=>current?.playerVision?.origins.length).toBe(1);await expect.poll(()=>current?.legacyGeometry?.sight.length).toBe(1);
  expect(current!.tokens.some(t=>t.id===enemy.id)).toBe(true);expect(current).not.toHaveProperty('partyView');
  admin.emit('token:setHidden',{tokenId:enemy.id,hidden:true});await expect.poll(()=>current?.tokens.some(t=>t.id===enemy.id)).toBe(false);
  const removalCount=frames.length;player.emit('token:move',{tokenId:hero.id,x:150,y:360});
  await expect.poll(()=>current?.tokens.find(t=>t.id===hero.id)?.y).toBe(360);
  expect(JSON.stringify(frames.slice(removalCount))).not.toContain(enemy.id);
  expect(current!.legacyGeometry?.affinity).not.toContain(enemy.id);
  const beforeResync=frames.length;player.emit('state:resync');await expect.poll(()=>frames.length).toBeGreaterThan(beforeResync);expect(frames.at(-1)).toHaveProperty('full');
  expect(current!.tokens.some(t=>t.id===enemy.id)).toBe(false);
  const beforeRejoin=frames.length;await join();await expect.poll(()=>frames.length).toBeGreaterThan(beforeRejoin);expect(frames.slice(beforeRejoin).some(f=>'full' in f)).toBe(true);
  expect(current!.legacyGeometry?.sight).toHaveLength(1);expect(current!.tokens.find(t=>t.id===hero.id)?.y).toBe(360);
 }finally{admin.disconnect();player.disconnect();}
});
