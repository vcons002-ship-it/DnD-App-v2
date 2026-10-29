# Standard and 3D retained rendering — 2026-10-28

Implemented in the working checkout and verified using the installed Chrome browser with actual RTX 5090 WebGL rendering. The main result is lower CPU work per rendered 3D frame, with higher throughput under CPU throttling. Animated 3D scenes still require client CPU/GPU work.

## Changes

- Prepared flat-token body/HUD images bypass an additional whole-token canvas cache in every graphics mode. External/vector portraits retain the existing fallback cache.
- Miniature names retain their own glyph textures independently of movement, selection, health bars and body artwork. A small typography/layout version replaces repeated serialization of complete Konva label trees. Stationary name geometry is no longer uploaded every frame. Health bars and input remain live.
- Miniature material/layer/outline work runs when the visible body appearance changes. Moving, selecting, or rotating the camera does not reapply unchanged body materials. Visibility, tint, size, opacity and shadow-setting changes invalidate it.
- Static light sources reuse their prepared field data. The map-space lighting render target is retained until sources, walls, shadow results or relevant field dimensions change. Flicker, moving carried lamps, and transient spell illumination continue updating.
- Local shadow-source selection is retained using nominal source output, positions, caster visibility and walls. Each frame still resolves the current light objects, preserving animated radiance. Existing shadow refresh budgets remain in force.
- Body-mask invalidation compares retained numeric matrix, instance, pose and morph buffers instead of serializing entire buffers into one large JSON key. Pose, geometry, visibility and camera changes still refresh the mask.
- Dirty-region token drawing now works on standard/tilted canvases, including miniature HUDs. It accounts for padded off-screen pixels, device scaling and the perspective drawing buffer. Upright-label rotation, animated turn rings and GPU-name suppression explicitly invalidate their old/new regions. Visible measuring tools use a complete Konva redraw; dismissing them clears the tools before resuming partial drawing.
- A fully stationary scene with effects disabled stops rendering after settling. Visible selection/turn effects continue animating without rebuilding unchanged name textures or light-field pixels. The existing on-demand 3D scheduler remains in use.

These are shared MapStage/MiniatureLayer paths used by DM and player views. Server-assist defaults and owner/player controls are preserved. Loaded 3D models, camera projection and dynamic scene rendering remain local; this does not introduce server-side model video streaming.

## Method

Same disposable encounter before and after: 48 actual goblin miniatures (or the same 48 creatures as flat tokens), 12 lights, four rectangular walls, 1800×1200 background, 1440×960 browser viewport, DPR 1, Balanced graphics, 45-degree tilt, server assist enabled, DM view. Mist remains enabled at its saved default; the phase named `static` means stationary tokens with the atmosphere still running.

Four cases use standard flat tokens or 3D models at normal speed or Chrome 6× CPU throttling. Each uses a fresh browser context, model readiness checks, five seconds of warmup, then approximately four seconds each of stationary viewing, a selected token, eight server-driven token moves at 500 ms cadence, and flickering lights. No video, CPU profiler or tracing runs during measurements. Builds and other test jobs were finished before the clean tilted baseline/final benchmarks. The separate local server remains unrestricted. The renderer string confirms NVIDIA GeForce RTX 5090 through ANGLE/D3D11.

CDP `TaskDuration` measures browser main-thread task time, including script and native browser work. Render throughput counts distinct miniature renderer frames, **not physical presentation/display FPS**. Camera/state invalidations can request paints above the ordinary animation cadence. Measurements are not input-to-paint latency, network latency, server CPU time or GPU utilization. CDP/counter reads add small boundary overhead around the approximate four-second windows; task times must not be interpreted as exact utilization percentages.

This is one before/after sample per case. It establishes observed behavior on this machine, not a hardware-independent speed guarantee. Chrome CPU throttling does not emulate an old GPU, memory bandwidth, low RAM or WAN latency.

## 3D results

| CPU | Phase | Render frames/s before → after | Main-thread task ms before → after | Task cost per render change |
|---|---|---:|---:|---:|
| Normal | Stationary + mist | 57.0 → 57.0 | 999.9 → 792.9 | −21.0% |
| Normal | Selected token | 57.0 → 57.3 | 1086.9 → 855.3 | −22.0% |
| Normal | Movement | 104.8 → 123.0 | 2481.3 → 2299.7 | −20.6% |
| Normal | Flickering lights | 65.7 → 63.6 | 1307.6 → 989.9 | −21.9% |
| 6× throttled | Stationary + mist | 25.7 → 33.9 | 4240.6 → 4156.8 | −25.8% |
| 6× throttled | Selected token | 25.7 → 34.7 | 4801.3 → 4724.5 | −27.1% |
| 6× throttled | Movement | 15.9 → 22.9 | 4220.6 → 4289.0 | −29.7% |
| 6× throttled | Flickering lights | 20.9 → 29.9 | 4275.2 → 4210.3 | −31.1% |

