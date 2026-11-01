# Visibility-plan reuse experiment, 2026-11-01

Status: implemented on `codex/visibility-plan-reuse`. The measurements below compare main `1463ee57` with candidate `11230c4e`, before the subsequent PR #190 integration. No live app/server update. Results are mixed: the constrained-CPU test improved, while unthrottled timing varied enough that this is not a universal latency win.

## PR integration boundary

The branch was subsequently rebased onto `61bb09f2`, including merged PR #190. The MapStage conflict was resolved by retaining main's removal of the `gpuComposite` prop and adding only this candidate's server-outline fallback. All other incoming rendering changes were preserved, including the changed miniature invalidation and memory-rendering behavior. Those changes affect the measured rendering path: the tables below are historical evidence for the original candidate, **not benchmark results for the rebased PR head**. A new paired benchmark against current main remains necessary before a performance-based merge decision.

Post-rebase validation: 32 targeted tests across state delivery, walking, and motion snapshots passed; both typechecks and the full production build passed; all six movement-membership browser cases passed together with no retries (1.3 minutes). The full 2,463-test suite and benchmark figures below are pre-rebase results and were not rerun after PR #190 integration.

## Changes

- Negotiate `motionEntityRefs` in the join handshake. Send each distinct authorized token/monster appearance once per movement plan, with frame references. Intern complete values rather than IDs so shared-sight/grayscale and other appearance changes survive. Old clients retain inline records; new clients also accept old-server inline plans. A WeakMap shares packing work when the exact plan object is reused.
- Build presentation snapshots once per accepted plan and reuse unchanged records, token/monster arrays, and sprite mappings across its frames. Keep destination coordinates for the existing animation clock. Preserve frame membership, timing, geometry, and artwork. A replacement plan cannot inherit revoked intermediate creatures.
- Keep the token server-preview callback stable during membership-only playback. Previously temporary absence of geometry toggled this prop and invalidated token memoization.
- Keep server-prepared wall outlines available to the standard renderer during membership-only playback. The overlay still checks exact origin coordinates and the wall key before using an outline. Moving sight falls back to its correct current position; endpoint geometry is not substituted for per-frame visibility/affinity.

No changes to visibility policy, animation duration, colors, model detail, token controls, or when an authorized creature may appear. No delayed token-appearance/loading policy was added.

## Method

The opt-in [browser harness](../../e2e/visibility-reuse-benchmark.spec.ts) uses matching before/after server and client builds, an actual map image, 141 tokens, 48 lights, 28 walls, a carried lantern, heavy darkness, and remembered terrain. Three simultaneous assisted viewers: Legacy player (WebGL blocked), overhead Low 2D DM player-view, tilted Low 3D DM player-view. Eight actual drags per CPU rate per build per repeat. Five-second warm-map settling period before throttling.

Primary order: before, after, after, before, each at 1x and 6x. Thus 16 movements per build/rate and viewer, 64 actual moves / 192 viewer observations. An additional unthrottled before/after/after/before block adds 32 moves / 96 observations. All raw runs are retained, including the slow first optimized 1x run.

Host: Ryzen 7 7800X3D / RTX 5090. CPU throttle applies to all three clients, not the server. No encoder, CPU profiler, trace, WAN delay, RAM limit, or GPU restriction during timing. Some unavailable LFS models use test stand-ins. This is a warm-map CPU comparison, not a cold-start test or complete old-integrated-GPU simulation.

First motion is measured from release to renderer activity plus two RAF opportunities, not physical scanout. Server stages overlap; do not add them. Server emit-to-handler time includes socket flushing, decoding, and scheduling, not merely network transit. Navigation figures are accumulated main-thread work over scripted pans/zooms, not a single gesture's latency. Reported packet bytes are decoded WebSocket JSON sizes, not compressed network bandwidth.

## Primary result: 6x CPU slowdown

Mean release-to-first-motion:

| Viewer | Before | After | Change |
| --- | ---: | ---: | ---: |
| Legacy player | 887 ms | 808 ms | -8.9% |
| 2D DM preview | 1,461 ms | 1,273 ms | -12.9% |
| 3D DM preview | 2,001 ms | 1,784 ms | -10.9% |

Mean navigation main-thread work:

| Viewer | Before | After | Change |
| --- | ---: | ---: | ---: |
| Legacy player | 4,308 ms | 4,566 ms | +6.0% |
| 2D DM preview | 17,547 ms | 15,392 ms | -12.3% |
| 3D DM preview | 21,266 ms | 14,716 ms | -30.8% |

