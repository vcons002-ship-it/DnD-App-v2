# Current-build direct server-assistance comparison — 2026-10-28

The comparison keeps Legacy mode fixed and toggles assistance on the current production build. Snap movement is the matched A/B because unassisted Legacy does not support the server-prepared smooth sequence. Assisted smooth movement is a separately labeled supplemental test.

## Matched snap movement

One run per condition, six actual alternating drags per condition. Means and conventional medians are in milliseconds; maxima are observed samples, not population p95 estimates. Initial load averages both client loads from every included run.

| Browser CPU slowdown | Assistance | Mean release to sight ms | Median ms | Maximum ms | Mean load to usable s |
|---|---|---:|---:|---:|---:|
| 1x | Off | 583 | 532 | 921 | 0.83 |
| 1x | On | 530 | 502 | 610 | 1.93 |
| 20x | Off | 3653 | 3514 | 4154 | 31.95 |
| 20x | On | 2434 | 2386 | 2714 | 24.60 |

At 1x, enabling assistance changes mean visibility delay by -9.2%, accumulated browser busy time by -20.8%, script time by -50.9%, and mean load-to-usable by 132.6%. Negative changes mean less time.

At 20x, enabling assistance changes mean visibility delay by -33.4%, accumulated browser busy time by -23.8%, script time by -52.0%, and mean load-to-usable by -23.0%. Negative changes mean less time.

## Work during six completed moves

Each row averages complete six-move windows over the runs available for that row. Browser values sum both players. These windows have different durations; these are accumulated workload totals, not fixed-duration CPU utilization. Server values are Node process CPU seconds including its workers, not per-move elapsed latency. Setup/load CPU is excluded. Both clients' token/view commits settle before ending the window.

| CPU slowdown | Assistance | Movement | Browser busy s | Browser script s | Window s | Server CPU-s | Private image MB |
|---|---|---|---:|---:|---:|---:|---:|
| 1x | Off | Snap | 1.205 | 0.591 | 4.799 | 1.781 | 0.00 |
| 1x | On | Snap | 0.954 | 0.290 | 4.681 | 5.969 | 2.32 |
| 20x | Off | Snap | 56.184 | 32.745 | 49.232 | 2.281 | 0.00 |
| 20x | On | Snap | 42.790 | 15.730 | 37.645 | 6.593 | 2.24 |
| 1x | On | Smooth | 1.915 | 0.733 | 13.500 | 20.734 | 14.50 |
| 20x | On | Smooth | 53.829 | 19.989 | 44.977 | 21.219 | 14.34 |

## Smooth-movement supplement

The earlier exploratory smooth rows were optimistic: the moving player silently snapped when personal torch artwork changed. The corrected guard and intermediate-pose assertion now expose the actual preparation cost. These final smooth results supersede those earlier rows.

Only assistance-on rows are comparable here. First motion and first changed sight are distinct from completion. Completion is the later of the two clients' endpoint-token and last observed mask paint probes. Smooth is a 400 ms / 13-pose plan; scheduling can skip intermediate poses under severe throttling. At 1x the test requires actual intermediate sight poses on the moving player's own view; a silently snapped move cannot pass as smooth.

| CPU slowdown | Movement | Mean release to first motion ms | Mean release to first changed sight ms | Mean both views complete ms |
|---|---|---:|---:|---:|
| 1x | Snap | 546 | 530 | 566 |
| 20x | Snap | 2494 | 2434 | 2494 |
| 1x | Smooth | 1653 | 1630 | 2022 |
| 20x | Smooth | 3068 | 2837 | 3860 |

Per-view pose observations are retained in the JSON; no claim of sustained 30 fps follows merely from the smooth preference being enabled. Pose zero repeats the old view and is excluded as a moving-sight update. An observing player's personal sight can remain unchanged, so its view-commit probe is accepted when no mask changes; the moving player's sight must change in every sample.

## Method and limits

Legacy fixed, two players, 143 tokens / 48 lights / 28 wall pieces. Snap trials compare assistance on/off at 1x/20x; assisted smooth runs are supplemental. Snap is forced only by a test-only capability override, with no user-facing animation toggle. New disposable server and campaign per run. Both clients settle before the next move and before ending the CPU window. No video, CPU profiler, Playwright tracing or phase timing. GPU/accelerated Canvas2D disabled and WebGL blocked.

Host: AMD Ryzen 7 7800X3D 8-Core Processor, 16 logical CPUs, 31 GiB RAM, Chrome 156.0.8078.49. Both clients receive the listed throttle before campaign load. The server is unrestricted on the same host. No simulated WAN, memory limit or physical integrated-GPU emulation. The server's Sharp raster work uses CPU workers; no 5090 rendering is involved in these Legacy cases.

Fixture: 143 tokens (140 goblins and three PCs), 48 lights, 28 wall pieces / 112 edges, 240 × 160 ft room, 3840 × 2560 background. Six real alternating mouse drags per run, three per player. No simultaneous-drag load. Seeded panels have default/basic abilities rather than a real campaign's complete spell inventory. All final rows use the same camera/default-animation client build and the same server source, including the narrow torch-display guard correction.

Trial 1 order: on/1x, off/20x, on/20x, off/1x. This final-build matrix has one pass, so order effects remain possible. Supplemental smooth runs follow at 20x and 1x. All cases use fresh disposable servers/campaigns and browser contexts; all use the same client build. Graphics/model requests, geometry source and assistance checkbox are asserted. The animation toggle has been removed: normal clients always request animation; snap is forced by a benchmark-only join-capability override. A narrow server guard allows the viewer-shaped visibleTorch display flag to change along a walk, while wall, light-geometry and fog changes still invalidate animation. Camera transforms now reposition existing masks synchronously.

The probe is event-driven: token layer draw events and SVG/raster revision mutations, followed by two RAF opportunities. It measures browser display opportunities, not physical screen scanout. The initial-load stopwatch includes navigation, startup choice, join/claim and usable draggable tokens. No continuous frame-scanning probe, video, profiler or Playwright trace runs during measurement. The two-view drain is stricter than the earlier benchmark, which could stop while the observer still had work pending; do not treat CPU totals as an exact before/after comparison to that older report.

Historical result files remain intact. Startup/probe failures in earlier discarded attempt folders are excluded. The live DnDServer service, .env and campaign data/uploads were not changed or restarted. Build success and disposable-runtime validation do not activate server changes in the running live process.
