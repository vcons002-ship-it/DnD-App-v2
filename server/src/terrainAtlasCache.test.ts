import {it,expect,vi} from 'vitest';
import {TerrainAtlasCache} from './terrainAtlasCache.js';
const result=(size=4)=>({width:1,height:1,terrain:new Uint8Array(size)});
it('shares in-flight pixel work, without caching rejected jobs',async()=>{
 const cache=new TerrainAtlasCache(),build=vi.fn(async()=>result()),reused=vi.fn();
 const [a,b]=await Promise.all([cache.get('same',build),cache.get('same',build,reused)]);expect(a).toBe(b);expect(build).toHaveBeenCalledTimes(1);expect(reused).toHaveBeenCalledTimes(1);
 const fail=vi.fn().mockRejectedValueOnce(Error('worker failed')).mockResolvedValue(result());
 await expect(cache.get('retry',fail)).rejects.toThrow('worker failed');await cache.get('retry',fail);expect(fail).toHaveBeenCalledTimes(2);
});
it('bounds encoded bytes and evicts least-recently-used results',async()=>{
 const cache=new TerrainAtlasCache(8,2),build=vi.fn(async()=>result());
 await cache.get('a',build);await cache.get('b',build);await cache.get('a',build);await cache.get('c',build);await cache.get('a',build);expect(build).toHaveBeenCalledTimes(3);
 await cache.get('b',build);expect(build).toHaveBeenCalledTimes(4);expect(cache.metrics.bytes).toBe(8);
 const large=vi.fn(async()=>result(12));await cache.get('large',large);await cache.get('large',large);expect(large).toHaveBeenCalledTimes(2);expect(cache.metrics.bytes).toBe(8);
});
