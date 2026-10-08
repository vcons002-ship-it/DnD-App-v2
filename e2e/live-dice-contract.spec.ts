import {test,expect} from '@playwright/test';
import {io,type Socket} from 'socket.io-client';
import {DM_SECRET,PORT} from './playwright.config';

test('shared live faces, private rolls, percentile dice and server completion after disconnect',async({request})=>{
 test.setTimeout(120000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Live dice network contracts'}})).json();
 const sockets:Socket[]=[];
 const connect=async(role:'dm'|'player')=>{
  const s=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(s);
  const joined=await s.timeout(5000).emitWithAck('join',{sessionCode:code,role,dmPassphrase:role==='dm'?DM_SECRET:undefined});expect(joined.ok).toBe(true);
  s.on('dice:frame',f=>s.emit('dice:ready',{id:f.id}));return s;
 };
 try {
 const dm=await connect('dm'),player=await connect('player'),peer=await connect('player');const a:any[]=[],b:any[]=[],c:any[]=[];
 dm.on('dice:frame',f=>a.push(f));player.on('dice:frame',f=>b.push(f));
 peer.on('dice:frame',f=>c.push(f));
 const snap=async(s=dm)=>(await s.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 dm.emit('dice:roll',{expr:'1d100',label:'Percentile'});
 await expect.poll(async()=> (await snap()).rollLog.some((r:any)=>r.label==='Percentile'),{timeout:30000}).toBe(true);
 const result=(await snap()).rollLog.find((r:any)=>r.label==='Percentile');
 expect(a[0].values).toEqual([null,null]);expect(a.findLast(f=>f.done)).toEqual(b.findLast(f=>f.done));
 const faces=a.findLast(f=>f.done).values;expect(result.total).toBe((faces[0]-1)*10+faces[1]-1||100);
 const first=a.length,hidden=b.length;
 dm.emit('session:setHideDmRolls',{hide:true});await snap();dm.emit('dice:roll',{expr:'1d20',advantage:'adv',label:'Private advantage'});
 await expect.poll(async()=> (await snap()).rollLog.some((r:any)=>r.label==='Private advantage'),{timeout:30000}).toBe(true);
 expect(b.length).toBe(hidden);expect(a.length).toBeGreaterThan(first);
 expect(c.some(f=>f.label==='Private advantage')).toBe(false);
 const playerView=await player.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'});
 expect(playerView.snapshot.rollLog.some((r:any)=>r.label==='Private advantage')).toBe(false);
 const frame=a.findLast(f=>f.done);expect(frame.kept).toBe(frame.values[0]>=frame.values[1]?0:1);
 expect((await snap()).rollLog.find((r:any)=>r.label==='Private advantage').total).toBe(Math.max(...frame.values));
 // Hiding DM rolls does not hide a player's public roll from the other party
 // members or DM. Those shared player rolls can switch the observed tray.
 player.emit('dice:roll',{expr:'1d6',label:'Shared player roll'});
 await expect.poll(async()=> (await snap()).rollLog.some((r:any)=>r.label==='Shared player roll'),{timeout:30000}).toBe(true);
 expect(a.some(f=>f.label==='Shared player roll'&&f.done)).toBe(true);
 expect(b.some(f=>f.label==='Shared player roll'&&f.done)).toBe(true);
 expect(c.some(f=>f.label==='Shared player roll'&&f.done)).toBe(true);
 // A broken connection cannot cancel an already-started server roll.
 const disconnected=new Promise<void>(resolve=>dm.once('dice:frame',()=>{dm.disconnect();resolve();}));
 dm.emit('dice:roll',{expr:'1d6',label:'Disconnect completion'});await disconnected;
 const replacement=await connect('dm');
 await expect.poll(async()=> (await snap(replacement)).rollLog.some((r:any)=>r.label==='Disconnect completion'),{timeout:30000}).toBe(true);
 const final=(await snap(replacement)).rollLog.filter((r:any)=>r.label==='Disconnect completion');expect(final).toHaveLength(1);expect(final[0].reveal.physical).toBe(true);
 } finally {sockets.forEach(s=>s.disconnect());}
});

test('a slow first tray load does not consume the visible toss', async ({request}) => {
 test.setTimeout(45000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Cold dice readiness'}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 try {
  const joined=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  expect(joined.ok).toBe(true);
  const frames:any[]=[];
  socket.on('dice:frame',frame=>frames.push(frame));
  socket.emit('dice:roll',{expr:'1d6',label:'Cold tray'});
  await expect.poll(()=>frames.length,{timeout:5000}).toBeGreaterThan(0);
  // The previous 2.5-second timeout launched here before graphics were ready.
  await new Promise(resolve=>setTimeout(resolve,4000));
  expect(frames.every(frame=>frame.elapsed===0&&frame.values.every((v:any)=>v===null))).toBe(true);
  const first=frames[0];
  socket.emit('dice:ready',{id:first.id});
  await expect.poll(()=>frames.some(frame=>frame.elapsed>0),{timeout:3000}).toBe(true);
  expect(frames.find(frame=>frame.elapsed>0).elapsed).toBeLessThan(.15);
  await expect.poll(()=>frames.some(frame=>frame.done),{timeout:20000}).toBe(true);
 } finally { socket.disconnect(); }
});

test('skipping releases presentation only and cannot hurry another player\'s roll', async ({request}) => {
 test.setTimeout(45000);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Skip live dice'}})).json();
 const owner=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 const observer=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});
 try {
  for(const socket of [owner,observer]) expect((await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).ok).toBe(true);
  const frames:any[]=[];let finished=false;
  owner.on('dice:frame',frame=>frames.push(frame));owner.on('dice:finished',()=>{finished=true;});
  owner.emit('dice:roll',{expr:'1d6',label:'Skip physics contract'});
  await expect.poll(()=>frames.length).toBeGreaterThan(0);
  const id=frames[0].id;
  observer.emit('dice:skip',{id});
  await new Promise(resolve=>setTimeout(resolve,350));
  expect(frames.every(frame=>frame.elapsed===0)).toBe(true);
  owner.emit('dice:ready',{id});
  await expect.poll(()=>frames.some(frame=>frame.done),{timeout:20000}).toBe(true);
  // An observer cannot cut the owner's result-reading hold short either.
  observer.emit('dice:skip',{id});
  await new Promise(resolve=>setTimeout(resolve,350));expect(finished).toBe(false);
  owner.emit('dice:skip',{id});
  await expect.poll(()=>finished,{timeout:1500}).toBe(true);
  const joined=await owner.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});
  const entries=joined.snapshot.rollLog.filter((r:any)=>r.label==='Skip physics contract');
  expect(entries).toHaveLength(1);expect(entries[0].total).toBe(frames.findLast(frame=>frame.done).values[0]);
  expect(entries[0].reveal.physical).toBe(true);
 } finally {owner.disconnect();observer.disconnect();}
});
