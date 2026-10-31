# Heavy mixed-mode visibility comparison

## Result

The geometry-sharing change produced modest pooled improvements under 6x browser CPU throttling, but no meaningful overall improvement at normal CPU speed. End-to-end delays remain large. The controlled geometry benchmark in [the original report](shared-visibility-2026-10-31.md) measures a much smaller part of the pipeline and must not be presented as the reduction in total movement delay.

## Method

Baseline `677a6921` versus implementation `1dba1869`, in before/after/after/before order. Two trials per version, eight real drags per CPU rate/trial: **64 drags and 192 viewer observations**, with 16 observations per version/rate/viewer. All four final browser runs passed. Raw condensed samples, overlapping stage timings, individual-trial summaries, source hashes, and client-build hash are in [the accompanying JSON](shared-visibility-heavy-2026-10-31.json).

- One Legacy player moves Druk. Two independent DM clients watch in Player visibility, one in 2D and one in tilted 3D. These are simultaneous viewers with different roles/workloads, not an equal-work ranking of the three rendering modes.
- Real courtyard image, 141 tokens (one PC and 140 monsters), 48 stationary lights, 28 wall segments, carried lantern, heavy darkness, remembered terrain, smooth movement.
- Server assist on for all three clients. Same client bundle, fixture and test harness for both server versions. Server unrestricted; all three browsers run at normal speed or 6x CDP CPU slowdown after startup.
- Ryzen 7 7800X3D, Chrome 156.0.8078.49. Standard modes used WebGL on the RTX 5090 through ANGLE/D3D11; Legacy blocked WebGL. Low quality, with test stand-in figures for unavailable LFS models. No video recording, tracing, WAN delay, RAM cap, or GPU throttling. This does not simulate an old integrated GPU or benchmark initial load.
- First visible movement is an instrumented estimate with two animation-frame opportunities, not physical screen scanout. Server response is receive-to-state-emission. Stages overlap and must not be added together.
- Cold first moves and all successful samples are included. Two initial harness-debug attempts are excluded: the original observer retained a replaced 3D token node. The final observer follows the current token node. No production code was changed for this benchmark.

## Pooled averages

| Browser CPU | Viewer | Server response before -> after | Release to first motion before -> after | Motion change |
| --- | --- | ---: | ---: | ---: |
| 1x | Legacy player | 1054 -> 1081 ms | 1225 -> 1269 ms | +3.6% |
| 1x | 2D DM preview | 785 -> 788 ms | 970 -> 957 ms | -1.4% |
| 1x | 3D DM preview | 769 -> 773 ms | 1156 -> 1156 ms | -0.1% |
| 6x | Legacy player | 752 -> 715 ms | 1152 -> 1046 ms | -9.2% |
| 6x | 2D DM preview | 561 -> 519 ms | 2238 -> 2048 ms | -8.5% |
| 6x | 3D DM preview | 550 -> 509 ms | 4409 -> 4055 ms | -8.0% |

At 6x, pooled first-motion medians were Legacy 1,042 -> 1,003 ms; 2D 2,052 -> 1,875 ms; 3D 4,413 -> 3,540 ms. Means and medians are both retained in the JSON. The 3D mean is highly variable: in the first pair it improved from 4,459 to 3,741 ms, but in the reverse-order pair it changed from 4,359 to 4,369 ms. Legacy server response also varied: 804 -> 727 ms in the first pair, versus 701 -> 703 ms in the reverse-order pair. These results are descriptive measurements, not statistical proof of a repeatable percentage gain.

## What still costs time

On the updated server at 6x browser throttling:

- The combined path/exploration and snapshot preparation interval averaged **413-415 ms**, before state delivery began. This interval includes `recordWalkingMove` and snapshot construction; this benchmark does not separately attribute their individual costs.
- Legacy endpoint geometry averaged **10 ms**. Its animation preparation averaged **269 ms**, including intermediate views and terrain/mask work. Normal rendering overlaps this preparation.
- Standard-viewer geometry preparation averaged **60-61 ms**. These timings include async waiting and main-thread scheduling; they are not isolated worker CPU time.
- State delivery queue delay was effectively zero. The long delay is not a deliberate delivery throttle on movement.
- Beyond the measured server response, the total first-paint residual was roughly **330 ms for Legacy, 1,529 ms for 2D, and 3,546 ms for 3D**. This residual includes input/send delay, transport, browser state processing and rendering; it is not a pure network or GPU measurement.

The next useful targets are the path/exploration and snapshot interval, Legacy animation-image preparation, and crowded-board client update/rendering in standard modes. More geometry caching alone will not eliminate these delays. The previously proposed server-mask/local-color renderer is not implemented by this PR and is not what this comparison tests.

Smooth Legacy animation and mask alignment checks passed on all final drags. This is performance and movement validation; it does not add a new pixel-by-pixel color comparison. Production renderers/colors remain unchanged by the geometry-sharing PR.

## Reproduction

Build the client once, preserve a separate baseline source tree, and copy the current benchmark and its helpers/config into that baseline. Use the same absolute `E2E_CLIENT_DIST` for both versions. Run each trial sequentially from the corresponding source tree:

```powershell
$env:PW_CHROMIUM='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:E2E_PORT='4179'
$env:E2E_SOFTWARE_GL='0'
$env:E2E_PERFORMANCE_METRICS='1'
$env:E2E_CLIENT_DIST='<absolute current client/dist>'
$env:MOTION_LATENCY_RATES='1,6'
$env:MIXED_LATENCY_OUTPUT='<absolute artifact folder>/heavy-before-1'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/shared-visibility-latency.spec.ts
```

Repeat as `heavy-after-1`, `heavy-after-2`, `heavy-before-2`, then summarize:

```powershell
node --import tsx scripts/performance/summarize-shared-visibility.mts <artifact folder> <summary.json>
```

All runs used disposable test servers/databases. The installed app and live server were not updated. GitHub CI on PR #170 is blocked during checkout by the repository's exceeded Git LFS budget; it did not reach build or test execution.
