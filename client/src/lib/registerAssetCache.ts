/// <reference types="vite/client" />
/** Browser disk storage survives map changes and revisits on the same origin. */
export function registerAssetCache(){
 if(!import.meta.env.PROD||!('serviceWorker' in navigator)||!window.isSecureContext)return;
 void navigator.serviceWorker.register('/asset-cache-sw.js',{updateViaCache:'none'}).then(()=>{
  // Best effort: browsers decide whether to protect this cache from eviction.
  void navigator.storage?.persist?.().catch(()=>false);
 }).catch(()=>{/* Normal HTTP caching remains available. */});
}
