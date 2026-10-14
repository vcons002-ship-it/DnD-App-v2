import {it,expect,vi,afterEach} from 'vitest';
import {refreshMiniatureCatalog,resolveMiniature} from './miniatures';
afterEach(()=>vi.unstubAllGlobals());
it('resolves generated PC art by model id instead of character name and preserves campaign originals',async()=>{
  const a={id:'hero-rowan-a',url:'/uploads/miniatures/a.glb',baseDiameter:1.6,baseCenter:[0,0,0]},b={...a,id:'hero-rowan-b',url:'/uploads/miniatures/b.glb'};
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({models:[a,b]})})));
  await refreshMiniatureCatalog();expect(resolveMiniature('Rowan','pc',{modelType:a.id})?.url).toBe(a.url);
  expect(resolveMiniature('Rowan','pc',{modelType:b.id})?.url).toBe(b.url);expect(resolveMiniature('Druk','pc')?.id).toBe('druk');
  expect(resolveMiniature('Druk','pc',{modelType:'hero-pending'})).toBeNull();
});
