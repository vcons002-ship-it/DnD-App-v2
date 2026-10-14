import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
it('caches complete video and serves exact ranges without another download',async()=>{
 const handlers=new Map<string,(event:any)=>void>(),entries=new Map<string,Response>();
 const cache={match:async(r:Request)=>entries.get(r.url)?.clone(),put:async(r:Request,v:Response)=>{entries.set(r.url,v.clone());}};
 const fetch=vi.fn(async(r:Request)=>r.headers.has('range')?new Response('bc',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 1-2/6'}}):new Response('abcdef',{headers:{'content-type':'video/mp4','content-length':'6'}}));
 runInNewContext(readFileSync(new URL('../../public/asset-cache-sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://vtt.test'},addEventListener:(type:string,fn:any)=>handlers.set(type,fn)},caches:{open:async()=>cache},Request,Response,Headers,URL,fetch,Set,Map});
 const call=async(range:string)=>{
  let result:Promise<Response>|undefined;const waits:Promise<unknown>[]=[];
  handlers.get('fetch')!({request:new Request('https://vtt.test/uploads/map.mp4',{headers:{Range:range}}),respondWith:(p:Promise<Response>)=>result=p,waitUntil:(p:Promise<unknown>)=>waits.push(p)});
  const response=await result!;await Promise.all(waits);return response;
 };
 expect((await call('bytes=1-2')).status).toBe(206);expect(fetch).toHaveBeenCalledTimes(2);
 const cached=await call('bytes=2-4');expect(cached.status).toBe(206);expect(cached.headers.get('content-range')).toBe('bytes 2-4/6');expect(await cached.text()).toBe('cde');
 expect(await(await call('bytes=-2')).text()).toBe('ef');expect((await call('bytes=10-20')).status).toBe(416);expect(fetch).toHaveBeenCalledTimes(2);
});
