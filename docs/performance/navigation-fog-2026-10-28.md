# Player navigation and manual-fog optimization

Implemented and tested after the user ended the active campaign. All runtime checks used disposable data and a separate server port. This update did not deploy a frontend or restart DnDServer.

## Changes

- Stationary 3D cosmetics follow the graphics budget: Low/Off 12 Hz, Balanced 20 Hz, High 30 Hz. Movement, casts, fades and active effects retain the fast path; camera/input invalidation bypasses the idle cap. Idle waits use a timer instead of scanning every browser animation frame. Disabled mist/particle effects do not keep the renderer awake.
- Low/Off and Legacy use the static CSS HP orb, without creating its WebGL context. Balanced/High retain the liquid animation and reduced-motion behavior. HP values and controls remain live.
- Pointer bursts coalesce into one pan canvas update per browser frame. Release flushes the final position before rebuilding hit maps. Legacy's prepared fog/terrain transforms still update synchronously on each pointer event; they must not wait for a canvas paint.
- Manual fog retains small images with one alpha pixel per grid cell. Changed cells edit those images; only visible tiles allocate canvases. Visible tiles are joined at integer coordinates into one retained image before scaling, avoiding seams and overlapping DM translucency. Camera movement within the retained tile range reuses that image. Fully revealed cover draws no image.
- DM brushing previews immediately, persists at most four batches per second, and flushes the tail on release. Queued batches retain their original map/layer/direction when tools or maps change. Preview never authorizes player visibility, and unacknowledged preview expires. The server reads just the fog column and skips no-op writes/broadcasts.
- Roll/chat history is merged only when its inputs change. The latest entry has one fade deadline, replacing permanent one-second sorting/timer work.

## Measurement method

The before client was archived from `0d7dfc557f88b2e7f70e34fca51b6227724db1e3`, immediately before these optimizations. The after client is the tested implementation in this update. Both clients used the same current unrestricted disposable backend. The receipts record each built index SHA-256.

Installed Chrome reported NVIDIA RTX 5090 WebGL through ANGLE/D3D11. The identical fixture has 48 real goblin miniatures, one PC miniature, 12 static lights, mist, a 2000 by 1400 map, 1440 by 960 viewport and DPR 1. Server assistance is enabled. Player Low/Balanced cases use normal and 6x browser CPU throttling, fresh contexts, completed graphics warmup, four-second idle samples, and the same scripted pointer/Character-window navigation sequence. Separate interaction regressions verify real canvas panning, projection, token selection and controls.

CDP `TaskDuration` measures browser main-thread task time, including native browser work. The windows use CDP timestamps; queries introduce boundary overhead. Navigation wall times include Playwright operation/DOM waits and are not direct input-to-paint latency. There is one successful observation per case, in fixed order. No trace, video, CPU profiler, build, unit suite or other browser test ran during the final comparison. Throttling does not emulate an old integrated GPU, RAM limits or WAN latency.

## Player results

Main-thread task milliseconds, before to after:

| Quality | Browser CPU | Idle, approximately four seconds | Idle task reduction | Navigation sequence | Navigation task reduction |
|---|---|---:|---:|---:|---:|
| Low | Normal | 806.0 to 254.5 | 68.4% | 418.1 to 442.4 | -5.8% |
| Low | 6x throttled | 3,969.7 to 1,913.3 | 51.8% | 8,756.9 to 4,917.9 | 43.8% |
| Balanced | Normal | 935.4 to 516.5 | 44.8% | 536.8 to 535.0 | 0.3% |
| Balanced | 6x throttled | 3,975.4 to 3,368.2 | 15.3% | 10,323.0 to 7,744.8 | 25.0% |

Unthrottled idle rendering changed from approximately 60 Hz to 12 Hz on Low and 20 Hz on Balanced. Low's HP orb reports static; Balanced's remains animated. These are reductions in stationary cosmetic work, rather than claims of more rendered idle frames. Normal-speed navigation did not show a reliable improvement in this sample. Under 6x CPU pressure the scripted navigation sequence completed in 9.54 to 5.91 seconds on Low and 11.14 to 8.72 seconds on Balanced; these remain automation sequence durations, not individual click latency.

## DM manual-fog results

Legacy DM, 28,000 fog cells, atmosphere disabled. A diagnostic repeats the same background-layer redraw 100 times; the brush phase sends the same 44 newly revealed cells through actual pointer input.

| Browser CPU | 100 redraws before | After | Reduction | Brush task ms before to after | Snapshots before to after |
|---|---:|---:|---:|---:|---:|
| Normal | 995.1 ms | 33.3 ms | 96.7% | 59.7 to 65.6 | 3 to 2 |
| 6x throttled | 4,977.5 ms | 304.2 ms | 93.9% | 465.5 to 557.5 | 4 to 3 |

The redraw hotspot is substantially cheaper, and the short stroke caused fewer snapshots. **The complete brush sample did not reduce total browser CPU time.** Its windows also differed: approximately 788 to 772 ms normally and 1,015 to 1,219 ms at 6x, including a fixed 500 ms wait. This does not establish a universal end-to-end brushing latency improvement. Immediate DM feedback, authorized player reveal/re-cover and the absence of stale revealed pixels were verified separately in browser regressions. Server CPU was not profiled; the no-op SQL-write optimization is verified by a unit test using SQLite's change counter.

## Validation

- Full unit suite: **2,403 passed across 244 files**, isolated temporary database/uploads and controlled AI endpoints.
- Client/server typechecks and production builds passed, including runtime model and LOD/hash validation.
- **31 distinct browser regressions passed** across the final regression and camera/visibility runs. Coverage includes actual token hit areas after pans in Legacy/2D/3D with assistance on/off; startup mode isolation; DM wall/light editing in player preview; permanent spell dismissal; HP/name texture retention; and player controls with assistance on/off.
- New fog tests cover flat Legacy and tilted standard views, pixel concealment at tile boundaries, reveal/re-cover, image reuse, skipping fully revealed fog, and automatic visibility-layer removal/restoration as daylight switches to darkness and back.
- Camera checks enforce synchronous mask alignment and opaque darkness after pan/zoom, including during a prepared animation. Walking checks verify intermediate positions, enemies entering/leaving sight, changing masks, ground footsteps and assistance being disabled. Tests now observe real mask lifetime instead of removed debug-stage attributes.
- Mixed Legacy/3D dice tests verify player d20/d100, DM d20/d100 and creature save materials on two 3D observers. See the [appearance report](dice-appearance-handoff-2026-10-28.md) for warmup limits.
- The initial fog tile implementation exposed fractional-scale seams; it was corrected to one visible mask image before the final successful pixel and timing runs.

## Evidence and reproduction

- [Before receipt](navigation-fog-before-2026-10-28.json)
- [After receipt](navigation-fog-after-2026-10-28.json)
- Benchmark: `e2e/navigation-performance.spec.ts`; set `NAVIGATION_OUTPUT` to a fresh output directory, `PW_CHROMIUM` to installed Chrome, and `E2E_CLIENT_DIST` to the chosen isolated client build. Use a free `E2E_PORT` and run this benchmark alone.
- Final runtime evidence: `artifacts/navigation-fog-20261028/{final-regressions,final-camera-visibility,camera-mask-final}/`.
- Final timing evidence: `artifacts/navigation-fog-20261028/{perf-before-final,perf-after-final,before,after}/`. Earlier failed setup/fixture attempts and superseded measurements are excluded from the committed comparison.

No physical old integrated-GPU machine or native macOS Safari was available for this comparison. Legacy's separate existing regression still verifies no model/WebGL initialization on a throttled CPU.
