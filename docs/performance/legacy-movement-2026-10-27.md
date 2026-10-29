# Legacy player movement observed by a DM

**Measurement follow-up:** these timings include Playwright DOM snapshot recording overhead as well as video. See [the later CPU diagnosis](legacy-cpu-diagnosis-2026-10-28.md) for clean profiles and drawing-isolation tests. The recordings remain functional evidence, not pure unassisted-player latency measurements.

This is a paired-client movement test of the production build, using a disposable campaign and server. One browser joins as a player, claims Varis, and performs actual mouse drags. Another browser joins as DM, enables Player view, and watches the same server-authoritative movement. The DM sees combined party sight from three PCs; the player sees Varis's personal sight plus the existing shared-sight presentation. Their masks are therefore intentionally different.

The heavy room matches the preceding stress test: 240 × 160 ft, 3840 × 2560 image, 140 monsters and three PCs (143 total server tokens), 48 lights, and 28 wall/pillar pieces (112 edges), with heavy dungeon darkness. Each view renders the visibility-filtered subset; the test does not force concealed creatures to render. Both clients use Legacy with GPU and accelerated Canvas2D disabled and WebGL blocked. The server is unthrottled and local to the test host. No remote network latency or RAM cap is simulated.

Initial login and scene loading are unthrottled in this movement-only test. CPU slowdown begins before the DM enables Player view and remains active during the idle baseline and all measured movement. Earlier startup measurements are in [the initial stress report](legacy-stress-2026-10-27.md).

## Final measurements

Each row contains six committed player moves, one traversal of the same route. Times start at the player's captured mouse-release event. Token timing uses the actual Konva layer draw with the token at the accepted destination; sight timing uses the changed visibility paths. Both wait two browser animation-frame opportunities afterward. This measures end-to-end client update latency, not monitor scanout. Local timestamps share the host's clock and include player processing, server communication/filtering, and DM processing. Only pauses and staged dragging before release are excluded from each latency sample.

| DM / player CPU slowdown | DM token median | DM sight median | Slowest DM sight update | Player sight median |
|---|---:|---:|---:|---:|
| 1× / 1× | 248 ms | 270 ms | 393 ms | 623 ms |
| 6× / 6× | 590 ms | 619 ms | 1.017 s | 948 ms |
| 12× / 12× | 1.284 s | 1.346 s | 2.093 s | 2.048 s |
| 20× / 20× | 3.083 s | 3.175 s | 3.313 s | 4.684 s |
| 20× / 1× (older DM / faster player) | 1.568 s | 1.694 s | 2.494 s | 422 ms |

Median is the average of the two middle samples. With only six samples per row, the receipt's nearest-rank p95 equals the observed maximum. These are single-session observations, not statistically stable device ratings.

| Equal CPU slowdown | Measured sequence duration | DM main-thread task time | Player main-thread task time | Longest DM task | Longest player task |
|---|---:|---:|---:|---:|---:|
| 1× | 8.819 s | 0.431 s | 2.594 s | No task ≥50 ms | 67 ms |
| 6× | 23.342 s | 3.143 s | 18.253 s | 242 ms | 504 ms |
| 12× | 47.079 s | 8.688 s | 40.557 s | 499 ms | 983 ms |
| 20× | 94.124 s | 18.097 s | 85.394 s | 1.331 s | 2.022 s |

An additional run kept the DM at 20× and the player at 1×. The six-move sequence lasted 22.129 s, with 16.054 s of DM task time and 2.310 s on the player; the longest DM task was 1.058 s. DM sight had a median delay of 1.694 s and a maximum of 2.494 s. The faster player reduces end-to-end delay, but the software-only DM remains busy and visibly delayed. Its idle baseline was 2 ms over 2.019 s. [Separate-rate receipt](legacy-movement-dm20-player1-2026-10-27.json).

Main-thread task duration is Chrome's TaskDuration delta, not whole-computer CPU utilization. The sequence includes six staged drags, per-move verification, and 450 ms inspection pauses. The player doing the dragging has substantially more local work than the observing DM. End-to-end delays cannot all be attributed to the DM because both clients are slowed in these four rows.

The visibility cadence is a maximum update rate of 2 Hz, not a 500 ms response guarantee under heavy load. Private drag destinations stay private: the DM's token and sight change after release and server acceptance. Legacy presents committed positions without smooth token interpolation. The 12× and especially 20× software-rendering cases have visible delays; a functional pass is not a smoothness claim.

All five final runs passed: six accepted moves each, changed sight geometry, DM Player view retained, zero WebGL attempts and model/dice-renderer requests, no browser page errors, and both documents visible. Host: Ryzen 7 7800X3D, 16 logical CPUs, 31 GiB RAM, Chrome 156 on Windows. CPU slowdown is CDP main-thread throttling, not an exact old CPU, one-core system cap, or a limit on every browser/GPU/encoding process. Both clients were recorded throughout.

## Probe control and evidence

The published receipt uses **probeVersion 3**: a cached token reference, a Konva draw-event listener, and an SVG MutationObserver. There is no polling loop or continuously scheduled RAF probe. The two RAF callbacks are requested only after an observed update. An idle-with-instrumentation control recorded DM main-thread work of 1 / 3 / 4 / 2 ms over approximately two seconds at 1× / 6× / 12× / 20×. This control includes application idle work and recording overhead; it is not a separately isolated instrumentation-only cost.

Preliminary paired runs used frame polling that inflated CPU load, especially at high slowdown. Those figures and recordings are excluded from the final comparison. The earlier commentary's preliminary paired movement numbers are superseded by this report. No application rendering policy changed between the preliminary and final runs.

[Raw final receipt](legacy-movement-2026-10-27.json). It includes individual release timestamps, every latency sample, idle controls, long-task summaries, and the client build hash. Source WebM videos and screenshots are in `artifacts/legacy-movement-20261027-events/`. H.264 viewing copies are derived from those recordings without speeding them up. Side-by-side recordings are approximately aligned for viewing; measurements use browser timestamps, not video-frame comparison. The video encoder's frame rate is not reported as application FPS.

Viewing copies:

- `artifacts/legacy-movement-dm20-player1-20261027/paired-dm20-player1.mp4`: DM at 20× on the left and player at 1× on the right, including the DM enabling Player view and all six moves.
- `artifacts/legacy-movement-dm20-player1-20261027/dm-20x-player-visibility.mp4`: the same DM footage at its full 1440 × 900 size.
- `artifacts/legacy-movement-20261027-events/paired-movement-12x.mp4`: both clients at 12×, with the DM on the left and player on the right.

## Reproduce

```powershell
$env:E2E_PORT='4115'
$env:E2E_SOFTWARE_GL='0'
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LEGACY_MOVEMENT_OUTPUT='C:\Users\vcons\DnD-App-v2\artifacts\legacy-movement-new-run'
$env:LEGACY_MOVEMENT_MOVES='6'
$env:LEGACY_MOVEMENT_RATES='1,6,12,20'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/legacy-movement.spec.ts
```

Build the production client first if it is not already built. A working Playwright FFmpeg runtime is required for recording. `PLAYWRIGHT_BROWSERS_PATH` may select a separate runtime cache. Use a fresh output directory. Without `LEGACY_MOVEMENT_OUTPUT`, the benchmark is skipped by ordinary browser-test runs. To hold the player at normal speed while slowing the DM, set `LEGACY_MOVEMENT_PLAYER_RATE='1'`; otherwise the player uses the DM's rate.

For the implementation's CPU/GPU/Canvas/WebGL division and remaining optimization gaps, see [the rendering audit](rendering-paths-2026-10-27.md).
