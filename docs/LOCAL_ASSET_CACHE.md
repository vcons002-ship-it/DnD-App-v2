# Local visual-asset cache

Production clients on HTTPS (or localhost) register asset-cache-sw.js. Downloaded
same-origin miniature models, model companions, art/textures, fonts, audio and
built effect/renderer bundles are stored in browser Cache Storage. Cache keys
include the complete URL, so the same asset is reused across maps and sessions.
Procedural mist, lighting and weather are code in the cached application bundles;
there is no separate effect download for every map.

Content-hashed /assets files are cache-first. Stable art/model URLs are served
immediately from disk, with a conditional ETag/Last-Modified background check
once per service-worker lifetime. Unchanged files return 304 with no file body.
Changed files replace the stored copy for subsequent loads. Concurrent downloads
of the same URL are coalesced. HTML, API responses, sockets, save state and range
requests are not cached by this worker. Bad/missing asset HTML fallbacks are not
stored. This does not make the multiplayer app offline-capable.

Storage persistence is requested best-effort. Browser quotas, private browsing,
clearing site data, a different browser/device/origin, or browser eviction can
require a fresh download. Unencrypted remote LAN HTTP cannot install a service
worker and continues to rely on normal HTTP caching. Cache storage failures do
not prevent the current network asset from loading.

Browser verification loads a real goblin GLB and dice-tray texture, reloads the
page, disables networking and reads identical cached byte counts. It also verifies
that a stale entry is replaced in the background and API responses remain absent.
