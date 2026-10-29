# State-to-map changes and the four-way CPU/assistance test — 2026-10-28

The optimized Legacy path reduced the moving player's measured ready-state-to-map-commit interval from **1,365 ms to 348 ms** in the follow-up trace. The requested four-way comparison used the same final build, identical heavy room and two connected player contexts, with CPU throttling and server rendering assistance varied independently.

## Changes

- Token dragging changes the grid's existing canvas nodes directly. Drag start/end no longer changes a React state variable on the whole map. Empty nearby-door previews remain empty instead of creating temporary map state.
- The HUD is memoized around its character/resource inputs and stable action callbacks. It no longer receives the entire changing board snapshot. An open character window has its own current-state subscription.
- The player reference/ability panel skips position-only and prepared-image updates. A separate combat subscriber still receives current positions, visibility, targets and permissions. Target distances, removed targets, HP and character controls have dedicated browser regressions.
- Attack and healing controls share one eligibility calculation per relevant combat update, rather than repeating wall and visibility checks for both lists. Entity lookup maps replace repeated character/monster array searches. Computed death/HP results are not retained across calls; existing death-state regressions caught and prevented a stale-result cache during implementation.
- Prepared Legacy body/HUD images are drawn directly. They are no longer painted into another whole-token bitmap cache during the React commit. Shared-sight body grayscale is prepared once in a reusable server image, avoiding per-token filter canvases. Normal clients advertise rendering protocol 3; older protocol-1/2 clients keep their previous sprite path, avoiding double processing.
- Shared-sight brightness is preserved. Opaque body pixels match the preceding version's screenshot. Removing an intermediate canvas can change edge/glyph antialiasing. The default server-assist and graphics preferences are unchanged.

The larger proposal to apply all movement/visibility updates outside React is not implemented. React still handles board reconciliation, structural changes and UI. Target eligibility still has a local calculation, now shared/memoized within the combat update. This work narrows the expensive paths and removes duplicate bitmap work.

## Why these changes

A separate diagnostic profile ran before the changes, with source maps available during analysis. The largest app-attributable sampled paths were the outer token artwork cache, per-token body/filter cache, retained drawing, map token-prop preparation and combat target calculations. Both player profiles showed the two cache effects as larger costs than target-list checks. React-Konva reconciliation included these synchronous cache layout effects.

That profiled run is diagnostic only and is excluded from the clean comparison below. Its profiles and browser trace are retained in [the diagnostic folder](../../artifacts/state-map-profile-before-20261028/). Matching source maps were used for analysis and are not included in the final production distribution.

## Four-way test method

- **Legacy mode in every case**, GPU and accelerated Canvas2D disabled, WebGL blocked. The unthrottled cases are a CPU comparison, not a maximum-quality 3D/GPU benchmark.
- **143 tokens**, 48 lights, 28 wall pieces / 112 edges, a 240 × 160 ft room and a 3840 × 2560 background. The board is heavy; the seeded character panels have basic/default abilities rather than a full real campaign's spell inventory.
- Two independent player contexts, both at the listed rate from before campaign load. Six real alternating mouse drags per case, three per player. No simultaneous-drag stress test.
- Ryzen 7 7800X3D, 16 logical CPUs, 31 GiB RAM; Chrome 156.0.8078.49. The Node server is unrestricted on the same host. Sharp image preparation uses server CPU workers, not the RTX 5090.
- Four separate disposable servers/campaigns, same final application build. No video, sampling profiler, browser trace or phase-timing hook during these four runs. No simulated WAN delay or RAM cap. Run order: assist-on 20×, assist-on 1×, assist-off 20×, assist-off 1×.
- Each movement time starts at pointer release and ends at the matching visibility update's two-animation-frame display probe. It represents display opportunities, not physical monitor presentation. Initial load includes navigation, startup mode choice, join/claim and usable draggable tokens, averaged over the two contexts.
- Assistance off retains the authoritative game server, permission checks and filtered snapshots. It disables rendering/preview offload; it does not make the application serverless.

There are **six latency samples per case**. These are useful controlled simulations, not certification for a specific old CPU, integrated GPU, Safari installation or Internet connection. Run order was not randomized. Background OS activity and the 500 ms Legacy cadence can change short-run timings.

## Results

| CPU rate | Server assistance | Mean release → visibility | Median | Range | Mean load → usable |
|---|---|---:|---:|---:|---:|
| 20× slowdown | On | **1,506 ms** | 1,504 ms | 1,196–1,790 ms | **20.61 s** |
| Unthrottled / 1× | On | **453 ms** | 360 ms | 278–726 ms | **1.43 s** |
| 20× slowdown | Off | **1,800 ms** | 1,735 ms | 1,613–2,206 ms | **23.46 s** |
| Unthrottled / 1× | Off | **413 ms** | 512 ms | 163–563 ms | **1.02 s** |

For the severely throttled browsers, assistance reduced mean response time by **16.3%** and load-to-usable time by **12.2%** relative to assistance off in this fixture. At 1×, assistance had no demonstrated response-time advantage: its mean was 40 ms higher, while its median was lower. The wide, uneven samples reflect the refresh cadence and scheduling. Those fast-client samples do not support a universal winner.