For 3D at 6x, mean accepted server work was 347 -> 315 ms; browser-handler wait 403 -> 337 ms; handler-to-first-motion 1,204 -> 1,086 ms. The remaining delay is still substantially browser scheduling/presentation work. These are observations of the whole patch, not proof that each individual change caused each gain. The two navigation runs varied, especially 3D; avoid treating the percentage as a guarantee.

## Unthrottled results and uncertainty

Initial block, mean release-to-first-motion:

| Viewer | Before | After | Change |
| --- | ---: | ---: | ---: |
| Legacy player | 536 ms | 785 ms | +46.5% |
| 2D DM preview | 558 ms | 792 ms | +41.9% |
| 3D DM preview | 534 ms | 740 ms | +38.7% |

Dedicated repeat, using the same unchanged code and fixture:

| Viewer | Before | After | Change |
| --- | ---: | ---: | ---: |
| Legacy player | 600 ms | 534 ms | -11.1% |
| 2D DM preview | 638 ms | 577 ms | -9.6% |
| 3D DM preview | 591 ms | 551 ms | -6.8% |

The first optimized normal-speed run had unusually high upstream path/snapshot and server preparation times (Legacy server mean 746 ms, versus 422 ms in the preceding baseline); this occurs before packing the outgoing plan. That observation does not establish the cause. The repeat reversed the direction. Pooling all unthrottled observations still leaves the candidate slower overall, approximately 14-16%, so **do not claim a normal-CPU speedup or discard the unfavorable runs**. Further controlled profiling is needed before promising improved latency on fast machines.

## Payload and loading

Mean movement message sizes were consistent across these blocks:

| Viewer | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Legacy | 1,578 KiB | 1,524 KiB | 3.4% |
| 2D | 243 KiB | 188 KiB | 22.4% |
| 3D | 237 KiB | 182 KiB | 23.0% |

Legacy's other geometry/image metadata remains dominant. Packing repeated entity values does not eliminate that work.

CDP recorded **zero GLB/GLTF requests during all 96 measured movements**. The 3D preload queue reported 7/7 ready before measurement. Standard playback previously switched its geometry-source diagnostic between server/client; the candidate kept it at server. This diagnostic indicates supplied outlines are available, not that every animated outline is reused: coordinate/key checks remain authoritative.

Model loading is therefore not the demonstrated warm-movement bottleneck in this fixture. The app already caches models by URL, prioritizes currently visible models, and loads background models serially. GPU preparation and per-instance rendering can still cost CPU time after downloads finish. This fixture contains many instances of a few models, so it does not settle first-load behavior for a diverse campaign.

Nearby-first preloading may help cold maps with many distinct assets. It should prioritize already authorized data and run in a bounded background budget. Deliberately delaying token appearance until a loading queue reaches it would reintroduce missing-creature behavior; that is not the change made here.

## Validation and reproduction

- Full unit suite: 2,463 tests, 251 files, passed.
- Server/client typechecks, client E2E build, and full production build passed. Vite reported its existing large-chunk warning.
- All six Legacy/2D/3D x assist on/off movement-membership browser cases passed. Coverage includes creatures absent at both endpoints, departure visibility, relocation, and mid-move revocation. One initial 2D unassisted run missed the interior animation sampling window; its unchanged retry passed. No creature-visibility assertion failed in that run.
- These tests check membership/appearance data and existing rendering behavior; no new pixel-by-pixel color equivalence claim is made.

Use Node 22, build the client with `npm run build:e2e -w client`, then set `E2E_PORT=4197`, `E2E_SOFTWARE_GL=0`, `E2E_PERFORMANCE_METRICS=1`, `PW_CHROMIUM` to the installed Chrome executable, `MOTION_LATENCY_RATES=1,6`, and `MIXED_LATENCY_OUTPUT` to a fresh directory. Run `playwright test -c e2e/playwright.config.ts visibility-reuse-benchmark.spec.ts --trace=off --reporter=list`. Use separate matching builds for the historical baseline and candidate; run sequentially without builds or other tests alongside measurements.

[Structured summary](visibility-plan-reuse-2026-11-01.json). Raw local artifacts, orchestration, logs, and analysis: `C:/Users/vcons/codex-work/visibility-reuse-20261101/`.
