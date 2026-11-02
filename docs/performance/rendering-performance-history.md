# Rendering performance: decisions, experiments, and current flow

Updated 2026-10-31. **The server-mask/local-color prototype is a failed effort in its tested form. Do not enable or merge that renderer.** It increased first-motion latency in every measured condition and failed Legacy color acceptance. Its reduced Legacy bandwidth is useful evidence for future experiments, but does not meet the performance and visual requirements.

This reference separates three source states:

| State | Revision | Meaning |
| --- | --- | --- |
| Main branch inspected | `e22b72d8` | Existing rendering paths; no mask/color separation. This is a source description, not a fresh deployment audit. |
| PR #170 reviewed | `d7ef3d3f` | Geometry-sharing benchmark revision; existing renderers and colors retained. Its carried-lantern cache issue was fixed in the follow-up below; historical measurements are unchanged. |
| Rejected prototype | [`e1fbbd15`](https://github.com/vcons002-ship-it/DnD-App-v2/commit/e1fbbd15) on `codex/server-mask-color-experiment` | Archived source, harness, and results. Default-off protocol 4 experiment based on PR #170; not deployed by this work. |

## Failed attempt: server masks with local color

The proposal was to calculate and compose visibility once on the server, send masks to authorized clients, and retain the established colors and effects through local composition. The prototype packed current visibility, remembered terrain, and near/darkvision information into RGB channels. It also produced Legacy fog/light alpha images, cached original-color and grayscale map artwork, used CSS masks and additive composition in Legacy, and sampled the packed mask in the 2D/3D GPU compositor. Standard modes additionally received server-prepared animation masks for a 13-pose, 400 ms movement plan. Matching requests shared image preparation; image access still required private viewer grants.

This was a full server-to-browser experiment: preparation, transfer, image decoding, Legacy CSS composition, standard GPU composition, and actual token drags. Standard modes still ran their DOM fallback mask updates, and downloaded/predecoded auxiliary assets that were not all necessary for their renderer. This implementation therefore did not achieve the minimum possible local workload. Server rasterization and PNG encoding used CPU workers/Sharp, not the RTX 5090.

### Method and timing

The same prototype build ran separation off/on/on/off with **server assist on in every case**. The scene contained 141 tokens, 48 stationary lights, 28 wall segments, a carried lantern, a real courtyard image, heavy darkness, and remembered terrain. A Legacy player performed real drags while simultaneous 2D and 3D DM Player-view clients observed. There were 64 drags and 192 viewer observations: 16 samples per viewer, CPU rate, and separation condition.

Browser CPU rates were 1x and 6x, applied after startup. The same-host server was unrestricted on a Ryzen 7 7800X3D; standard modes used the RTX 5090, and Legacy blocked WebGL. Missing LFS figures used test stand-ins. There was no WAN delay, bandwidth/RAM limit, video recording, or trace overhead. These are movement results, not initial-load measurements or certification for an old integrated GPU. Different viewer roles prevent interpreting the rows as an equal-workload ranking of graphics modes.

Pooled mean milliseconds, rounded to the nearest millisecond:

| Browser CPU | Viewer | Server preparation: separation off → on | Release to first motion: off → on | First-motion change |
| --- | --- | ---: | ---: | ---: |
| 1x | Legacy player | 1,043 → 1,414 | 1,224 → 1,651 | +34.9% |
| 1x | 2D preview | 795 → 1,390 | 965 → 1,842 | +90.9% |
| 1x | 3D preview | 775 → 1,403 | 1,156 → 1,981 | +71.3% |
| 6x | Legacy player | 714 → 1,063 | 1,034 → 1,452 | +40.5% |
| 6x | 2D preview | 525 → 1,042 | 2,189 → 3,276 | +49.6% |
| 6x | 3D preview | 515 → 1,053 | 4,663 → 4,935 | +5.8% |

“Server preparation” is elapsed command-to-prepared-frame time, not pure geometry compute or aggregate CPU usage. First motion uses browser render opportunities (two animation-frame callbacks), not physical display scanout. Timing stages overlap and must not be added together. The small 6x 3D percentage is noisy and does not establish a precise effect size. Lower server times in the 6x runs do not mean throttling accelerates the server; the separate run conditions change scheduling and contention.

Actual render-asset HTTP transfer per move averaged approximately **13.02 MB → 3.66 MB** for Legacy at 1x, and **12.82 MB → 3.66 MB** at 6x: about 72% less. Standard viewers went from approximately **0.038 MB → 3.678 MB**, about 96 times as much. These decimal MB values use Resource Timing `transferSize`, including headers and excluding cached body transfers; they exclude socket state messages. `encodedBodySize` also counts cached bodies and must not be substituted as network traffic.

Legacy exchanged bandwidth for extra preparation delay. Standard modes acquired substantial animation image preparation/download work and waited for it before playback. This supports rejecting this prototype; it does not prove every possible server-mask architecture is slower, especially under different network conditions.

### Visual acceptance

Acceptance required mean absolute RGB difference below 1 on a 0–255 scale, and fewer than 1% of pixels with any channel differing by more than 12. Comparisons after real pan/zoom were:

| Mode | Lighting | Mean RGB difference | Pixels over threshold | Result |
| --- | --- | ---: | ---: | --- |
| Legacy | Heavy darkness | 0.500 | 0.594% | Pass |
| Legacy | Regular darkness | 2.440 | 2.165% | **Fail** |
| Legacy | Daylight | 3.226 | 5.331% | **Fail** |
| 2D | Heavy darkness | 0.010 | 0.003% | Pass |
| 2D | Regular darkness | 0.131 | 0.085% | Pass |
| 2D | Daylight | 0.000 | 0.000% | Pass |
| 3D | Heavy darkness | 0.010 | 0.003% | Pass |
| 3D | Regular darkness | 0.110 | 0.032% | Pass |
| 3D | Daylight | 0.00024 | 0.00076% | Pass |

An initial 2D regular-darkness capture had a much larger difference (mean 33.275; 53.027% of pixels over threshold); a fresh camera render removed that discrepancy. Startup visual parity remains unverified. The Legacy mismatches were not fully root-caused. These targeted comparisons do not certify every spell effect or all application UI.

The prototype passed 2,440 unit tests across 249 files, client/server typechecks, the client build, and all four movement benchmark trials. The explicit browser visual acceptance run had two passing mode cases and one failing mode case. Functional/build success does not override failed performance or visual acceptance.

Evidence: [full measured results and limitations](separated-masks-2026-10-31.json), [archived browser acceptance harness](https://github.com/vcons002-ship-it/DnD-App-v2/blob/e1fbbd15/e2e/separated-vision.spec.ts), [movement harness](https://github.com/vcons002-ship-it/DnD-App-v2/blob/e1fbbd15/e2e/shared-visibility-latency.spec.ts), and [summarizer](https://github.com/vcons002-ship-it/DnD-App-v2/blob/e1fbbd15/scripts/performance/summarize-separated-masks.mts). The results file preserves the original execution-time branch status; the source was subsequently pushed as an archive. No prototype PR was opened.

## Previous attempts and successes

These are separate historical experiments with different fixtures, versions, timing endpoints, and throttles. Do not concatenate their improvements or compare their absolute numbers as one longitudinal benchmark. “Retained” describes the approach carried into the code, not proof of a universal performance win.

| Attempt | Outcome and measured evidence | Limits and reference |
| --- | --- | --- |
| Server geometry and snapshot deltas | **Bandwidth success; no overall movement win.** At 20x CPU, event bytes fell 1,343,480 → 563,582 (58.1%). Median sight delay was 3,485 → 3,493 ms; combined client task time 58,621 → 58,295 ms. | Two players, six moves. Startup varied across runs. [Server offload](server-offload-2026-10-28.md). |
| Server-painted Legacy masks and token sprites | **Client CPU reduction, mixed latency/startup.** At 20x, task time fell 39,354 → 32,664 ms (17%); script time 24,582 → 16,710 ms (32%). Sight median 2,742 → 2,712 ms; load 23.659 → 25.419 s. | More server CPU and image traffic. Historical movement behavior in this report is superseded. [Server rendering](server-rendering-2026-10-28.md). |
| Retained Legacy layers, tiles, and partial token painting | **Retained success with server cost.** Pooled client busy time 35.28 → 26.55 s (24.7% less); median sight 2.855 → 2.568 s (10.1% faster). | Initial load did not improve. Server CPU 3.36 → 4.65 **CPU-seconds across the whole six-move window**, not 4.65 seconds per move. HTTP requests increased. [Retained rendering](legacy-retained-rendering-2026-10-28.md). |
| Image readiness/state-to-map scheduling | **Measured latency success.** Follow-up ready-images-to-map-commit 1,365 → 348 ms; full release-to-display probe 2,720 → 1,431 ms. | Separate phase trace; four-way same-build test showed assist helping at 20x (1,800 → 1,506 ms) but no clear fast-client win (413 → 453 ms means). [State-to-map](state-to-map-update-2026-10-28.md). |
| Matched assistance on/off rerun | **Conditional success on weak clients.** Historical snap-mode release-to-sight means: 1x 583 → 530 ms; 20x 3,653 → 2,434 ms. | Six moves per condition, same host. Smooth assisted playback then incurred additional preparation. Snap-only Legacy descriptions and early silently-snapping “smooth” results are superseded; not current animation guidance. [Direct comparison](assistance-direct-current-2026-10-28.md). |
| Remove Legacy perspective padding/warp | **Deterministic allocation reduction.** Canvas pixels: DM 51.46M → 13.34M; player 57.86M → 14.26M (about 74–75% less). | Earlier latency samples had Playwright snapshot-recording overhead; do not reuse as clean latency evidence. High-performance GPU preference selected the same 5090, so no adapter-speed benefit established. [Legacy optimizations](legacy-optimizations-2026-10-28.md). |
| Retain 3D transforms, materials, HUDs, lights, and dirty regions | **Scoped rendering success.** At 6x, moving 3D render rate 15.9 → 22.9 frames/s; task cost per rendered frame fell 29.7%. Normal flat movement task time 721.5 → 477.2 ms. | Small samples on a 5090. Total 6x 3D busy time stayed about the same; render throughput is not display FPS or input latency. [Standard retention](standard-rendering-retention-2026-10-28.md). |
| Skip unnecessary visibility layers | **Retained work-elimination/correctness success.** Unobstructed cases bypass geometry, terrain masks, and client visibility composition; manual fog and token authorization remain. | No quantified speedup claimed. Darkness/barrier cases and DM party preview still require the appropriate layers. [Unobstructed visibility](unobstructed-visibility-2026-10-28.md). |
| Navigation scheduling and manual-fog image reuse | **Hotspot success; mixed end-to-end result.** Low at 6x: idle task time −51.8%, navigation task time −43.8%. 100 fog redraws: 995.1 → 33.3 ms normal, 4,977.5 → 304.2 ms at 6x. | Complete brush task time did not improve (59.7 → 65.6 ms normal; 465.5 → 557.5 ms at 6x). Normal navigation had no reliable win. [Navigation/fog](navigation-fog-2026-10-28.md). |
| PR #170 shared base geometry and detailed-outline upgrades | **Geometry success; modest/variable app benefit.** Legacy-first mixed requests 3.73 → 2.14 ms; 48 → 24 completed jobs for 24 warm revisions. Standard alone 3.15 → 2.09 ms; Legacy alone 1.24 → 1.46 ms. All 576 output hashes per version matched. | These are geometry times, not full response. These measurements predate the moving-lantern cache fix below. [Geometry report](shared-visibility-2026-10-31.md). |
| PR #170 crowded mixed-mode app test | **Modest pooled improvement at 6x.** First-motion means: Legacy 1,152 → 1,046 ms; 2D 2,238 → 2,048 ms; 3D 4,409 → 4,055 ms. | At 1x: Legacy 1,225 → 1,269 ms, 2D 970 → 957 ms, 3D 1,156 → 1,156 ms. Two trials per version; 3D benefit varied. This tested geometry sharing only, not mask/color separation. [Heavy comparison](shared-visibility-heavy-2026-10-31.md). |

## Current processing flow

This describes the inspected source states above. Server assist and graphics mode are independent settings. Unsaved preferences default to assist on and Low quality; existing saved preferences remain. Board overrides take precedence over individual player overrides, then the browser preference. Disabling assist does not disable server authorization or game rules.

1. **Local interaction:** the browser handles pointer/touch input, camera navigation, hit testing, selection, targeting, and immediate interaction feedback. Assisted drag previews can request server collision/terrain/visibility work. An accepted move still passes through authoritative server validation.
2. **Authoritative state:** the server validates movement, applies game rules, updates path exploration, filters hidden tokens and private fields for each viewer, and constructs snapshots/deltas. A DM Player-view preview has its own authorized view. Identical geometry may be reused, but one player's private memory or token visibility cannot simply be broadcast to everyone.
3. **Assisted preparation:** server workers calculate accepted-position sight/light geometry and prepare reusable token artwork. Legacy additionally receives server-prepared visibility/terrain images and sampled movement frames. Identical work is cached/coalesced where the inputs match; differing viewer permissions, origins, memory, and rendering outputs can still require separate work.
4. **Delivery and presentation:** private image grants accompany prepared state; clients fetch/decode needed assets and coordinate state publication with image readiness. The browser still animates visible tokens, composites layers, draws interaction overlays, and presents the final image. Server assist is not a streamed video feed.

| Mode with assist on | Server rendering work | Local rendering work |
| --- | --- | --- |
| Legacy | Accepted visibility geometry; fog/lighting/terrain images; reusable token sprites; sampled motion visibility and artwork. | Image transfer/decode, retained image composition, token painting/animation and UI/hit regions. Local/failure fallbacks can still do work. Reduced motion preferences are respected. |
| Standard 2D | Accepted sight/light geometry and reusable token sprites, plus shared authoritative state work. | Local animated intermediate visibility, mask/color composition, overhead token rendering, lights, effects, camera, and interaction layers. It does not receive the rejected protocol 4 mask animation stream. |
| Standard 3D | Same categories as standard 2D; common geometry is not inherently different because the board is tilted. | The 2D responsibilities plus perspective projection, 3D models, shadows and applicable WebGL effects. Server rendering here uses CPU workers; local 3D uses the client GPU. |

Without assist, clients additionally perform their mode's visibility/mask/artwork preparation locally, while the server continues authoritative rules, exploration, and privacy filtering. Legacy can animate locally; older reports describing mandatory snap movement are historical. Animation and server-sampled visibility are distinct: moving a token smoothly does not make visibility preparation free.

PR #170 adds order-independent sharing between basic Legacy geometry and detailed standard geometry. Requests batched together can upgrade one queued job; a late detailed request adds outlines without rebuilding the base result. Viewer-specific memory/affinity is applied separately. It does **not** unify every rendered asset across modes, nor implement the rejected mask/color split.

Merge integration with main `e22b72d8`: standard 2D/3D delivery now omits unused base sight/light/memory paths while the worker pool retains them for sharing with Legacy. A detailed job may serve both modes, so only an explicit outline-only augmentation can omit base computation. This preserves cache correctness and the standard transport reduction; it does not promise the new main branch's standalone outlines-only compute saving. Mode-aware sprite preparation also omits artwork for supported 3D tokens while retaining required 2D fallbacks. An integration regression covers standard player/DM preview output and subsequent Legacy cache reuse. The final rebased suite passed 2,442 tests across 248 files (194.60 seconds), plus 110 targeted tests, both typechecks, and the client build. An earlier full run ended with a Vitest worker process exit and five incomplete tests; the complete retry passed. GitHub CI failed at checkout because the repository exceeded its LFS budget. Timing tables above predate this integration.

Relevant source: [delivery](../../server/src/stateDelivery.ts), [rendered snapshots](../../server/src/renderedSnapshot.ts), [Legacy motion preparation](../../server/src/legacyMotion.ts), [geometry workers](../../server/src/visibilityWorkers.ts), [client state](../../client/src/state/socket.ts), and [map presentation](../../client/src/canvas/MapStage.tsx).

## PR #170 review: carried-lantern cache fix

Checked 2026-10-31 against head `d7ef3d3f`: one general PR comment, no submitted reviews, no inline comments, and no review threads. [The review comment](https://github.com/vcons002-ship-it/DnD-App-v2/pull/170#issuecomment-6543699792) identified an issue in `VisibilityWorkers.runVision`, reproduced by regression tests before the fix:

- The purported stationary-lamp job includes every non-transient light, including carried lanterns emitted by `shared/playerVision.ts`. Moving a carried lantern changes that whole job's cache key and can recompute stationary lamps too.
- A carried-light-only view is split into two jobs even though it has no stationary-lamp work to isolate.
- The no-non-transient-lights early return forwards the original job, retaining transient-light fields in the cache key even though that geometry path ignores them.

**Fixed on 2026-10-31, after rebasing PR #170 onto `851c104d`.** Carried light sources are now explicitly marked, including lanterns belonging to visible tokens outside the viewer's personal origins. They stay with moving origin work; only stationary lights enter the reusable lamp layer. Origin-ID matching also handles personal lights without the marker. No stationary lamps means one job, and transient inputs are stripped before geometry lookup. Merged light paths preserve their original order. Viewer memory and affinity are attached using the original vision, so transient spell lighting can still affect affinity even though it does not enter the cached geometry.

Regression coverage verifies one job per carried-only pose in basic and detailed modes, stationary reuse while personal and other carried lights move, shared Legacy/2D/3D work, transient-only cache hits with changing affinity, and exact equality to the unsplit worker's geometry and mask/lighting SVG inputs across darkness/daylight and wall modes. The new assertions failed on the earlier implementation. All 100 targeted tests pass. The full suite passed 2,441 tests across 248 files in 227.90 seconds; both typechecks and the client production build also pass.

The prior benchmark numbers remain observations of the earlier code; this fix has not been timed in a new full-app benchmark. The archived failed mask/color prototype is unchanged and still inherits the old issue. Fixing the geometry cache does not establish that the rejected renderer's latency or visual failures are resolved.

## Conditions for another mask experiment

Keep the current renderer as the control. Before considering enablement, incorporate the carried-light fix, investigate caching stationary coverage across movement poses, send each mode only the assets it consumes, and remove redundant fallback composition only where safe. Smaller changed-region updates are another untested option. These are candidates, not measured successes.

A replacement must preserve normal vision, darkvision, party-view grayscale, remembered terrain, walls/doors, daylight bypasses, and spell lighting through initial load, pan/zoom, and motion. Repeat full-app paired trials with separate server preparation, image transfer/decode, and first-motion measurements; include constrained network and real low-end GPU tests before extending claims to those devices. Keep aggregate CPU-seconds, elapsed server time, geometry time, and visible response time labeled separately.
