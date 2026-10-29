# Walking through darkness and optional Legacy animation — 2026-10-28

Historical results below describe the initial implementation. The [AV1 courtyard follow-up](legacy-vision-av1-2026-10-28.md) supersedes its 15 fps/start-midpoint-end presentation with synchronized 30 fps token and visibility atlases, real map grading and updated recordings.

Accepted walks now accumulate terrain seen along the route on the server. Legacy also has a saved, browser-specific **Animate movement** checkbox, off by default. It requires effective server managed rendering. The initial token presentation was capped at 15 frames per second; visibility used prepared start/midpoint/endpoint images over a 400 ms animation.

## Route exploration

Previously, an accepted 200 ft move remembered its endpoints but could miss terrain in between. The reproduction is in `artifacts/legacy-path-memory-audit-20261028.json`.

The server now samples the accepted straight segment at half-grid spacing, with a maximum of 128 intervals / 129 samples. Each sample recomputes party sight and carried-light positions. Wall polygons and fixed-light shapes are reused within that sweep. A worker performs the sight calculations and path union; the server merges the completed result with current saved terrain. Finite samples approximate a continuous sweep; unusually narrow glimpses and pathological long drags can fall between samples.

Only valid walks learn intermediate terrain. Explicit relocations, changed teleport markers, hidden vision sources and DM moves through walls do not. DM-only preparation remains read-only; a connected player is required for persistent route exploration. Map identity and an exploration-reset generation guard prevent an old worker result from restoring a cleared or replaced map's history. Painted map cover still clips route memory.

The midpoint creature list is built through the existing server visibility boundary, including personal sight, manual fog, invisibility and monster-stat redaction. A creature absent at both endpoints can be included if visible at the midpoint. The payload carries membership and only display overrides/new figures, preserving unchanged endpoint token objects. Visibility at only other portions of a very long move is not guaranteed a display frame; route terrain sampling is finer than the visual playback.

All required images are decoded before playback begins. Interrupted/coalesced moves, resets, changed maps or visibility settings, reduced motion and disabled assistance fall back to authoritative snap presentation. Existing 3D token animation is retained; route terrain accumulation applies to all modes. Authority, collisions and game rules remain server controlled.

## Requested videos

The recording fixture uses a separate disposable campaign. A player walks Druk 240 ft east in six 40 ft drops, then returns, while two DM browsers watch **Player view** on the same map. One uses Legacy with optional animation; the other uses real hardware WebGL, Low quality and a tilted board. Both use server assistance, heavy darkness, 60 ft personal sight, remembered terrain and the same carried lantern. Two stationary goblins begin beyond sight range, appear on approach and disappear after being passed; both are hidden again at the far end and on return to the start. These recordings are visual demonstrations without CPU throttling.

Output folder: `artifacts/darkness-comparison-20261028/`. `results.json` retains visibility/position samples, renderer identification and the fixture. The named MP4s trim setup screens and crop the empty upper area at normal playback speed; raw WebM files retain the complete UI and setup. Each MP4 is about 31 seconds. The 3D renderer is the RTX 5090, not a flat-token fallback. Legacy intentionally omits the detailed 3D illumination and uses its simpler mask. The recordings also show the existing 3D behavior: an endpoint-filtered creature can disappear at the start of the outgoing animation, while Legacy's prepared midpoint membership can retain it partway through. This work does not add intermediate creature snapshots to the standard 3D animation.

## Severe CPU simulation

The paired runs use the existing heavy room: **143 tokens, 48 lights, 28 wall pieces / 112 edges**, 3840 × 2560 background. Two player contexts are throttled **20× before initial load and throughout movement**. GPU and accelerated Canvas2D are disabled and WebGL blocked. Six alternating real mouse drags, three per player, run against an unrestricted Node server on this PC. There is no WAN latency or RAM cap. The RTX 5090 does not perform Sharp's worker image preparation.

No video, sampling profiler, tracing or phase timing hook ran during these measurements. Event-driven token-draw and mask-mutation probes allow two animation frames for display; they do not measure physical monitor presentation. Snap ran first, optional animation second, without randomized repetitions. A moving player's direct drag and a remote observer's playback are different presentation paths. A severely busy client can skip intermediate animation stages; these timings do not establish a sustained 15 fps rate.

| Measure | Snap | Optional animation |
|---|---:|---:|
| Mean release → first changed visibility | 2,324 ms | 2,079 ms |
| Median release → first changed visibility | 2,059 ms | 2,028 ms |
| Range | 1,819–3,647 ms | 1,845–2,390 ms |
| Mean initial join → usable | 22.53 s | 20.61 s |
| Both browser main threads, accumulated busy time | 33.697 s | 32.340 s |
| Both browser script execution | 14.264 s | 13.376 s |
| Observation window including gestures | 32.392 s | 29.096 s |
| Server CPU, entire six-move window | 5.609 CPU-s | 7.953 CPU-s |
| Rendering HTTP bytes, both clients | 1,917,194 | 2,603,681 |
| Rendering HTTP requests | 208 | 266 |
| WebSocket bytes, both clients | 578,371 | 725,128 |

This short run did not demonstrate a client response-time penalty, but it does not prove animation is faster. The medians are close and the first snap sample was slower. Preparation increased server CPU by about **42%**, rendering HTTP bytes by **36%**, and WebSocket bytes by **25%** in this fixture. CPU totals include all server threads over the whole observation window; they are not per-movement elapsed latency. Because of that real preparation cost and the limited sampling, animation remains optional and defaults off.

Raw measurements: `artifacts/legacy-walking-snap-20261028/results.json` and `artifacts/legacy-walking-animated-20261028/results.json`. The recorded `finalSightMs` is the latest mask mutation observed before the moving-client probe ends, not a guarantee that every remote client's last animation frame has painted.

## Validation and deployment boundary

- Full unit suite: **2,363 tests in 235 files passed** before the display-payload deduplication; the affected walking/delivery tests were then rerun successfully after that optimization.
- Typechecks and production client/server build passed. Ten distinct browser tests passed across the final runs: player and DM party-view animation, a midpoint-only creature, returning to snap, retained pixel parity, policy changes, personal image authorization, resync, ordinary player controls, the requested recording and standard 2D/3D retention. The opt-in GPU preference benchmark was skipped. Two outdated checkbox selectors and recording coordinate tolerance were repaired before the final rerun.
- Test servers use temporary databases and uploads. The installed DnDServer service and live campaigns were not restarted or modified. These are local source/build results, not a claim that the running service has loaded the changes.
