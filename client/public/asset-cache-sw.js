/* Persistent, same-origin visual-asset cache. Never caches API or campaign state. */
const CACHE='dnd-visual-assets-v1';
const checked=new Set(),pending=new Map();
function eligible(url){
 return url.origin===self.location.origin &&
  (/^\/(miniatures|art|fonts|assets)\//.test(url.pathname)||/^\/uploads\//.test(url.pathname)) &&
  /\.(glb|gltf|bin|ktx2?|png|jpe?g|webp|avif|gif|svg|woff2?|ttf|ogg|wav|mp3|json|js|css)$/i.test(url.pathname) &&
  (!url.pathname.endsWith('.json')||url.pathname.startsWith('/miniatures/'));
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function store(cache,request,response){
 if(!response.ok||response.status===206||/text\/html/.test(response.headers.get('content-type')||''))return;
 try{await cache.put(request,response.clone());}catch{/* Quota/private mode: the network response still works. */}
}
function refresh(cache,request,cached){
 const key=request.url;if(pending.has(key))return pending.get(key).then(response=>response.clone());
 const task=(async()=>{
  const headers=new Headers(request.headers);
  const etag=cached?.headers.get('etag'),modified=cached?.headers.get('last-modified');
  if(etag)headers.set('If-None-Match',etag);else if(modified)headers.set('If-Modified-Since',modified);
  const response=await fetch(new Request(request,{headers,cache:'no-store'}));
  if(response.status===304&&cached)return cached;
  await store(cache,request,response);return response;
 })().finally(()=>pending.delete(key));pending.set(key,task);return task.then(response=>response.clone());
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||request.headers.has('range')||!eligible(url))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(request);
  if(cached){
   // Vite fingerprints its assets. Stable model/art URLs get a conditional
   // background check once per worker lifetime, with no body transfer if unchanged.
   if(!url.pathname.startsWith('/assets/')&&!checked.has(request.url)){
    checked.add(request.url);event.waitUntil(refresh(cache,request,cached).catch(()=>{}));
   }
   return cached;
  }
  checked.add(request.url);return refresh(cache,request,null);
 })().catch(()=>fetch(request)));
});
