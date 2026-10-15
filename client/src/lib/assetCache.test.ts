import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

/** Load the service worker into a sandbox with a fake network and cache. */
function worker(network:(r:Request)=>Response){
 const handlers=new Map<string,(event:any)=>void>(),entries=new Map<string,Response>();
 const cache={
  match:async(r:Request)=>entries.get(r.url)?.clone(),
  put:async(r:Request,v:Response)=>{const body=await v.arrayBuffer();entries.delete(r.url);entries.set(r.url,new Response(body,{status:v.status,headers:v.headers}));},
  keys:async()=>[...entries.keys()].map(u=>new Request(u)),
  delete:async(r:Request)=>entries.delete(r.url),
 };
 const fetch=vi.fn(async(r:Request)=>network(r));
 runInNewContext(readFileSync(new URL('../../public/asset-cache-sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://vtt.test'},addEventListener:(type:string,fn:any)=>handlers.set(type,fn)},caches:{open:async()=>cache},Request,Response,Headers,URL,fetch,Set,Map});
 const call=async(path:string,range?:string)=>{
  let result:Promise<Response>|undefined;const waits:Promise<unknown>[]=[];
  handlers.get('fetch')!({request:new Request(`https://vtt.test${path}`,{headers:range?{Range:range}:{}}),respondWith:(p:Promise<Response>)=>result=p,waitUntil:(p:Promise<unknown>)=>waits.push(p)});
  const response=await result!;const text=await response.clone().text();await Promise.all(waits);return {response,text};
 };
 return {call,fetch,entries};
}
const movie='abcdef';
const ranged=(r:Request,total=movie.length)=>{
 const m=/bytes=(\d+)-(\d*)/.exec(r.headers.get('range')??'');
 if(!m)return new Response(movie,{headers:{'content-type':'video/mp4','content-length':String(total)}});
 const start=Number(m[1]),end=m[2]?Number(m[2]):total-1;
 return new Response(movie.slice(start,end+1),{status:206,headers:{'content-type':'video/mp4','content-range':`bytes ${start}-${end}/${total}`}});
};

it('caches a complete video from the playback stream itself and serves exact ranges without another download',async()=>{
 const sw=worker(r=>ranged(r));
 const first=await sw.call('/uploads/map.mp4','bytes=0-');
 expect(first.response.status).toBe(206);expect(first.text).toBe(movie);
 expect(sw.fetch).toHaveBeenCalledTimes(1); // no second, background download
 const cached=await sw.call('/uploads/map.mp4','bytes=2-4');
 expect(cached.response.status).toBe(206);expect(cached.response.headers.get('content-range')).toBe('bytes 2-4/6');expect(cached.text).toBe('cde');
 expect((await sw.call('/uploads/map.mp4','bytes=-2')).text).toBe('ef');
 expect((await sw.call('/uploads/map.mp4','bytes=10-20')).response.status).toBe(416);
 expect(sw.fetch).toHaveBeenCalledTimes(1);
});

it('never stores a partial range as the whole movie, or a video over the size cap',async()=>{
 const partial=worker(r=>ranged(r));
 expect((await partial.call('/uploads/seek.mp4','bytes=1-2')).text).toBe('bc');
 expect(partial.entries.size).toBe(0);
 const huge=worker(r=>ranged(r,200*1024*1024));
 await huge.call('/uploads/huge.mp4','bytes=0-');
 expect(huge.entries.size).toBe(0);
});

it('keeps only the newest few videos',async()=>{
 const sw=worker(r=>ranged(r));
 for(let i=0;i<8;i++)await sw.call(`/uploads/map-${i}.mp4`,'bytes=0-');
 expect([...sw.entries.keys()].map(u=>new URL(u).pathname)).toEqual([2,3,4,5,6,7].map(i=>`/uploads/map-${i}.mp4`));
});
