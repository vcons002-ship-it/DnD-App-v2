# Legacy movement latency — 2026-10-28

Release-to-first-motion latency improved without reducing the 13-pose, 400 ms animation or moving visibility calculations back to the client. This is elapsed latency, not process CPU time. The live DnDServer service was not restarted; server changes were tested on disposable instances with separate databases and uploads.

## Before and after

Conventional medians of eight actual player drags at each throttle rate. Player and DM use independent browser contexts and both receive the same slowdown; the DM watches Player visibility. Maxima are the slowest of eight, not a reliable population p95.

| Client CPU slowdown | View | Before median ms | After median ms | Reduction | Before / after max ms |
|---|---|---:|---:|---:|---:|
| 1x | Player | 1019 | 625 | 38.6% | 1298 / 700 |
| 1x | DM | 1036 | 629 | 39.3% | 1299 / 696 |
| 6x | Player | 1079 | 697 | 35.4% | 1375 / 774 |
| 6x | DM | 1080 | 684 | 36.6% | 1491 / 774 |
| 20x | Player | 1611 | 1187 | 26.3% | 1935 / 1248 |
| 20x | DM | 1723 | 1238 | 28.2% | 2100 / 1292 |

The rendered-image transfer median fell from about 5.33 MB to 1.17 MB per move per viewer (78% less), measured using Resource Timing transferSize. This includes the image assets fetched after release; it is not total WebSocket traffic or decoded GPU memory. Both tests include new raster bounds as the token crosses the courtyard.

## Changes retained

- Prepare the accepted endpoint and its movement animation concurrently inside the existing two-worker pool. Diff animation display fields against the completed endpoint to preserve token sprites and hidden-creature behavior.
- Share the static grayscale artwork across poses. Send a cropped color illumination overlay for each pose and the unchanged full visibility-mask atlas. Translucent artwork retains the full-image fallback. Only clients advertising compactMotion receive the new layout; older clients retain their existing layout.
- Compose map images as raw pixels instead of repeatedly encoding and immediately decoding lossless PNG intermediates.
- Deduplicate identical in-flight raster jobs and retain encoded results in a 32 MiB / 32-entry LRU. Every viewer still needs an independent private asset grant, including on cache hits.
- Let accepted position changes bypass an idle Legacy 500 ms update debounce. Other updates retain coalescing. Obsolete animation preparation stops enqueueing additional poses; running worker jobs are allowed to finish.

The complete animation and endpoint images still decode before the client publishes them. No partial-animation streaming, speculative drag calculation, worker-pool expansion, active-job cancellation, resolution reduction, or animation-duration reduction was introduced.

## Smoothness and server responsiveness

At 1x, all eight moves on both clients sampled all 12 intermediate mask poses. At 6x, the DM sampled all 12 on every move; the player sampled 11 on one move and 12 on the other seven. The final endpoint is separate. This is comparable to the baseline, which also occasionally skipped a pose. Sampled token/mask alignment error was below 0.1 map pixels in every run (numerical error below 0.000001 pixels).

At 20x, both versions sampled only 2–4 intermediate poses per move. The optimized version starts sooner, but the full browser cannot sustain the animation cadence at that extreme slowdown. CPU throttling does not emulate integrated-GPU, memory, or network limits.

One health request immediately after each drag release completed successfully: 24 requests, median 1.48 ms, maximum 9.51 ms. This is a limited responsiveness probe while movements were pending, not a multi-campaign load test or proof of zero scheduling contention. The worker pool remains two workers, queue limit 64 and timeout 10 seconds. There were no timeouts or client page errors in the final timing run.

## Method and remaining delay

Eight actual player drags per rate, separate disposable courtyard for each rate. Player and DM both throttled after startup; server unthrottled on the same PC. WebGL blocked, 30 fps smooth Legacy enabled, no video recording, no network/RAM limit. Epoch clocks share the host. First-paint estimate includes two RAF opportunities; this is not physical display scanout. CDP slowdown is not a complete emulation of old hardware.

Host: AMD Ryzen 7 7800X3D 8-Core Processor, 16 logical CPUs, Chrome 156.0.8078.49. Real 1216 × 832 courtyard image, four walls, two guards, a moving PC with a lantern, heavy darkness and remembered map. No video encoder ran during these measurements. This is a real-image movement regression scene, not the earlier many-creature stress scene; do not extrapolate these results to every map.

The first-paint estimate records the token's first movement followed by two animation-frame opportunities; it does not measure physical display scanout. Baseline 1x/6x comes from one run; baseline 20x was repeated separately after relaxing an invalid expectation that a 20x browser must display three intermediate frames. All compared groups contain eight moves. Both sides use the same conventional median, recomputed from raw samples.

Roughly 0.6–0.7 seconds remains before first motion at 1x/6x. The server still calculates authorized intermediate views and rasterizes all 13 visibility masks, and the client still waits for the complete decoded animation. A profile of the retained renderer showed mask rasterization as the largest remaining atlas component. Endpoint and motion spans overlap now and must not be added together. The unsuccessful combined-SVG mask experiment was reverted after it increased latency and hit a timeout in an isolated test.

Raw evidence is listed in the companion JSON. Reproduce with E2E_PERFORMANCE_METRICS=1, MOTION_LATENCY_OUTPUT set to a fresh artifact folder, and the e2e/legacy-motion-latency.spec.ts opt-in Playwright test. Rebuild the client first. Do not run video capture or other CPU-heavy tests concurrently with timing measurements.

## Validation

Production build and server/client TypeScript checks passed. All 239 unit-test files passed (2,379 tests), including mask-pixel parity, color reconstruction within one 8-bit channel value, raw map/decal composition parity, cache limits and private viewer grants, old-client atlas compatibility, and movement delivery/coalescing checks. Nine affected browser regressions passed: player/DM Legacy walking and footsteps, player controls with assistance on/off, retained token painting, server-rendering controls and private assets, standard 2D/3D retained artwork, and state-frame resync/hidden-creature behavior. The opt-in final timing test passed all 24 moves, observed both viewers and reported no client page errors.

## Review recording

[Open the mobile player and DM videos](https://dnd.nic024i.app/previews/legacy-latency-20261028-bba37b38911e/index.html). This separate unthrottled capture uses direct AV1 recording and H.264 compatibility copies, with matching frame counts and container durations within one video frame. Actual drags, destination previews, footsteps, lighting, remembered ground and guards entering/leaving sight are retained. The recording regression passed, including 793 token/mask alignment samples with maximum error below 0.000001 map pixels. Public playback files and posters matched local SHA-256 hashes; MP4 byte-range requests returned 206. Both videos played and the first-drag buttons sought correctly in Pixel 7 emulated Chromium, with no horizontal overflow or page/media errors. Physical mobile Safari was not available for validation. Artifacts: artifacts/latency-improved-av1-20261028/.
