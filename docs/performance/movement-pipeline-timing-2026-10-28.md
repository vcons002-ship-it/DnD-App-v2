# Movement pipeline timing — 2026-10-28

Follow-up: [State-to-map implementation and four-way test](state-to-map-update-2026-10-28.md) measures the changes with CPU throttling and server assistance independently on/off.

The server's earlier 4.65-second CPU figure was accumulated work for six drags and both viewers, not per-movement latency. This follow-up correlates each final movement command with its prepared server frames, browser receipt, image readiness, map commit and a display-frame probe.

**The largest measured delay is in the moving player's browser after its images are ready.** Across two instrumented 20× CPU-throttled trials, the server prepared that player's frame in a mean **325.5 ms**. Release to the display probe averaged **2,720.3 ms**. The interval from ready images through map commit and the display probe accounted for **1,826.1 ms, or 67.1%** of the total.

## Method and scope

The same heavy fixture as the retained-rendering comparison: 143 total tokens, 48 lights, 28 wall pieces / 112 edges, 240 × 160 ft room and 3840 × 2560 map. Two independent player contexts, both throttled to 20× CPU slowdown before campaign load, GPU and accelerated Canvas2D disabled, WebGL blocked. Both use Legacy mode, retained rendering and server assistance. The unrestricted Node server runs on the same Ryzen 7 7800X3D host. No WAN delay or RAM cap. No video recording, CPU sampling profiler or Playwright trace ran during these measurements.

Two measured runs, each with six alternating real mouse drags: **12 mover latency samples**, with corresponding server/client markers for **24 viewer frames**. There was also one unthrottled marker-validation run, described separately below. All campaigns and servers use disposable test data; the live service was not restarted.

Each move receives a benchmark ID at the outgoing Socket.IO command. Server receipt begins at command dispatch, before validation/mutation. An async context carries that ID into per-viewer delivery, and pending/coalesced states retain the ID of the state actually rendered. The emitted frame contains timing metadata only when isolated-server diagnostics are enabled and a valid diagnostic ID was supplied.

The browser records entry to its state-frame handler, delta application, image preparation, state publication and the Legacy mask's React layout-effect commit. Image Resource Timing entries distinguish response completion from eventual image readiness. The existing movement probe observes the changed mask key and allows two animation-frame callbacks for display opportunities. Token artwork timing also includes the art group's offset, avoiding the drag wrapper's pointer-following position.

Server and browser epoch timestamps come from the same host clock. CDP WebSocket events are converted to epoch time using that connection's monotonic/wall-clock request timestamps. Sub-millisecond outbound figures are near clock uncertainty and should be read as negligible, not exact network latency. The analysis rejects missing/crossed stages or clock disagreements beyond 2 ms, and checks that exclusive phase durations sum to the full measured interval.

These are elapsed-time measurements, including waits and scheduling. They are not per-stage CPU measurements. The instrumented runs have additional timestamp/metadata overhead and are not a new controlled before/after optimization comparison.

## Moving player's critical path

Means across all 12 movements are additive. Medians of individual stages do not add to the median total, so the table uses means.

| Exclusive phase | Mean per movement |
|---|---:|
| Pointer release → outgoing movement command | 61.0 ms |
| Outgoing command → server handler | 0.9 ms |
| Server handler → prepared frame emission | **325.5 ms** |
| Server emission → browser protocol frame event | 124.2 ms |
| Protocol event → app state handler | 11.2 ms |
| Delta application and image-preparation setup | 7.0 ms |
| Image fetch/decode/readiness window | **364.4 ms** |
| Ready images → map React commit | **1,365.2 ms** |
| Map commit → display-frame probe | **460.9 ms** |
| **Total** | **2,720.3 ms** |

The pooled median total was **2,725.4 ms**. Run means were 2,812.4 and 2,628.2 ms. The server stage represents approximately **12.0%** of the full measured path.

The emission-to-protocol-event interval includes Socket.IO framing/serialization, delivery and browser protocol dispatch. It is not an isolated wire/network latency measurement. In particular, a throttled renderer can delay protocol event handling. These loopback results cannot establish real Internet latency.

The ready-images-to-commit interval includes React reconciliation, related UI updates, layout effects, token cache preparation and other work on the browser thread. It does not isolate individual components. Long Task entries show one continuous task of **1.04–1.98 seconds** during each mover's update, supporting a substantial main-thread bottleneck rather than only idle waiting. The commit-to-display interval includes queued Konva drawing, browser work and the two-frame probe. The probe records paint opportunities, not physical monitor presentation.

## Server preparation breakdown

These rows partition the 325.5 ms mover-frame server interval. Work for the second viewer proceeds separately and can overlap it.

| Server phase | Mean |
|---|---:|
| Validation, movement and role-shaped snapshot preparation | 93.9 ms |
| Delivery cadence / scheduling wait | <0.1 ms |
| Geometry worker round trip | 12.3 ms |
| Token-sprite preparation | 22.8 ms |
| Visibility-mask generation and tile preparation | **193.3 ms** |
| Remaining setup, diff/serialization and scheduling | 3.2 ms |

