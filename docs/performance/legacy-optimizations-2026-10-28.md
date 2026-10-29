# Legacy buffers and 3D GPU preference experiment

**Measurement follow-up:** the older automated timings include Playwright DOM snapshot recording overhead. See [the later CPU diagnosis](legacy-cpu-diagnosis-2026-10-28.md) for clean player profiles and drawing-isolation results. The deterministic canvas allocation counts remain valid.

Measured 2026-10-28 against isolated disposable campaigns. No live campaign edits or DnDServer restart. Raw receipts: [JSON](legacy-optimizations-2026-10-28.json).

## Changes retained

- Legacy skips `installPerspectiveCanvas` and `installPerspectiveInput`. Its fixed overhead view uses native Konva canvases/input, without padded orbit scene/hit surfaces or extra warp buffers.
- The Three.js miniature renderer requests `powerPreference: 'high-performance'`. This is a browser hint, not a guaranteed adapter selection. Legacy still never creates that renderer.

## Controlled Legacy comparison

Same 240 x 160 ft room, 3840 x 2560 map, 143 tokens, 48 lights, 28 wall pieces / 112 edges. Six real player drags; independent Legacy player (1x CPU) and Legacy DM (20x CPU), DM in combined Player view. GPU and accelerated Canvas2D disabled, WebGL blocked. Join/setup unthrottled; CPU throttle active before DM enables Player view and during movement. Both documents visible. Event-driven probe version 3, server unthrottled on same host, no network latency or RAM cap. Browser recording and probes add overhead. One six-move run per version; not a statistical hardware benchmark.

| Measurement | Before | After |
|---|---:|---:|
| DM scene + hit canvas pixels, six layers | 51,463,840 | 13,340,160 (-74.1%) |
| Player scene + hit canvas pixels, six layers | 57,860,340 | 14,256,000 (-75.4%) |
| DM median release-to-token paint opportunity | 1,924 ms | 1,633 ms |
| DM median release-to-visibility paint opportunity | 2,036 ms | 1,689 ms |
| DM maximum release-to-visibility paint opportunity | 3,045 ms | 2,030 ms |
| Player median release-to-visibility paint opportunity | 653 ms | 312 ms |
| DM main-thread task time during six moves | 17,402 ms / 23,608 ms observed | 17,486 ms / 22,377 ms observed |
| Player main-thread task time during six moves | 2,732 ms | 1,335 ms |
| DM largest observed long task | 1,225 ms | 670 ms |

The DM viewport remained 1440 x 772. The five padded layers changed from 2636 x 1868 to 1440 x 772; the sixth was already viewport-sized. These pixel counts cover scene and hit canvases only, not extra offscreen perspective buffers or total browser memory. They are a deterministic allocation reduction, not a measured RAM reduction.

Latency improved in this small sample, but total DM main-thread task time did not. The extremely throttled DM still has substantial stalls. Do not describe this as a solved old-CPU performance problem or claim a general 17% speedup. The player showed lower task time. Both clients had zero WebGL attempts, zero model/3D module requests and no page errors.

## GPU preference comparison

Installed Chrome 156.0.8078.49, separate fresh browser process per sample, low/high/high/low order. Actual MapStage: 24 loaded goblin miniatures (~509k color triangles), eight lights, four walls, balanced preset, 1440 x 960 DPR1. Five seconds warmup after model readiness, then seven seconds stationary and seven seconds of repeated accepted token movement. No CPU throttling or recording. The test intercepts getContext solely to select the compared preference and records the production renderer's original request.

| Sample order | Effective preference | GPU | Stationary painted frames/sec | Moving painted frames/sec |
|---|---|---|---:|---:|
| 1 | low-power | RTX 5090 / ANGLE D3D11 | 58.63 | 140.34 |
| 2 | high-performance | RTX 5090 / ANGLE D3D11 | 58.56 | 141.59 |
| 3 | high-performance | RTX 5090 / ANGLE D3D11 | 58.48 | 188.72 |
| 4 | low-power | RTX 5090 / ANGLE D3D11 | 57.61 | 217.73 |

Both preferences selected the same NVIDIA adapter despite an AMD integrated GPU being present. Stationary performance was essentially unchanged. Moving samples varied considerably with run order and do not establish a preference-related improvement. Frame counts are the renderer's distinct painted browser frames, not monitor refresh rate or an end-to-end movement-latency metric. The hint is retained to express the intended 3D performance priority; it has no demonstrated speed benefit on this host. Browser policy can ignore the hint. See [WebGL context attributes](https://registry.khronos.org/webgl/specs/latest/1.0/#5.2).

## Artifacts

- Before movement: `artifacts/legacy-optimization-before-20261028/results.json`, `dm-20x.webm`, `player-1x.webm`.
- After movement: `artifacts/legacy-optimization-after-20261028/results.json`, `paired-dm20-player1.mp4`, `dm-20x-player-visibility.mp4`, `dm-20x-complete.png`, `paired-preview.png`.
- GPU experiment: `artifacts/gpu-preference-20261028/results.json` and four scene screenshots.
- Earlier light/wall editing recording: `artifacts/legacy-player-visibility-20261027/player-visibility-editing.mp4`.

## Reproduction and checks

Build the client first (`npm.cmd run build --prefix client`). Use installed Chrome via `PW_CHROMIUM`, and an isolated port via `E2E_PORT`. `e2e/playwright.config.ts` always creates disposable DB/data paths. The movement recording requires a working Playwright ffmpeg runtime (`PLAYWRIGHT_BROWSERS_PATH` on this host).

```powershell
$env:E2E_PORT='4117'
$env:E2E_SOFTWARE_GL='0'
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\vcons\DnD-App-v2\artifacts\playwright-runtime'
$env:LEGACY_MOVEMENT_OUTPUT='C:\Users\vcons\DnD-App-v2\artifacts\legacy-optimization-recheck'
$env:LEGACY_MOVEMENT_MOVES='6'
$env:LEGACY_MOVEMENT_RATES='20'
$env:LEGACY_MOVEMENT_PLAYER_RATE='1'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/legacy-movement.spec.ts
$env:GPU_PREFERENCE_OUTPUT='C:\Users\vcons\DnD-App-v2\artifacts\gpu-preference-recheck'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/gpu-preference.spec.ts
```

Client production build and TypeScript check passed. Eight browser regressions passed: startup gating, Legacy dice, Legacy DM visibility/editing with viewport canvas checks after resize/reload, independent player/DM quality, repeated light placement, spell prompt dismissal, and DM/player rotation including Legacy-to-standard transitions. Both movement benchmark versions and the four-sample GPU experiment passed their functional assertions. Native Mac Safari was not exercised by these Chromium runs. Initial-load/add-creature timings were not remeasured in this experiment; earlier receipts remain dated evidence.

See [server visibility options](server-visibility-options-2026-10-28.md) for the next architecture change. Server-delivered visibility polygons and state deltas are proposed, not implemented or measured here.
