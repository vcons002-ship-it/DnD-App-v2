import {test,expect} from '@playwright/test';
test('visual assets survive page reloads and offline fetches without caching API state',async({page,context})=>{
 await page.goto('/');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 for(const asset of ['/art/dice-trays/fighter-v1.webp','/miniatures/monsters/goblin.glb']){
 const first=await page.evaluate(async url=>{const r=await fetch(url);return {status:r.status,bytes:(await r.arrayBuffer()).byteLength};},asset);
 expect(first.status).toBe(200);expect(first.bytes).toBeGreaterThan(1000);
 await expect.poll(()=>page.evaluate(async url=>!!await(await caches.open('dnd-visual-assets-v1')).match(url),asset)).toBe(true);
 await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);
 const offline=await page.evaluate(async url=>{const r=await fetch(url);return (await r.arrayBuffer()).byteLength;},asset);
 expect(offline).toBe(first.bytes);
 await context.setOffline(false);
 }
 const updated='/art/dice-trays/fighter-v1.webp?cache-test=update';
 await page.evaluate(async url=>{const cache=await caches.open('dnd-visual-assets-v1');await cache.put(url,new Response('old',{headers:{'content-type':'image/webp',etag:'"outdated"'}}));},updated);
 expect(await page.evaluate(async url=>(await fetch(url)).text(),updated)).toBe('old');
 await expect.poll(()=>page.evaluate(async url=>(await(await(await caches.open('dnd-visual-assets-v1')).match(url))!.arrayBuffer()).byteLength,updated)).toBeGreaterThan(1000);
 await page.evaluate(()=>fetch('/api/health'));
 const cached=await page.evaluate(async()=> (await(await caches.open('dnd-visual-assets-v1')).keys()).map(r=>new URL(r.url).pathname));
 expect(cached).not.toContain('/api/health');
});
