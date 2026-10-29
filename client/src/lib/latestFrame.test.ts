import {it,expect,vi} from 'vitest';
import {createLatestFrame} from './latestFrame';

it('coalesces a pointer burst and flushes the final camera before a release hit test',()=>{
 const frames=new Map<number,()=>void>();let id=0,position=0;
 const paint=vi.fn((value:number)=>{position=value;});
 const batch=createLatestFrame(paint,run=>{frames.set(++id,run);return id;},key=>{frames.delete(key);});
 for(let i=1;i<=20;i++)batch.push(i);
 expect(frames.size).toBe(1);expect(position).toBe(0);
 [...frames.values()][0]();expect(paint).toHaveBeenCalledTimes(1);expect(position).toBe(20);
 batch.push(25);batch.flush();expect(position).toBe(25);expect(frames.size).toBe(0);
 batch.push(30);batch.cancel();expect(frames.size).toBe(0);expect(position).toBe(25);
});