At normal speed, movement task time decreased 7.3% while render throughput increased 17.3%. At 6× throttling the browser remained saturated: movement task time was similar, but throughput increased 44.2%. The improvement is more useful frames for the available CPU, rather than a large fall in total busy time.

During the final 3D movement samples, unchanged body appearance and name-texture rebuild counts both stayed at zero. Stationary/selection phases performed zero additional light-field renders. Moving shadows and flickering lights refreshed their field as needed. At 6× throttling, the miniature HUD layer used 40 partial scene paints drawing 40 token nodes, with zero complete scene paints, during the measured movement window. Its retained hit map continues to support the ordinary token controls.

## Flat-token results and initial load

Normal-speed flat-token movement task time decreased from 721.5 to 477.2 ms (33.9%). The 6× sample rendered more frames (62.9 → 70.8/s) while spending more total task time (2163.7 → 2423.6 ms); task cost per render was effectively unchanged (−0.4%). This does **not** establish a throttled flat-token movement CPU saving. Stationary flat-token task time decreased 15.7% at normal speed and 21.3% at 6×.

| Case | Navigation/join → scene ready, before | After |
|---|---:|---:|
| Flat tokens, normal CPU | 2.226 s | 1.675 s |
| Flat tokens, 6× CPU | 4.362 s | 4.273 s |
| 3D models, normal CPU | 2.950 s | 2.911 s |
| 3D models, 6× CPU | 9.691 s | 7.820 s |

Load values include navigation, DM join, scene setup and readiness checks. They are single observations with fresh browser contexts; the disposable server's asset cache is shared across the fixed case order. No general load-time percentage is claimed.

## Validation

- Project typecheck passed; client production build, runtime model/LOD asset validation and server build passed.
- 2,355 unit tests across 234 files passed against isolated temporary data with controlled AI endpoints.
- 18 browser regressions passed with hardware WebGL available. Coverage includes startup mode choice, Legacy behavior, DM wall/light editing in player view, Bone Shard Burst dismissal, DM/player rotation, player panels, server rendering policy/choice, visibility-frame resync and hidden token removal, plus retained canvas parity.
- New standard/3D regressions compare retained native pixels against an independent full Konva redraw after movement, rotation, health/name changes, measuring-tool add/remove, off-screen movement and viewport resizing. They also verify actual rotated token context-menu/drag input, partial-paint activity, idle sleep, selected-ring animation, light edits, Low/High quality changes and deletion.
- New unit coverage checks field invalidation for shadow updates, walls, moved/recolored/removed lights and transient spells, carried lights/flicker, retained name uploads, body appearance keys, exact instance data, bone pose, morph and geometry invalidation.
- Final four-case benchmark passed with no page errors. The final 3D screenshot was inspected to confirm the tilted scene, miniatures, health/name overlays and ordinary DM controls.

The live DnDServer service was not restarted and live campaigns were not modified. Tests ran on a separate port with disposable databases. Native Safari performance/visual behavior was not measured in this comparison.

## Evidence and reproduction

- Before: `artifacts/standard-rendering-before-tilted-20261028/results.json`
- Final: `artifacts/standard-rendering-final-tilted-20261028/results.json`
- Validated comparison: `artifacts/standard-rendering-comparison-20261028.json`
- Scene screenshots: `artifacts/standard-rendering-final-tilted-20261028/{2d,3d}-{1,6}x.png`
- Benchmark: `e2e/standard-rendering-performance.spec.ts`
- Browser regressions: `e2e/standard-rendering-retention.spec.ts`
- Summary: `scripts/performance/summarize-standard-rendering.mjs`

The earlier overhead baseline and intermediate `standard-rendering-after-tilted-20261028` capture are excluded from the final comparison. Only the clean 45-degree baseline and final results listed above feed the comparison.

```powershell
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:E2E_PORT='4126'
$env:STANDARD_RENDER_OUTPUT='artifacts/standard-rendering-repeat'
npm.cmd run build
npx.cmd playwright test -c e2e/playwright.config.ts e2e/standard-rendering-performance.spec.ts
node scripts/performance/summarize-standard-rendering.mjs artifacts/standard-rendering-before-tilted-20261028/results.json artifacts/standard-rendering-repeat/results.json artifacts/standard-rendering-repeat/comparison.json
```
