/* Persistent, same-origin visual-asset cache. Never caches API or campaign state. */
const CACHE='dnd-visual-assets-v1';
const checked=new Set(),pending=new Map(),filling=new Set();
// Map videos can be large: cache only complete files up to this size, and keep
// only the newest few, so the cache can't grow without bound on a player's disk.
const MAX_VIDEO_BYTES=64*1024*1024,MAX_VIDEOS=6;
const isVideo=url=>/\.(mp4|webm)$/i.test(url.pathname);
async function trimVideos(cache){
 const videos=(await cache.keys()).filter(r=>isVideo(new URL(r.url)));
 for(const old of videos.slice(0,Math.max(0,videos.length-MAX_VIDEOS)))await cache.delete(old);
}
/** Full byte size when `response` carries the WHOLE file (200, or a 206 for bytes 0-end), else 0. */
function completeSize(response){
 if(response.status===200)return Number(response.headers.get('content-length'))||0;
 const m=/^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
 return m&&Number(m[1])===Number(m[2])-1?Number(m[2]):0;
}
function eligible(url){
 return url.origin===self.location.origin &&
  (/^\/(miniatures|art|fonts|assets)\//.test(url.pathname)||/^\/uploads\//.test(url.pathname)) &&
  /\.(glb|gltf|bin|ktx2?|png|jpe?g|webp|avif|gif|svg|woff2?|ttf|ogg|wav|mp3|mp4|webm|json|js|css)$/i.test(url.pathname) &&
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
 if(request.method!=='GET'||!eligible(url))return;
 if(/\.(mp4|webm)$/i.test(url.pathname)){
  const full=new Request(request.url,{credentials:request.credentials});
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE),cached=await cache.match(full);
   if(!cached){
    // Stream the network response straight to the player (progressive
    // playback, one download). When it carries the whole file, a tee keeps a
    // copy for the cache as the same bytes arrive — never a second download,
    // never a partial 206 stored as though it were the entire movie.
    const response=await fetch(request),size=completeSize(response);
    if(!response.body||!response.ok||!size||size>MAX_VIDEO_BYTES||filling.has(full.url)||
       !/^video\//.test(response.headers.get('content-type')||''))return response;
    filling.add(full.url);
    const [play,keep]=response.body.tee();
    const headers=new Headers(response.headers);headers.delete('content-range');headers.set('content-length',String(size));
    event.waitUntil(cache.put(full,new Response(keep,{status:200,headers}))
     .then(()=>trimVideos(cache)).catch(()=>{/* quota/aborted: playback already has its stream */})
     .finally(()=>filling.delete(full.url)));
    return new Response(play,{status:response.status,statusText:response.statusText,headers:response.headers});
   }
   const range=request.headers.get('range');if(!range)return cached;
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!match||(!match[1]&&!match[2]))return fetch(request);
   const blob=await cached.blob(),size=blob.size;
   const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
   const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
   if(start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
   const headers=new Headers(cached.headers);headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
   return new Response(blob.slice(start,end+1),{status:206,headers});
  })().catch(()=>fetch(request)));
  return;
 }
 if(request.headers.has('range'))return;
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
