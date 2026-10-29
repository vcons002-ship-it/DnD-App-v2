import {afterEach,it,expect,vi} from 'vitest';
import {applySnapshotDelta,diffSnapshot} from '../../shared/stateDelta.js';
import {deliverState,pendingGeometry,resetDelivery,resyncDelivery} from './stateDelivery.js';
import {VisibilityWorkers,visibilityWorkers} from './visibilityWorkers.js';
import type {StateSnapshot} from '../../shared/types.js';
import type {PlayerVision} from '../../shared/playerVision.js';
const vision:PlayerVision={rangeFt:60,radius:60,heavy:true,origins:[{id:'pc',x:100,y:100}],walls:[{id:'wall',kind:'rectangle',ax:200,ay:-500,bx:215,by:500}],lights:[{id:'lamp',x:120,y:100,radius:100,height:10,strength:1}]};
const fixture=()=>({role:'player',sessionCode:'TEST',map:{id:'room',mapVisionEnabled:true},tokens:[{id:'pc',x:100,y:100},{id:'enemy',x:120,y:100}],characters:[],monsters:[],maps:[],rollLog:[],chat:[],playerVision:vision,exploredTerrain:[]} as unknown as StateSnapshot);
afterEach(async()=>{resetDelivery('test');vi.useRealTimers();await visibilityWorkers.close();});
it('keeps concealed party previews pending independently of an unobstructed DM view',()=>{
 const base=fixture(),pending=pendingGeometry({...base,role:'dm',playerVision:undefined,
  partyView:{map:base.map,tokens:base.tokens,monsters:[],playerVision:vision}});
 expect(pending.legacyGeometry?.sight).toEqual([]);
 expect(pending.partyView?.legacyGeometry).toBeNull();
});
it('unobstructed daylight delivery does not queue visibility workers',async()=>{
 const snapshot={...fixture(),playerVision:{...vision,heavy:false,daylight:true,walls:[]}};
 const work=vi.spyOn(visibilityWorkers,'run'),frames:any[]=[];
 try{
  deliverState({to:()=>({emit:(_event:any,frame:any)=>frames.push(frame)})},'test',snapshot,
   {stateProtocol:1,serverRendering:true,legacyRendering:true});
  await expect.poll(()=>frames.length).toBe(1);
  expect(work).not.toHaveBeenCalled();
  expect(frames[0].full.playerVision).toBe(snapshot.playerVision);
  expect(frames[0].full.legacyGeometry).toMatchObject({sight:[],near:[],lights:[],memory:[],affinity:['pc','enemy']});
 }finally{work.mockRestore();}
});
it('deltas remove newly hidden entities, preserve untouched references and remove optional views',()=>{
 const before={...fixture(),partyView:{map:null,monsters:[],tokens:[]}} as StateSnapshot;
 const after={...before,tokens:[{...before.tokens[0],x:110}],partyView:undefined,playerVision:undefined};
 const delta=diffSnapshot(before,after),next=applySnapshotDelta(before,JSON.parse(JSON.stringify(delta)));
 expect(next.tokens).toEqual(after.tokens);expect(next.tokens.some(t=>t.id==='enemy')).toBe(false);
 expect(next.characters).toBe(before.characters);expect(next).not.toHaveProperty('playerVision');expect(next).not.toHaveProperty('partyView');
});
it('movement deltas preserve static light and memory paths and unchanged token objects',()=>{
 const geometry={sight:['old'],near:['near'],lights:['large static polygon'],memory:['memory'],affinity:['pc']};
 const before={...fixture(),legacyGeometry:geometry},after={...before,tokens:[{...before.tokens[0],x:120},before.tokens[1]],legacyGeometry:{...geometry,sight:['new']}};
 const delta=diffSnapshot(before,after),next=applySnapshotDelta(before,delta);
 expect(next).toEqual(after);expect(next.tokens[1]).toBe(before.tokens[1]);expect(next.legacyGeometry?.lights).toBe(geometry.lights);
 expect(JSON.stringify(delta)).not.toContain('large static polygon');
});
it('DM party views are patched independently and never synthesized for player snapshots',()=>{
 const base=fixture(),before={...base,role:'dm',partyView:{map:base.map,tokens:base.tokens,monsters:[],playerVision:vision}} as StateSnapshot;
 const after={...before,partyView:{...before.partyView!,tokens:[base.tokens[0]]}};
 expect(applySnapshotDelta(before,diffSnapshot(before,after))).toEqual(after);
 expect(diffSnapshot(base,{...base,tokens:[]})).not.toHaveProperty('party');
});
it('resync forces a full frame and deltas chain only to the preceding sent revision',()=>{
 const messages:any[]=[];const io={to:()=>({emit:(event:any,payload:any)=>messages.push({event,payload})})};
 const a=fixture();deliverState(io,'test',a,{stateProtocol:1});deliverState(io,'test',{...a,tokens:[{...a.tokens[0],x:110},a.tokens[1]]},{stateProtocol:1});
 expect(messages[0].payload).toHaveProperty('full');expect(messages[1].payload.base).toBe(messages[0].payload.revision);
 resyncDelivery('test');deliverState(io,'test',a,{stateProtocol:1});expect(messages[2].payload).toHaveProperty('full');
});
it('wakes a coalesced Legacy update immediately for accepted positions, including party view',async()=>{
 vi.useFakeTimers();const messages:any[]=[];const io={to:()=>({emit:(_e:any,p:any)=>messages.push(p)})},base=fixture(),a={...base,partyView:{map:base.map,tokens:base.tokens,monsters:[]}} as StateSnapshot;
 const options={stateProtocol:1 as const,legacyRendering:true,serverRendering:false};deliverState(io,'test',a,options);
 deliverState(io,'test',{...a,chat:[]},options);await vi.advanceTimersByTimeAsync(100);expect(messages).toHaveLength(1);
 deliverState(io,'test',{...a,partyView:{...a.partyView!,tokens:[{...a.tokens[0],x:200},a.tokens[1]]}},options);await vi.advanceTimersByTimeAsync(0);expect(messages).toHaveLength(2);
});
it('retains the 500 ms coalescing interval for non-movement state changes',async()=>{
 vi.useFakeTimers();const messages:any[]=[];const io={to:()=>({emit:(_e:any,p:any)=>messages.push(p)})},a=fixture(),options={stateProtocol:1 as const,legacyRendering:true,serverRendering:false};
 deliverState(io,'test',a,options);deliverState(io,'test',{...a,chat:[]},options);await vi.advanceTimersByTimeAsync(499);expect(messages).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);expect(messages).toHaveLength(2);
});
it('worker output has occluded masks and affinity only for the supplied authorized tokens',async()=>{
 const pool=new VisibilityWorkers(1);
 try{const result=await pool.run({mapId:'room',vision,wallFog:true,explored:[],tokens:[{id:'pc',x:100,y:100},{id:'dark',x:300,y:100}]});expect(result.sight).toHaveLength(1);expect(result.affinity).toContain('pc');expect(result.affinity).not.toContain('dark');expect(result.memory).toEqual([]);expect(pool.metrics.jobs).toBe(1);}
 finally{await pool.close();}
});
it('coalesces in-flight Legacy states and publishes geometry and matching positions before effects',async()=>{
 const events:any[]=[];const io={to:()=>({emit:(event:any,payload:any)=>events.push({event,payload})})};const a=fixture();
 deliverState(io,'test',a,{stateProtocol:1,legacyRendering:true},()=>events.push({event:'effect'}));
 const moved={...a,tokens:[{...a.tokens[0],x:110}],playerVision:{...vision,origins:[{id:'pc',x:110,y:100}]}};
 deliverState(io,'test',moved,{stateProtocol:1,legacyRendering:true});
 await expect.poll(()=>events.some(e=>e.event==='state:frame'),{timeout:10000}).toBe(true);
 const first=events.find(e=>e.event==='state:frame').payload.full;expect(first.tokens[0].x).toBe(110);expect(first.legacyGeometry.sight).toHaveLength(1);expect(events[0].event).toBe('state:frame');expect(events[1].event).toBe('effect');
});
it('discarded connections cannot receive a late geometry result',async()=>{
 const messages:any[]=[];deliverState({to:()=>({emit:(...args:any[])=>messages.push(args)})},'test',fixture(),{stateProtocol:1,legacyRendering:true});resetDelivery('test');
 await new Promise(resolve=>setTimeout(resolve,450));expect(messages).toEqual([]);
});
it('movement previews check collisions and terrain in workers without moving the source token',async()=>{
 const pool=new VisibilityWorkers(1),token={...fixture().tokens[0],widthFt:5};
 try{const result=await pool.run({token,map:{...fixture().map!,walls:vision.walls,gridSizePx:50,feetPerSquare:5},vision,zones:[{x:140,y:100,radiusFt:10}],x:300,y:100,dm:false});expect(result.x).toBeLessThan(200);expect(result.costFt).toBeGreaterThan(result.distanceFt);expect(token.x).toBe(100);}finally{await pool.close();}
});
it('preserves completed geometry when queued updates only change nonvisual state like chat',async()=>{
 const frames:any[]=[],a=fixture();let resolveWorker!:(value:any)=>void;
 const work=vi.spyOn(visibilityWorkers,'run').mockImplementation(()=>new Promise(resolve=>{resolveWorker=resolve;}));
 try{
  const io={to:()=>({emit:(_event:any,frame:any)=>frames.push(frame)})};
  const opts={stateProtocol:1 as const,renderProtocol:3 as const,legacyRendering:true,serverRendering:true};
  deliverState(io,'test',a,opts);
  await expect.poll(()=>typeof resolveWorker).toBe('function');
  for(let i=1;i<=4;i++)deliverState(io,'test',{...a,chat:[{id:`c${i}`,sender:'DM',role:'dm',text:`msg ${i}`,createdAt:i}]},opts);
  resolveWorker({sight:['M0,0L10,0L10,10Z'],near:[],lights:[],memory:[],affinity:['pc']});
  await expect.poll(()=>frames.length).toBe(1);
  expect(work).toHaveBeenCalledTimes(1);
  expect(frames[0].full.chat).toHaveLength(1);
  expect(frames[0].full.chat[0].text).toBe('msg 4');
  expect(frames[0].full.legacyGeometry.sight).toEqual(['M0,0L10,0L10,10Z']);
 }finally{work.mockRestore();}
});
