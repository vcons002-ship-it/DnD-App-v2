# Legacy assisted versus local movement — 2026-10-28

Standard local rendering starts sooner than assisted Legacy on this real-image scene. Under extreme CPU throttling, both paths stutter and local 2D had a large cold hitch. This is a timing comparison, not evidence that local rendering is cheaper on all old hardware.

## Release to first movement-paint estimate (ms)

| Browser CPU slowdown | View | Legacy assisted | Local 2D / Low | Local 3D / Low |
|---|---|---:|---:|---:|
| 1x | Player | 629 | 104 | 110 |
| 1x | DM | 626 | 101 | 115 |
| 6x | Player | 672 | 226 | 343 |
| 6x | DM | 671 | 208 | 303 |
| 20x | Player | 1168 | 1013 | 1424 |
| 20x | DM | 1200 | 913 | 1338 |

## Release to first movement-related visibility-paint estimate (ms)

| Browser CPU slowdown | View | Legacy assisted | Local 2D / Low | Local 3D / Low |
|---|---|---:|---:|---:|
| 1x | Player | 629 | 85 | 98 |
| 1x | DM | 626 | 84 | 97 |
| 6x | Player | 672 | 212 | 298 |
| 6x | DM | 671 | 208 | 286 |
| 20x | Player | 1168 | 1012 | 1424 |
| 20x | DM | 1200 | 913 | 1338 |

Visibility timing tracks the first changed sight origin path on local clients and the first nonzero mask pose in Legacy. It is not completion of the whole movement or a proof that every displayed pixel was correct. Local clients may redraw sight for sub-pixel movement before the token exceeds the one-map-pixel movement threshold. The two numbers need not match exactly. The Legacy retake excludes pose zero, which changes image packing without moving sight.

## Method

Eight actual player drags per mode/rate, separate disposable courtyard for each condition. Player and DM both throttled after startup; server unthrottled on the same PC. Legacy: smooth, assisted, WebGL blocked. Local 2D: overhead, Low, assist off, flat tokens. Local 3D: 45-degree tilt, Low, assist off, real WebGL/models. No video recording or network/RAM/GPU limit. Epoch clocks share the host. First-motion and sight estimates include two RAF opportunities, not physical display scanout. CDP slowdown is not a complete emulation of old hardware. All modes still use authoritative server movement/filtering/exploration.

Same current application build for every condition. Same 1216 × 832 real courtyard image, four wall pieces, two guards, a claimed PC, carried lantern, heavy darkness and remembered terrain. Eight actual player drags per mode/rate, both independent clients receive the listed slowdown, and DM watches Player visibility. Fresh disposable session and browser contexts per condition. Throttling starts after setup; no video encoder or unrelated CPU-heavy test ran concurrently. The benchmark validates assistance preference on both clients, local wall-geometry source, graphics tilt and renderer readiness. Local 3D uses projected pointer coordinates for the 45-degree board.

Hardware: AMD Ryzen 7 7800X3D 8-Core Processor, 16 logical CPUs. Chrome 156.0.8078.49. Local rendering uses real WebGL on the RTX 5090, with no GPU throttling. Legacy blocks WebGL. These numbers do not emulate an old integrated GPU, weak memory subsystem or WAN. This scene is not the earlier many-creature stress test.

Both the release event and browser probes use the host epoch clock. The movement probe excludes the held destination preview by reading the token's actual art offset. It waits for two RAF opportunities after first movement (>1 map pixel); local rendering additionally requires a subsequent WebGL draw submission. These are presentation estimates, not physical display scanout or GPU completion measurements. Rendering stalls are retained. Eight samples are too few for a dependable population p95; the JSON includes the observed maxima.

## Interpretation and limits

- Local rendering avoids the server's full 13-pose image preparation/download/decode barrier. It still waits for the authoritative movement state, including remembered-path exploration and per-viewer filtering. It then calculates intermediate view geometry, projects masks and renders locally during the animation.
- Legacy still prepares and decodes a complete synchronized animation before publishing it. Its sequence is 400 ms; local movement uses a distance-dependent 220–460 ms duration. First-motion comparisons exclude that duration, while completion timings in JSON include it.
- At 20x, the original local 2D DM run contained a roughly 8.9-second first-paint estimate. The server emitted that move in about 0.11 seconds; the DM browser received it about 3.35 seconds after release and then had a multi-second animation-frame gap. This browser-side stall is in the raw results and the maximum; it has not been discarded. No profiler was active, so its precise cause is unproven.
- Intermediate pose counts in JSON are sampled RAF positions, not physical monitor FPS. Both paths can skip most animation poses at 20x. A lower median start delay alone does not establish smoothness.
- Non-Legacy mode can also use server assistance. The local columns specifically turn it off; this comparison does not measure standard 2D/3D with assistance enabled.

All compared groups passed the opt-in browser test, completed eight moves on both clients and had no client page errors. No application implementation changed for this comparison. The live DnDServer was not restarted and live campaign data/uploads were not used.
