# Legacy DM CPU stress measurement

**Measurement follow-up:** the automated run inherited Playwright DOM snapshot recording, adding test overhead to the recorded timings. See [the later CPU diagnosis](legacy-cpu-diagnosis-2026-10-28.md). Historical receipts and videos are preserved.

Recorded on 2026-10-27 (America/New_York) using a disposable server/database and a production client build. The live campaign was not used or restarted.

The room is 240 × 160 ft, backed by a 3840 × 2560 PNG. It starts with 120 monsters, three PCs, 48 lights, and 28 wall/pillar pieces (112 edges). Each run adds 20 monsters using the real DM Creatures menu and map clicks, ending with 143 tokens. Lights use dungeon heavy darkness; the DM also opens combined party visibility. Player visibility naturally filters the rendered creature count.

Host: Ryzen 7 7800X3D, 16 logical CPUs, 31 GiB usable RAM, Windows, Chrome 156.0.8078.49. Browser viewport: 1440 × 900. Each run uses a fresh context, disabled HTTP cache, disabled GPU/accelerated Canvas2D, and intercepted WebGL calls. The server remains unthrottled, matching a weak client connecting to a separate server. Video recording remains enabled throughout.

| CDP CPU slowdown | Startup choice visible | Choose Legacy → login | Rejoin → painted map and 123 tokens | Player sight ready | Add creature median | Add creature p95 | 20 additions including automation overhead |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1× | 83 ms | 115 ms | 723 ms | 540 ms | 69 ms | 100 ms | 1.848 s |
| 6× | 370 ms | 432 ms | 5.793 s | 762 ms | 273 ms | 298 ms | 7.452 s |
| 12× | 1.004 s | 1.099 s | 12.377 s | 2.095 s | 663 ms | 1.263 s | 21.858 s |
| 20× | 2.017 s | 2.248 s | 22.379 s | 4.666 s | 1.443 s | 1.954 s | 37.442 s |

The startup, mode-choice and join measurements are separate intervals. Time spent entering the password or pausing at the choice is not included in map-load time. Placement measures pointerdown to an increased Konva token count followed by two animation frames. It includes server communication and client redraw. Each rate has one cold run and 20 placement samples; these are observations, not statistically stable hardware ratings.

All four runs finished with 143 tokens, zero WebGL attempts, zero miniature/dice-renderer or GLB requests, zero campaign renderer requests before startup selection, and no browser page errors. No artificial latency or RAM cap was applied. The throttle slows browser main-thread execution; it does not turn the entire host into a specific old CPU or constrain all browser processes to one slow core. Screenshots/video capture add overhead. The recordings' 25 fps encoding is not a measured map frame rate.

While idle in player visibility, main-thread task duration increased by 11 / 86 / 270 / 292 ms over approximately five seconds at 1× / 6× / 12× / 20×. The visibility SVG did not redraw during any idle sample. JS heaps were 48 / 29 / 32 / 28 MiB; these are JS heap measurements, not total browser memory. Worst observed long tasks were 153 ms / 1.350 s / 3.762 s / 7.595 s, including cold loading. A functional pass at 20× does not imply a smooth experience: initial loading and repeated additions are noticeably slow there.

Raw comparison receipt: [JSON](legacy-stress-2026-10-27.json). Local captures are under `artifacts/legacy-stress-20261027/`, including one full video per rate, initial and final screenshots, and the generated map art. The JSON records the exact client index hash.

## Reproduce

Build the client first. In PowerShell, set `PW_CHROMIUM` to an installed Chrome executable when the Playwright browser is unavailable:

```powershell
npm.cmd run build -w client
$env:E2E_PORT='4109'
$env:E2E_SOFTWARE_GL='0'
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LEGACY_STRESS_OUTPUT='C:\Users\vcons\DnD-App-v2\artifacts\legacy-stress-new-run'
$env:LEGACY_STRESS_RATES='1,6,12,20'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/legacy-stress.spec.ts
```

A working Playwright FFmpeg installation is needed for video. `PLAYWRIGHT_BROWSERS_PATH` may select a separate runtime cache. The benchmark is skipped in ordinary E2E runs unless `LEGACY_STRESS_OUTPUT` is set. It generates all room assets and campaign state; no existing campaign is required.

For the additional DM editing recording, set `LEGACY_STRESS_RATES='12'` and `LEGACY_STRESS_EDITING='1'`, using a different output directory. It repeats the same setup and additions, then keeps Player view active while moving Varis twice, placing two lights with saved defaults, and drawing a wall. Sight updates after committed token drops; drag destinations remain private. The recording uses the later build that allows the DM to drag visible tokens in player preview. The comparison above predates that authority fix, which does not change the measured loading/placement path.

That additional run passed with GPU acceleration disabled at 12× slowdown. It verified two committed PC moves and changed SVG sight paths, two new 5-ft lights (48 → 50), and a new wall (28 → 29), with Player view selected throughout those actions. The interaction section lasted 67.396 s, including deliberately paced drags, pauses for inspection, menu actions, and throttled browser work. Its drag totals are not drop-to-visibility latency measurements. No WebGL/model renderer requests or browser errors were observed. [Editing receipt](legacy-player-visibility-2026-10-27.json).

Local media: `artifacts/legacy-player-visibility-20261027/player-visibility-editing.mp4` is a 68-second real-speed excerpt of the editing section; `cpu-12x.webm` retains the complete uncut run, including startup and 20 additions. `artifacts/legacy-stress-20261027/cpu-20x.mp4` is the full extreme-throttle run. MP4 files are H.264 transcodes for easier playback; the source WebM recordings are retained.

The client production build and typecheck passed. Six focused Chromium browser checks passed: startup gating, actual legacy dice results, throttled wall/light editing, mixed Legacy/standard clients, and DM/player desktop/mobile rotation controls with captured context-menu suppression and working token action menus. The latter reproduces Safari's wrapper-target context-menu event, but native macOS Safari has not been verified on this Windows host.
