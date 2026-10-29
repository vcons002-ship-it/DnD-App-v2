# Server work for Legacy clients

**Profiling follow-up:** the older timings below include Playwright DOM snapshot recording overhead. Clean profiling and drawing-isolation tests identify token canvas drawing as a major remaining cost; a raster-mask proof of concept is also measured. See [CPU diagnosis and mask feasibility](legacy-cpu-diagnosis-2026-10-28.md). Historical receipts are retained.

Implemented and tested on 2026-10-28. This changes the server/client protocol and the Legacy rendering path. It does not introduce server GPU rendering or stream the battlefield as video.

## Implementation

- A two-worker Node pool calculates Legacy sight, near/darkvision, static light polygons, exploration SVG paths and token affinity visibility. Workers receive only the already authorized viewer's inputs. Cached static outlines reuse wall/light geometry; wall/door changes invalidate matching geometry. The pool has a bounded 64-job waiting queue, bounded map/outline caches, a 10-second job deadline and worker replacement on failure.
- Accepted positions and their ready-to-draw geometry travel together in a revisioned frame. Legacy sends at most two frames per second after its initial frame, retaining the newest pending snapshot and discarding stale worker results. The browser no longer repeats accepted-position wall/light tests or affinity calculations on that path. The initial pending mask fails closed; a worker failure retains the last delivered view and shows a reconnect notice.
- Negotiated state deltas update only changed fields/entities. Static light and exploration path arrays are retained when unchanged. Hidden/deleted tokens are explicit removals. The client preserves unchanged objects, checks the preceding revision and requests a full resynchronization on a gap. A full frame is sent when it is smaller than a delta or required for initialization/resync. Old clients retain full snapshots; a new client connected to an older server retains its local Legacy compatibility path.
- Legacy movement previews send the latest pointer destination at most five times per second. Server workers calculate wall-limited preview position, terrain cost, distance and visibility. Only the requesting authorized connection receives the result. The local preview keeps its last validated result while another is pending. Responses from an ended drag or obsolete state are ignored. Final movement remains the existing authoritative operation, including placement and rule effects.
- The DM's combined Player view gets its own geometry; it does not replace individual player sight. Standard/3D clients keep their rendering and effects, while receiving negotiated state deltas. Switching rendering modes resets the delivery baseline.

Movement legality, game outcomes, exploration unions/remembered figures and asset preparation were already server operations. This change adds worker-derived Legacy presentation geometry and advisory movement previews; it does not move database/rule transactions into background workers. Existing server/import preparation of image/model assets is retained; no new model downloads are required by Legacy.

## Benchmark method

`e2e/server-offload.spec.ts` creates a disposable campaign with a 240 x 160 ft room, 143 tokens, 48 lights and 28 wall pieces / 112 edges. Two separate browser contexts claim Varis and Druk. Both CPUs are throttled before campaign load and remain throttled during six alternating actual mouse drags (three per player). Both pages remain visible. GPU and accelerated Canvas2D are disabled, WebGL is blocked, and no 3D models load.

The unthrottled Node server runs on the same Ryzen 7 7800X3D / 31 GiB host as Chrome. The installed RTX 5090 is not used by these CPU geometry workers. There is no artificial server CPU cap, network delay or browser RAM cap. This tests two independently throttled browser renderers against a separate unrestricted server process; it does not reproduce every characteristic of a physical old CPU, integrated GPU or remote network.

The event-driven probe observes committed token layer draws and changed SVG sight paths, then allows two RAF paint opportunities. There is no continuous probe RAF/polling scan. Pointer-up to that observation is the reported latency. Initial load is navigation through startup choice/join/claim to usable HUD, one sight origin and a draggable claimed token; it includes automation and server communication. Recording adds overhead.

Received event bytes are measured from Socket.IO event frames through CDP; they include state and cursor events, but exclude movement-preview acknowledgements and protocol overhead. Server CPU totals use process.cpuUsage and include worker threads. Worker/delivery counters in raw diagnostics are cumulative since server startup; event-loop maxima also include fixture setup and must not be presented as movement-only stalls.

## Reproduction

Build the client first. All test servers use temporary DB/data paths; do not point the benchmark at a live campaign.

```powershell
$env:E2E_PORT='4118'
$env:E2E_SOFTWARE_GL='0'
$env:E2E_PERFORMANCE_METRICS='1'
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\vcons\DnD-App-v2\artifacts\playwright-runtime'
$env:SERVER_OFFLOAD_OUTPUT='C:\Users\vcons\DnD-App-v2\artifacts\server-offload-recheck'
$env:SERVER_OFFLOAD_RATES='12,20'
$env:SERVER_OFFLOAD_EXPECT_SERVER='1'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/server-offload.spec.ts
```

For a control using the identical final client bundle, set `SERVER_OFFLOAD_COMPAT=1` and use a different output directory. The harness omits only the join's transport/rendering capabilities, exercising full snapshots and the client geometry compatibility path. It does not change game data, authority or CPU throttling. Reset that variable to `0` for the server path. Each run asserts which geometry path was used.

