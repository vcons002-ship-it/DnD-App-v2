# Courtyard vision, synchronized Legacy movement and direct AV1 — 2026-10-28

This follow-up supersedes the 15 fps/start-midpoint-end presentation described in `legacy-walking-2026-10-28.md`. Swept route exploration and server authority remain in place.

## Behavior

Optional Legacy animation now uses thirteen server-authorized poses over 400 ms, including both endpoints. The token pose, sight mask and illumination image share a 30 fps presentation clock. The client positions decoded image atlases with CSS; it does not recalculate walls, grayscale the map or repaint the mask per animation frame. React updates only when authorized token membership or appearance changes, and at completion. The completion timer rechecks its deadline rather than assuming a browser timeout cannot fire early.

The server composes real map artwork and grades unlit terrain gray. Full-color lantern illumination, gray current darkvision, dim gray remembered ground and black unexplored ground have distinct appearances. Both atlas and endpoint images use that grade. Returning from an atlas resets its image offset to zero. A librsvg clipping issue was also fixed: clip-path polygons are direct children of the transformed clipPath, so carried lights do not disappear from server-generated images.

All intermediate creature data still comes through the existing visibility boundary. The test checks both guards become visible during the trip and are absent again at the end. Authorized terrain seen along the accepted walking route remains remembered. Unsupported/coalesced walks, teleports, policy changes and reduced motion retain the authoritative snap fallback. Animation remains optional and off by default.

The new atlases trade preparation time and texture memory for a cheap playback loop. Each cell is bounded to 1024 pixels on its longest side, and an atlas is limited to 17 million pixels. Two maximum-size RGBA atlases can occupy about 130 MiB decoded, before other browser resources. These recordings are an unthrottled correctness/recording run on this PC, not evidence of that memory or 30 fps performance on an old integrated GPU. The lowest-cost snap option is still available.

## 3D stutter investigation

The first AV1 comparison exposed real 3D stalls: approximately 8.5 seconds when switching from daylight to darkness and 6.3 seconds when extinguishing the lantern. A V8 CPU profile and instrumented WebGL calls located the waits in first-use shader linking/uniform setup for Druk's materials. These were application/driver waits, not video compression artifacts.

Two changes address that behavior:

- Fully opaque models no longer enter the transparent shader variant for a nonexistent initial opacity fade. Real invisibility/hidden fades still use transparency.
- Model preparation asynchronously compiles the directional-shadow variants before revealing the loaded body. Temporary lighting/receiver flags are restored synchronously before waiting for compilation, preserving the existing scene while it prepares. Shadow changes between daylight and dungeon lighting reuse those programs.

The final run removed the multi-second freezes. A smaller lighting-transition hitch remains; the figures below include it rather than cutting or warming it out of the recording.

## Recording and evidence

Run the opt-in `e2e/darkness-av1.spec.ts` with `DARKNESS_AV1_OUTPUT=artifacts/darkness-av1-20261028`, `PW_CHROMIUM` pointing to Chrome, and a disposable E2E server port. It creates a disposable campaign and uploads `assets/maps/experiments/courtyard-relief-20261002/original.png` (1216 × 832). A separate player drags Druk east past two guards and returns; the DM observes Player view. The scene includes walls, a carried lantern and remembered exploration. The 3D observer uses a tilted board, Low quality and real RTX 5090 WebGL.

Chrome CDP JPEG frames feed directly into FFmpeg's NVIDIA AV1 encoder at 1600 × 1000, 60 fps. There is no Playwright VP8 intermediate, slow motion or synthesized motion interpolation. Unchanged frames are held/duplicated to preserve wall-clock timing. The 60 fps container does not imply a 60 fps Legacy renderer. Capture itself adds overhead; this is not an isolated renderer benchmark or physical monitor recording.

Final artifacts are in `artifacts/darkness-av1-20261028/`; `watch-videos.html` has both players and buttons for daylight, lantern/darkvision, remembered map and lantern off. `verified-summary.json` contains the codec probe and the following measured values.

Playback follow-up: the user reported that the original local page did not load its videos. The viewer now uses H.264 compatibility copies transcoded from the unchanged AV1 recordings, preserving their 60 fps frame count and timing. `serve-videos.mjs` serves only the viewer/media allowlist on `http://127.0.0.1:4139/`, with MIME types and HTTP byte ranges for seeking. Both clips were verified playing decoded frames and seeking past ten seconds in Chrome over that HTTP URL with no media errors; evidence is in `viewer-playback-verified.json`. This verifies Chrome locally, not every browser/embedded preview.

Mobile delivery follow-up: the user is on a phone, so localhost and Windows file links cannot provide access. The recordings are now available at `https://dnd.nic024i.app/previews/vision-recordings-20261028-9d98e8851a84/index.html`. This adds only a dedicated static preview folder under `client/public/previews/` and `client/dist/previews/`; no service restart or campaign changes were made. All seven public assets returned HTTP 200 with matching SHA-256 hashes, and both compatibility videos returned correct HTTP 206 byte ranges. A 412-pixel-wide mobile-emulated browser played decoded frames and sought past ten seconds in both videos with no media errors or horizontal overflow. Evidence: `mobile-public-playback-verified.json`. Physical iOS Safari was not available for this check. Original AV1 downloads are linked on the public page.

| Measurement | Legacy | 3D Low |
| --- | ---: | ---: |
| Video codec / frame rate | AV1 / 60 fps | AV1 / 60 fps |
| Duration | 30.83 s | 21.82 s |
| Maximum application RAF callback gap, whole recording | 32.5 ms | 278.7 ms |
| Maximum application RAF callback gap when token position changed | 23.5 ms | 30.3 ms |
| Move request to first visible position change, median | 920.5 ms | 163.8 ms |
| Move request to first visible position change, range | 805.1–1232 ms | 126.7–252 ms |

The request-to-change interval includes the automated player drag, network, server preparation and client decoding; it is **not server CPU time**. It exposes an outstanding Legacy preparation delay despite the synchronized playback. Separate token drops are separate moves, with an intentional 250 ms pause after each completed move. Whole-recording source screenshot gaps also include static holds and must not be interpreted as renderer frame times.

Legacy alignment: 799 samples during animation, maximum token-versus-mask pose error `1.3642420526593924e-12` map pixels (floating-point noise). This checks presentation coordinates, not pixel-perfect display scanout.

## Validation boundaries

- Full server unit suite passed: 236 files, 2366 tests, before the final 3D preparation helper; the new helper and existing GPU upload tests subsequently passed (5 tests), including restoration of scene state while asynchronous compilation is pending and after submission failure.
- Production build passed after the final 3D changes. Both final AV1 browser tests passed, with successful AV1/60 fps codec probes, no page errors, guard visibility checks, Legacy completion/reset checks and movement alignment checks.
- Nine additional browser tests passed during this change: Legacy player/DM movement, player controls with assistance on/off, retained pixels, rendering policy/private assets, standard 2D/3D retention and resync.
- Actual decoded AV1 frames were visually inspected, including textured terrain and the current/remembered sight distinction.
- Test campaigns, uploads and databases are disposable. The installed DnDServer service and live campaigns were not restarted or modified. Local build/test success does not mean the running service has loaded these changes.
