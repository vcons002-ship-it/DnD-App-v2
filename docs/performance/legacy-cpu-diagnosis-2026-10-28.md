# Legacy player CPU diagnosis and raster-mask feasibility

Measured 2026-10-28 using disposable campaigns. Raw measurements and profile summaries: [JSON receipt](legacy-cpu-diagnosis-2026-10-28.json). No production rendering behavior was changed by this investigation.

## Finding

The largest identifiable application hotspot is redrawing the Konva canvas scene, especially token artwork, names, bars and badges. A token move causes its layer to be drawn again; unchanged tokens on that layer still have their constituent shapes traversed and painted. React memoization preserves components but does not cache their painted pixels.

Server vision geometry is not the main measured remaining bottleneck. Suppressing SVG mask painting did not improve this sample; suppressing token artwork, with the separate token hit regions and the real movement commands preserved, reduced combined client main-thread task time by 32% and median sight-update latency by 34%. This is a diagnostic isolation experiment, not a usable renderer or a promise of an equivalent optimized-renderer speedup.

There is also a substantial native/unattributed browser component in the CPU samples. Do not assign all of that time to SVG, token rendering or JavaScript based on the sampled stack alone. Native canvas/compositor work, CPU-throttling behavior and other browser tasks are included. Token drawing is the largest specifically identified application cost, not a complete attribution of every busy millisecond.

## Benchmark instrumentation correction

The earlier performance specs inherited Playwright `trace: retain-on-failure`. That setting records DOM snapshots around automation actions even when the test ultimately passes. Profiling found injected `captureSnapshot` / `visitNode` work: approximately 2.7–2.8 seconds of sampled stack time per player in the instrumented diagnostic run. The earlier absolute timings therefore include more automation overhead than the original receipts described. Their functional passes and traffic measurements still stand; they are not pure unassisted-player latency measurements.

Performance specs now disable Playwright tracing by default. The clean profile and isolation runs also disable video. Diagnostic CDP profiling is separate from the non-profiled isolation measurements. The raw historical receipts were preserved, with follow-up notices linking here.

## Profiles

Two players, each with 20x browser CPU throttling, in the same 143-token / 48-light / 28-wall room as the prior test. GPU and accelerated Canvas2D are disabled, WebGL blocked. Server CPU is unthrottled. Players perform six alternating actual drags. Browser CPU/trace capture adds overhead; these profile timings should not be compared directly with the unprofiled table below.

In the clean JavaScript profiles, sampled stacks containing Konva canvas redraws account for about 9.48 seconds for player 1 and 8.81 seconds for player 2. React/reconciliation/scheduler self samples account for about 1.28 and 1.08 seconds respectively. These are throttled sampled wall-clock durations, not a percentage of a physical CPU core.

Main hot paths map to:

- `konva/lib/Layer.js:248` (`drawScene`), `Container.js:200` (`_drawChildren`) and `Shape.js` drawing/context operations.
- `client/src/canvas/TokenShape.tsx`: many individually painted bodies, labels, health bars and badges.
- `client/src/canvas/MapStage.tsx`: layer redraws and authoritative token-position synchronization. The map, grid and fog still have Canvas2D drawing paths.

Hit testing is already separated: the token artwork group has `listening=false`; `token-hit-region` is the body-shaped hit-only node. Making decorative art non-clickable alone does not eliminate its painting cost. The map background also has pan handling, and doors/decals can have player interactions; those are not required by the proposed tokens-only battlefield input model.

Full CPU profiles, CDP traces and matching source maps are saved in `artifacts/legacy-cpu-profile-clean-20261028/`. Source-map analysis can be reproduced with:

```powershell
node tools/analyze-legacy-profile.mjs artifacts/legacy-cpu-profile-clean-20261028 artifacts/legacy-cpu-profile-clean-20261028/sourcemaps
```

## Rendering isolation

Playwright trace, video and CPU profiling are all disabled for this table. Each condition uses two separate browser contexts at 20x slowdown and the unrestricted server. Each performs six alternating real drags. Conditions use the same room and route, sequentially; there are only three samples per player per condition. Variance and order effects remain possible.

| Diagnostic condition | Combined main-thread task time | Median drop-to-sight update, six moves |
|---|---:|---:|
| Normal Legacy drawing | 38,328 ms | 2,566.5 ms |
| SVG mask painting hidden; DOM/path updates retained | 42,627 ms | 2,773.5 ms |
| Token artwork painting suppressed; token hit regions retained | 26,075 ms | 1,697 ms |

Hiding the mask is not a solution: it removes concealment and is used only in this isolated diagnostic campaign. Hiding token artwork is also not a product change: tokens become invisible, though their input regions remain. These tests establish which drawing work matters, rather than measuring a completed replacement renderer.

