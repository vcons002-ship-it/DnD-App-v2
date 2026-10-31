# Legacy color parity and local rendering cost

Legacy server-managed rendering grades map artwork to grayscale in darkness and uses a separate visibility mask. The previous unassisted path applied a dark overlay to the original color image. Toggling server management could therefore change the color and brightness of darkvision, lit areas, and remembered terrain.

The local path now retains a graded map canvas and applies local sight/light masks. Grid, manual fog, decals, and tokens remain above the graded map; concealed areas remain covered. Light masks are combined with sight in SVG rather than intersecting each polygon in JavaScript. The sight clipping area is buffered across ordinary panning.

In a Chrome pixel comparison with a colored map, a PC, two lights, and a wall, assisted versus local RGB samples were: darkvision `100,100,101` versus `99,99,100`; lit terrain `212,116,37` in both; unseen terrain `5,6,8` in both; remembered terrain `26,27,28` versus `25,26,27`. Red, green, and blue darkness samples differed by at most two RGB levels; sampled grid and token colors matched. Player and DM Player-view checks passed for heavy darkness, dim light, a lamp behind a wall, manual fog, remembered terrain, and map vision disabled. This is a targeted comparison, not a certification of every map asset, browser, or spell effect.

## CPU comparison

Four alternating before/after/after/before trials used the same server, one unassisted Legacy player, a 1800×1200 image, 28 walls, 48 lights, a 1440×960 viewport, and 6× Chrome CPU throttling applied after startup. The server was unrestricted on the same Ryzen 7 7800X3D / RTX 5090 PC. Each run had two real token drags and three samples of four real pan drags. Drag acceptance and actual camera position changes were checked. CDP recorded elapsed time and browser main-thread and script time; each token sample includes a fixed 600 ms wait. No trace, recording, WAN delay, RAM cap, or old-integrated-GPU simulation was used. [All samples](legacy-color-parity-2026-10-31.json) and the [benchmark](../../e2e/legacy-color-performance.spec.ts) are retained.

| Measurement | Before median (mean) | After median (mean) | Interpretation |
| --- | ---: | ---: | --- |
| Four-pan sample: elapsed | 1,692 ms (2,308 ms) | 2,184 ms (2,317 ms) | Median 29% longer |
| Four-pan sample: main-thread time | 1,257 ms (1,698 ms) | 1,525 ms (1,546 ms) | Median 21% higher |
| Four-pan sample: script time | 630 ms (828 ms) | 729 ms (746 ms) | Median 16% higher |
| Token drag: elapsed, including wait | 896 ms (935 ms) | 883 ms (1,208 ms) | Median 1% lower |
| Token drag: main-thread time | 568 ms (580 ms) | 577 ms (759 ms) | Median 2% higher |
| Token drag: script time | 337 ms (353 ms) | 392 ms (526 ms) | Median 16% higher |

These are six pan samples and four token samples per version, not a broad hardware benchmark. The before pan run and after token run each contained a large outlier, so means and medians differ substantially. The extra local canvas and map overlay layer cost CPU/memory; the median pan was slower in this fixture. Server-managed rendering does not use this local grading path, but its performance was not rebenchmarked here. A prior draft recomputed light intersections on every camera event and was much slower; that version was discarded. This result does not establish performance on Safari, a specific old CPU or integrated GPU, or initial map load.
