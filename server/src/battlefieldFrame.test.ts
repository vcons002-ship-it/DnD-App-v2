import {describe,it,expect} from 'vitest';
import {createBattlefieldFrameScheduler} from '../../client/src/canvas/battlefieldFrame.js';

function clock() {
  const frames = new Map<number, (time:number)=>void>(); let id=0;
  const scheduler = createBattlefieldFrameScheduler(callback=>{frames.set(++id,callback);return id;},key=>{frames.delete(key);});
  return {scheduler,frames,tick(time:number){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));}};
}
describe('battlefield frame ordering',()=>{
  it('applies a camera update before an already queued animated scene paint',()=>{
    const {scheduler,tick,frames}=clock();let angle=0;const painted:number[]=[];
    scheduler.request(()=>painted.push(angle),'render');
    scheduler.request(()=>{angle=45;},'camera');
    expect(frames.size).toBe(1);tick(16);
    expect(painted).toEqual([45]);expect(frames.size).toBe(0);
  });
  it('paints a scene first requested by the camera in the same frame',()=>{
    const {scheduler,tick}=clock();const times:number[]=[];
    scheduler.request(()=>scheduler.request(time=>times.push(time),'render'),'camera');
    tick(16);expect(times).toEqual([16]);
  });
  it('keeps recurring camera and effects work to one paint per frame',()=>{
    const {scheduler,tick,frames}=clock();let angle=0;const painted:number[]=[];let cameraId=0,renderId=0;
    const render=()=>{renderId=0;painted.push(angle);renderId=scheduler.request(render,'render');};
    const camera=()=>{angle++;if(!renderId)renderId=scheduler.request(render,'render');cameraId=scheduler.request(camera,'camera');};
    renderId=scheduler.request(render,'render');cameraId=scheduler.request(camera,'camera');
    for(let i=1;i<=5;i++){expect(frames.size).toBe(1);tick(i*16);}
    expect(painted).toEqual([1,2,3,4,5]);
    scheduler.cancel(cameraId);scheduler.cancel(renderId);expect(frames.size).toBe(0);
  });
  it('does not run a render canceled or replaced by the camera',()=>{
    const {scheduler,tick}=clock();const painted:string[]=[];
    const id=scheduler.request(()=>painted.push('stale'),'render');
    scheduler.request(()=>{scheduler.cancel(id);scheduler.request(()=>painted.push('current'),'render');},'camera');
    tick(16);expect(painted).toEqual(['current']);
  });
});