The diagnostic endpoint exists only when E2E_PERFORMANCE_METRICS=1 and also requires the DM passphrase. Normal startup does not expose it.

## Measured results

Raw data for all runs: [JSON receipt](server-offload-2026-10-28.json). There were 36 actual player drags across the original before/after runs (12x and 20x) and the final same-build control/server runs (20x). Each condition has six moves, three per player. These are small samples, not a statistically established device-wide speedup.

The final comparison uses the same final client bundle, room, throttle and movement route. The control intentionally omits the new capability negotiation, so it exercises local geometry/full snapshots; the server condition asserts server geometry on both clients.

| Same-build 20x comparison | Local/full snapshot control | Server geometry/deltas |
|---|---:|---:|
| Player 1 initial load to usable | 33,771 ms | 29,482 ms |
| Player 2 initial load to usable | 32,732 ms | 30,362 ms |
| Player 1 median movement-to-sight update | 4,452 ms | 4,570 ms |
| Player 2 median movement-to-sight update | 3,312 ms | 2,967 ms |
| All six moves, median movement-to-sight update | 3,485 ms | 3,493 ms |
| Combined main-thread task time, both players | 58,621 ms | 58,295 ms |
| Movement observation window | 53,181 ms | 53,960 ms |
| Received event bytes, both players | 1,343,480 | 563,582 (-58.1%) |
| Server CPU during movement window, including workers | 1,124 ms | 1,125 ms |
| Server resident memory after movement | 302 MiB | 318 MiB |

**Conclusion:** network traffic is substantially lower. In this pair, initial loads were 2.4–4.3 seconds faster, but results across runs varied: the earlier 20x before/after pair had slower initial loads after offloading. Overall movement latency and client main-thread task time were effectively unchanged in the final controlled pair. One player's improvement was offset by the other player's regression. Do not claim that server offloading solved old-CPU responsiveness or produced a general CPU/FPS gain.

The unrestricted server handled the work comfortably for two clients. At the end of the final run its geometry/preview workers had completed 52 jobs across setup and movement, with 118.85 ms total measured compute time, a 28.27 ms slowest job and maximum waiting queue of one. Worker and delivery failure counts were zero. The approximately 1.125 seconds of aggregate server CPU across a 53.96-second movement window is about 2.1% of one CPU core averaged over that window; it is not total host utilization. This does not establish capacity for larger numbers of maps/viewers.

The measurements show that moving these geometry calculations does not remove the remaining client cost. Browser drawing, SVG composition, input and UI/state processing remain local. Identifying the dominant remaining function requires a dedicated browser CPU profile; it was not isolated by this experiment. A simpler/rasterized Legacy mask or further scene-update reductions are possible follow-ups, not implemented performance gains.

### Earlier before/after samples

| Condition | Median sight latency across six moves | Combined client task time | Received event bytes |
|---|---:|---:|---:|
| Before, both players 12x | 1,659 ms | 29,580 ms | 1,343,480 |
| First server build, both players 12x | 1,709.5 ms | 30,070 ms | 563,582 |
| Before, both players 20x | 3,660.5 ms | 55,188 ms | 1,346,844 |
| First server build, both players 20x | 3,194 ms | 52,847 ms | 570,128 |

The final build additionally retains the last validated preview during a continuous drag and rejects preview responses after an intervening snapshot. Original receipts and recordings are retained rather than overwritten with the later result.

## Recordings and verification

- `artifacts/server-offload-final-20261028/two-players-20x-full.mp4`: both players from initial loading through movement; unrestricted server, both clients 20x.
- `artifacts/server-offload-final-20261028/two-players-20x-movement.mp4`: movement excerpt from the same recording.
- `artifacts/server-offload-final-20261028/paired-preview.png`: side-by-side frame.
- Individual player recordings and screenshots remain in each benchmark output directory (`server-offload-before`, `after`, `control`, `final`, each suffixed `-20261028`).

Client production build and server/client TypeScript checks passed. Nine browser regressions passed, including server geometry in the DM's Player view, wall/light editing, startup choices, independent client quality, standard rotation, hidden-token delta removal, full resync and restored Legacy connection geometry. All six paired performance conditions passed their movement/visibility assertions; no WebGL attempts, model loads or page errors occurred in any measured client.

The complete unit suite passed: 2,328 tests in 229 files. This run used the isolated Vitest data root, an empty Gemini key and unreachable local AI endpoints. An earlier run inherited the development AI configuration and timed out in the existing fill/no-key test; rerunning with controlled AI settings passed without changing that test or the AI implementation.

These server changes were verified on disposable local test servers. The running DnDServer service was not restarted and live campaigns were not modified. A normal server restart is needed for the live process to load the new server protocol; the client remains compatible with the older running server meanwhile.
