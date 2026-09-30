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
 const dm=await connect('dm'),player=await connect('player');const a:any[]=[],b:any[]=[];
 dm.on('dice:frame',f=>a.push(f));player.on('dice:frame',f=>b.push(f));
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
 const playerView=await player.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'});
 expect(playerView.snapshot.rollLog.some((r:any)=>r.label==='Private advantage')).toBe(false);
 const frame=a.findLast(f=>f.done);expect(frame.kept).toBe(frame.values[0]>=frame.values[1]?0:1);
 expect((await snap()).rollLog.find((r:any)=>r.label==='Private advantage').total).toBe(Math.max(...frame.values));
 // A broken connection cannot cancel an already-started server roll.
 const disconnected=new Promise<void>(resolve=>dm.once('dice:frame',()=>{dm.disconnect();resolve();}));
 dm.emit('dice:roll',{expr:'1d6',label:'Disconnect completion'});await disconnected;
 const replacement=await connect('dm');
 await expect.poll(async()=> (await snap(replacement)).rollLog.some((r:any)=>r.label==='Disconnect completion'),{timeout:30000}).toBe(true);
 const final=(await snap(replacement)).rollLog.filter((r:any)=>r.label==='Disconnect completion');expect(final).toHaveLength(1);expect(final[0].reveal.physical).toBe(true);
 } finally {sockets.forEach(s=>s.disconnect());}
});