Results: `artifacts/legacy-render-isolation-20261028/results.json`. Reproduce by setting the normal server-offload test variables plus `SERVER_OFFLOAD_NO_VIDEO=1`, `SERVER_OFFLOAD_PROFILE=0`, `SERVER_OFFLOAD_ABLATIONS=1`. For profiling instead, set `SERVER_OFFLOAD_PROFILE=1` and leave ablations disabled. Optional `SERVER_OFFLOAD_PLAYWRIGHT_TRACE=1` restores the original automation recorder for instrumentation comparisons only.

## What still runs locally

- Socket message decoding, delta application, state subscribers and React UI updates.
- Canvas map/tile drawing, grid and manual fog drawing when affected layers redraw.
- Token artwork, text, bars, badges, selection and private drag-preview painting.
- Token hit testing, pointer/drag handling, pan/zoom transforms and browser event dispatch.
- Parsing and painting the server-supplied SVG mask paths, clipping, alpha compositing and final display.
- Contextual UI work such as targeting/range helpers and nearby-door visibility when those features are active. Not every optional helper was moved to the server.

The accepted-position sight/light/affinity tests and advisory movement-preview geometry use the new server path. Legacy does not load the miniature renderer/models or run the standard atmospheric/dice/effect scenes. The compatibility path still computes Legacy geometry locally if connected to an older server.

## Raster-mask proof of concept

An actual 1440 x 825 authorized player SVG mask was rasterized offline by Node/Sharp on the unthrottled host. Two warmups and seven sequential encode samples per format/size. This measures SVG parsing, rasterization and encoding, not transport latency. Lower resolutions are a quality experiment, not a production concealment policy.

| Mask image | Encoded bytes | Median server raster/encode | Median image decode on 20x client |
|---|---:|---:|---:|
| 1440 x 825 PNG | 84,047 | 33.15 ms | 14.9 ms |
| 1440 x 825 lossless WebP | 26,328 | 56.96 ms | 11.3 ms |
| 960 x 550 PNG | 49,106 | 20.05 ms | 9.6 ms |
| 960 x 550 lossless WebP | 17,538 | 31.35 ms | 9.0 ms |

The client display prototype uses an Image/Blob URL, asynchronous `image.decode()` and two RAF display opportunities, with GPU/accelerated Canvas2D disabled. At full resolution the first PNG decode took 43 ms and the first WebP decode 17.4 ms. Repeated static content can benefit from browser caches; these isolated decode numbers are not dynamic-mask end-to-end app performance. Adding two RAF opportunities gives median totals of about 32 ms for both full-resolution formats. Network, Socket.IO, state application and token rendering are excluded.

At two full-resolution mask updates/second, this sample's lossless WebP payload would be about 52.7 kB/s per player, excluding protocol overhead. Actual masks vary. Tools and results:

- `tools/benchmark-mask-raster.mjs`, `tools/benchmark-raster-display.mjs`.
- `artifacts/legacy-mask-raster-20261028/results.json`, `display-results.json`, and the generated mask images.

Sharp supports SVG input and PNG/WebP buffers: [output documentation](https://sharp.pixelplumbing.com/api-output/). Browser image decoding/display remains local even when pixels are produced on the server; [ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap) is another asynchronous bitmap preparation option.

## Recommended lightweight player renderer

1. Render map/fog/lighting as noninteractive image layers. Update a server-rasterized, viewer-specific fog/light image only when its revision changes, initially capped at 1–2 Hz. Send binary image data rather than large base64 JSON strings; install only the latest matching frame/position revision.
2. Replace repeatedly painted token shapes/text with cached token sprites, invalidated only when appearance changes. A local bitmap cache is the smaller intervention; server-produced sprites or a server-composited battlefield frame could further reduce client work. Movement updates change only position and selection, not every token's artwork.
3. Keep a small token interaction layer: authorized IDs, positions, body hit bounds, selection and a simple private drag marker. The map/fog imagery can be completely noninteractive while token clicks still open the existing character/actions UI. Pan/zoom can transform the image and hit layer together.
4. Keep standard/3D rendering available for stronger clients. A Legacy DM can use the same basic image background with local editing handles when editing walls/lights.

A mask-only image stream is technically feasible, but the isolation measurements do not show it addressing the main drawing cost by itself. Flattening/caching token artwork is the priority supported by this run. Combining server-rasterized backgrounds with cached token sprites and token-only input is a plausible replacement architecture; it has not been implemented or benchmarked end to end here.

The normal production client bundle was rebuilt after profiling, removing diagnostic source maps from the served build. No live DnDServer restart or live-campaign mutation was performed.
