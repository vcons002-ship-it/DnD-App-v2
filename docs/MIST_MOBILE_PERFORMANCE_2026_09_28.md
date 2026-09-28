# Mist preview performance - 28 September 2026

The user reported lag in the interactive dungeon preview on a Fold phone.
This investigation found expensive personal-vision mask updates and duplicate
scene rendering during camera-follow movement. The changes retain the same
miniature assets, textures, mist shader/resolution/sample count, shadows,
lighting falloff and mist wake simulation.

## Changes

1. Keep the personal-vision masks as native SVG definitions in the page, sharing
   the light paths between the darkness and grayscale masks. Previously each
   update encoded two large SVG data URLs for the browser to decode again.
2. Combine movement, light and camera notifications into one mask update per
   animation frame. Reuse the same 96 circle vertices instead of recalculating
   their trigonometry for every light band. The 48 light bands are unchanged.
3. Schedule the renderer's automatic animation callback after the camera's next
   update. Camera-follow movement can replace the fallback render, rather than
   first rendering the old camera and then rendering again with the new camera.
   Camera projection still draws synchronously with the map to avoid adding a
   frame of separation between the map and its miniatures.
4. Add a Performance button to the interactive preview, reporting scene renders
   per second and the actual mist quality/buffer resolution on that device.

The mask and render scheduling changes are in the shared app components, not
only the preview. Publishing the static preview does not deploy the campaign app.

## Controlled comparison

Headless desktop Chrome, 390 x 844 CSS-pixel viewport, device scale factor 3
(the renderer retains its existing cap of 2), and Chrome's 4x CPU slowdown.
Heavy darkness, the same three moving PCs and four monster models, camera
following the party, 6-foot mist at 50% density. Each case samples 5.5 seconds
after loading all models and starting movement. CPU sampling profiling is
enabled for every comparison. Tests run sequentially without other test/build
work during measurement.

These are **requestAnimationFrame cadence measurements, not physical phone
display FPS**. This test does not emulate the Fold GPU, memory bandwidth,
thermal behavior, browser or refresh rate. In particular, unthrottled headless
Chrome can run its callbacks faster than a real display. The phone readings
have not yet been collected.

| Moving player view | Original cadence | Mask reuse/batching | Plus render scheduling | Original p95 interval | Final p95 interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mist off | 5.9/s | 20.3/s | 31.6/s | 194.2 ms | 37.2 ms |
| Drifting mist, interaction off | 3.6/s | 20.4/s | 32.5/s | 340.2 ms | 34.3 ms |
| Drifting mist, movement interaction on | 2.9/s | 19.5/s | 28.7/s | 404.3 ms | 43.5 ms |

The scheduling/vertex-reuse follow-up improved the interacting case by 47.6%
over the mask fix alone in this sample. This is a short diagnostic run, not a
guaranteed frame rate or repeated statistical benchmark. The small difference
between mist-off and drifting-only cases is within run-to-run variability.

The DM view without a personal mask improved from 27.9 to 59.8 callbacks/s.
It is a useful diagnostic comparison, not an identical scene: it can show more
figures because the personal visibility filter is absent. The narrow layout
retained Auto's low mist tier and its 184 x 241 buffer before and after. The
desktop layout retained the high tier and its 571 x 396 buffer.

A separate final-build wide-layout case (840 x 900, DPR 2.5, CPU 4x) measured
27.8 callbacks/s with interaction and a 43.6 ms p95 interval. Its actual stage
still selected Auto's low tier, at 271 x 346. This is a wider-layout stress
case, not the Fold's measured screen configuration. Chrome was 153.0.8010.53.

[Compact measurement receipt](performance/mist-2026-09-28.json). Its
`medianRenderFps` values count actual scene submissions, which were often
roughly twice the callback cadence before scheduling was fixed. They must not
be used to claim the old view was displaying that many distinct frames.

## Verification

- Typecheck and production build passed.
- 933 tests across 100 files passed.
- The real-app personal-darkvision browser test passed using an isolated save:
  two players with different visibility, distant lights revealing occupants,
  regular/heavy darkness, lantern toggles, movement, overhead and effects off.
- A pixel comparison of the native masks against the previous data-URL masks
  found zero changed pixels/channel values in all four frozen cases: regular
  and heavy darkness, each overhead and at 45 degrees. Each compared 595,084
  stage pixels with identical geometry and reduced-motion lighting.
- The public interactive preview passed the narrow-screen check: no overflow,
  no page/asset errors, moving visibility masks, correct viewer switching,
  rotation, zoom and 6-foot mist. A movement sample observed 198 scene renders
  for 198 animation frames, with at most one render per frame.

## Reproduce

From the repository root in PowerShell:

```powershell
node scripts/environment-preview/performance.cjs artifacts/mist-performance.json
node scripts/environment-preview/check-vision-masks.cjs
# Optional wide phone layout: a layout stress case, not hardware emulation.
$env:PERF_WIDE='1'
node scripts/environment-preview/performance.cjs artifacts/mist-performance-wide.json
Remove-Item Env:PERF_WIDE
# Optional narrow phone layout without CPU slowdown.
$env:PERF_PHONE_CPU='1'
node scripts/environment-preview/performance.cjs artifacts/mist-performance-unthrottled.json
Remove-Item Env:PERF_PHONE_CPU
```

`PW_CHROMIUM` overrides the installed Chrome path; `PERF_URL` can point at a
different deployed copy of the same preview. Include `vision=1&benchmark=1`
in its query for vision controls and optional asynchronous GPU diagnostics.
GPU timer readings are diagnostic only: CPU submission gaps can inflate them.

On the physical phone, open the preview, enable **Performance**, select **Mist
movement test**, and press **Move party**. Compare the same route with movement
reaction enabled/disabled and mist on/off. Folded versus unfolded matters: the
larger viewport may choose a different existing Auto tier. Model loading time
and steady-state rendering are separate; these runs excluded initial download.

## Remaining limits

The three full-detail player models contain about 2.92 million triangles and
123.29 MB of GLB assets combined. Their render cost and the wide viewport's
pixel count remain relevant on a phone. This work deliberately does not reduce
geometry, textures, mist quality or shadows. Further batching/caching should
be guided by a profile of the physical phone; model simplification, lower
resolution or fewer mist samples would be separate quality tradeoffs.