The server's Legacy delivery cadence remains 500 ms. The local Legacy mask also uses a bounded refresh schedule. On fast browsers, refresh phase and rasterization can dominate the remaining elapsed delay. Neither cadence was changed to improve the benchmark.

### Work accumulated during each complete six-move observation window

Browser values sum both player contexts; server CPU covers the entire Node process and its workers. These totals cover different elapsed gesture windows, not fixed-duration utilization. The sequence ends on the moving client's final display probe; an observer's final update can complete outside that window on fast cases. These figures are not per-movement CPU measurements or capacity estimates.

| CPU / assist | Browser main-thread busy | Browser script execution | Elapsed gesture window | Total server CPU |
|---|---:|---:|---:|---:|
| 20× / on | 18.292 s | 9.608 s | 16.414 s | 4.797 CPU-s |
| 1× / on | 0.500 s | 0.248 s | 3.633 s | 3.328 CPU-s |
| 20× / off | 21.124 s | 14.375 s | 18.862 s | 1.031 CPU-s |
| 1× / off | 0.589 s | 0.368 s | 3.308 s | 0.703 CPU-s |

In the 20× case, assistance reduced accumulated browser main-thread work by **13.4%** and script execution by **33.2%**, at the expected additional server CPU/image traffic cost. Rendering HTTP traffic was 1,756,761 bytes / 193 requests with assist on at 20×, and zero private rendering-image requests with it off. State/game traffic is separate.

The assisted cases recorded zero cached whole-token artwork groups and zero per-token filtered bodies in their final cache counters. Unassisted rendering retained its local shared-darkvision body filters. All four runs recorded zero page errors, zero WebGL attempts and zero model/3D-renderer requests.

## Follow-up phase trace

A separate instrumented run used the final code with assistance on and both CPUs at 20×. It is excluded from the clean matrix. The preceding baseline is the earlier two instrumented runs / 12 moves, while the follow-up is six moves; this is not a newly randomized before/after trial.

| Mean interval | Previous measured path | Final follow-up |
|---|---:|---:|
| Ready images → map commit | **1,365.2 ms** | **348.3 ms** |
| Map commit → display probe | 460.9 ms | 321.4 ms |
| Image readiness | 364.4 ms | 313.2 ms |
| Server command receipt → prepared frame emission | 325.5 ms | 317.3 ms |
| Full release → display probe | **2,720.3 ms** | **1,431.1 ms** |

The targeted state-to-map interval fell **74.5%**. The full instrumented response fell **47.4%**. The server preparation interval was broadly unchanged, supporting a client-side explanation for most of the improvement.

Compared with the earlier clean retained-rendering runs, mean combined main-thread work went from 26.55 s to 18.29 s and mean load-to-usable from 28.25 s to 20.61 s. Those earlier results were collected in separate runs; use them as supporting context rather than an additional randomized A/B comparison.

The result still leaves noticeable delay under 20× throttling. Remaining large intervals include image decoding/readiness scheduling, the approximately 348 ms state-to-map work, subsequent canvas/browser work and approximately 317 ms of server preparation. The final implementation does not make the entire board update a single static-image operation.

## Evidence

Final validation passed: **2,349 unit tests across 233 files**, **16 selected browser regressions**, root typechecking and the production client build. The build's model validation also passed; the final distribution contains no diagnostic source maps. All four clean matrix cases and the final instrumented timing case passed. Browser regressions include live target-distance updates, target deletion, HP updates and character-window controls with assistance both on and off, plus retained/full-canvas pixel comparisons, DM wall/light editing, policy controls, rejoin/resync, rotation and saved damage-prompt dismissal.

- [Four-way summary](../../artifacts/state-map-final-matrix-20261028.json)
- [20× assistance on](../../artifacts/state-map-final-on-20x-20261028/results.json)
- [1× assistance on](../../artifacts/state-map-final-on-1x-20261028/results.json)
- [20× assistance off](../../artifacts/state-map-final-off-20x-20261028/results.json)
- [1× assistance off](../../artifacts/state-map-final-off-1x-20261028/results.json)
- [Final phase summary](../../artifacts/state-map-final-timing-20x-20261028/phase-summary-20x.json)
- [Final phase raw data](../../artifacts/state-map-final-timing-20x-20261028/results.json)
- [Shared-sight color samples](../../artifacts/state-map-final-on-20x-20261028/grayscale-parity.json)
- [Final assisted screenshot](../../artifacts/state-map-final-on-20x-20261028/player-1-20x.png)
- [Matrix analysis script](../../tools/summarize-player-matrix.mjs)
- [Earlier timing method and measurements](movement-pipeline-timing-2026-10-28.md)

Early `state-map-matrix-*` artifacts used an intermediate body-darkening candidate and are excluded from these results. The final measurements are explicitly named `state-map-final-*`.

The live DnDServer service has not been restarted. The changes are built in the workspace and exercised on isolated servers; the running service needs its normal restart/update to load the new server capability.