Within the first row, command receipt to applied position averaged **12.5 ms**, followed by approximately **81.3 ms** through role-shaped snapshot preparation. Snapshot work includes per-viewer visibility filtering; the geometry-worker row does not represent every visibility-related operation in the server.

Within the mask worker, mean elapsed phases were:

- Full SVG mask rasterization: **161.8 ms**.
- Tile copying and pixel hashing: **8.1 ms**.
- PNG encoding for cache misses: **22.9 ms**.

The mask contained 12 tiles. A mean 11.5 needed encoding in the mover's worker job; in this fixture, changing personal sight affects pixels across much of the room. Stable tiling does not guarantee most tiles remain unchanged for every movement. Worker queue time was negligible in these runs. These worker figures are elapsed durations, including native Sharp work and scheduling, not isolated CPU totals.

Whole-process server CPU accumulated **4,609 ms** and **4,547 ms** during movement observation windows of **25,665 ms** and **24,138 ms**. That is a mean **4.58 CPU-seconds per six-move experiment**, covering both viewers, previews, HTTP image serving and other server work. It is consistent with the earlier 4.65-second figure. It is distinct from the mover frame's 326 ms mean wall-clock preparation interval.

## Image readiness and the observing player

The moving client requested a mean **21.2 missing images** per final movement frame, including masks and changed/new token art. A mean **116.5 of 137.7 referenced image keys** were already decoded locally.

Of the mean 364.4 ms image-readiness interval:

- The interval from preparation start through the last image response completing was **83.9 ms**. This includes request initiation, queueing and transfer; it is not pure bandwidth time.
- From the last response completing through all images becoming ready was **280.6 ms**. This includes decoding and scheduling of readiness callbacks on the throttled browser. It is not a measurement of 281 ms spent solely inside a native PNG decoder.

Both player contexts receive each movement, but only one is actively dragging:

| Mean interval over 12 frames per viewer role | Moving player | Observing player |
|---|---:|---:|
| Server command receipt → frame emission | 325.5 ms | 326.5 ms |
| Image-readiness window | 364.4 ms | 204.6 ms |
| Ready images → map commit | **1,365.2 ms** | **371.1 ms** |

The active client has substantially more work or scheduling delay between ready assets and map commit, despite nearly identical server preparation time. This points toward the active movement / selection / UI update path as a useful next profiling target. It does not prove which React component or cache operation is responsible. The observer has commit markers but no separately armed final-display probe, so this table does not claim its complete on-screen latency.

## Unthrottled validation and the 500 ms Legacy cadence

The one unthrottled validation run averaged **523.0 ms** release-to-display-probe. Its mover-frame server interval averaged 459.2 ms, including **215.5 ms of intentional delivery wait**. Legacy delivery permits a new frame every 500 ms. Faster gestures can arrive before that cadence permits another frame.

In the 20× trials, gestures and updates were far enough apart that this wait was negligible. Thus the refresh cap is a separate latency floor on faster clients, and did not explain the 2.7-second throttled result. Removing that wait would not address the largest measured throttled-client stages.

## Interpretation and next target

Retaining unchanged canvas pixels reduced painting in the earlier comparison, but did not remove broad UI/state processing before those pixels are presented. The measured priority is to profile and reduce active-client state-to-commit work, token cache/layout work and the subsequent canvas/browser frame. The image-readiness path is the next sizeable client interval. Incremental mask rasterization remains a server opportunity, but the full server stage is approximately one eighth of the current end-to-end delay.

No gameplay behavior or delivery cadence was changed by this measurement work. Diagnostics are off on normal startup. Verification passed: **25 focused unit tests**, **11 browser regressions**, root typechecking, the Vite production build and all three instrumented benchmark runs.

## Evidence and reproduction

- [Combined 20× phase summary and individual samples](../../artifacts/movement-timing-20x-20261028/phase-summary-combined-20x.json)
- [20× raw run 1](../../artifacts/movement-timing-20x-20261028/results.json)
- [20× raw run 2](../../artifacts/movement-timing-20x-repeat-20261028/results.json)
- [Unthrottled validation](../../artifacts/movement-timing-smoke-20261028/results.json)
- [Analysis script](../../tools/summarize-movement-timing.mjs)
- [Earlier retained-rendering comparison](legacy-retained-rendering-2026-10-28.md)

Enable the existing isolated performance server with `E2E_PERFORMANCE_METRICS=1`, then run the opt-in `e2e/server-offload.spec.ts` benchmark with `SERVER_OFFLOAD_TIMING=1`, `SERVER_OFFLOAD_RATES=20`, `SERVER_OFFLOAD_NO_VIDEO=1` and a new `SERVER_OFFLOAD_OUTPUT` directory. Use the existing browser/runtime settings documented in that benchmark's preceding report. Analyze one or more same-rate raw reports with:

```powershell
node tools/summarize-movement-timing.mjs artifacts/movement-timing-20x-20261028/results.json artifacts/movement-timing-20x-repeat-20261028/results.json
```
