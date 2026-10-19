# Two model tiers per graphics preset - 18 October 2026

Character model downloads now use two tiers per resolved graphics preset:

| Preset | Distant, hidden or off-screen | Large on-screen close-up |
|---|---|---|
| High | Low | High |
| Balanced | Low | Balanced |
| Low | Battlefield | Low |

Auto follows its currently resolved preset. Switching presets can accumulate
additional cached tiers; this change does not purge previous browser caches.
Existing custom uploads and creature sculpts keep their existing definitions.
All character tiers still share their exact textures, bases, attachments and FX.

## Hardware comparison and visual review

We tested the proposed High/Balanced and Balanced/Low pairs against lighter
distant geometry. The difference remains useful on integrated graphics, even
though the figures look similar at map distance. High quality settings remained
unchanged throughout each High comparison; only Druk, Varis and Vanec geometry
varied. Monsters used the same assets in every case.

| High preset, distant character geometry | AMD integrated: stationary / moving | RTX 5090: stationary / moving |
|---|---:|---:|
| High | 24.8 / 22.7 FPS | 60.2 / 75.8 FPS |
| Balanced | 29.0 / 26.1 FPS | 59.5 / 81.2 FPS |
| Low | 31.0 / 28.5 FPS | 60.2 / 75.9 FPS |
| Battlefield | **32.6 / 29.9 FPS** | **60.3 / 75.4 FPS** |

Battlefield improved integrated movement FPS about 15% over Balanced, and
about 32% over High geometry. In the separate Balanced-preset comparison,
Battlefield improved stationary/moving FPS from 37.7/34.0 to 42.6/39.1 versus
Low geometry. The original performance-first policy used Battlefield as the
common distant model. Subsequent visual review found artifacts in that sculpt,
so High and Balanced now use Low as their minimum. Low graphics retains
Battlefield for its performance savings. The two-model download limit remains.

The 5090 shows no consistent benefit in displayed FPS. The renderer normally
limits stationary painting to roughly 60 FPS; movement invalidations request
additional frames. That explains moving FPS exceeding stationary FPS. These
measurements do not establish maximum uncapped GPU throughput. The separately
recorded RAF timings in the JSON are browser callback intervals, not GPU timings.

## Test conditions and limits

Real headful Chrome, 1440x960 CSS pixels, DPR 1, a 45-degree player MapStage in a
disposable campaign with 30 placed tokens (28 rendered miniatures), 23 walls,
six lights, three lanterns, heavy darkness, 8-foot mist at 65%, rain and embers.
Each case had two passes, with seven seconds stationary and seven seconds of
repeated lantern-bearing Vanec movement. WebGL adapter strings verified AMD
Radeon integrated graphics and NVIDIA RTX 5090. No recording ran during timing.

These are map-renderer results, not a full-HUD/dice benchmark or a guarantee for
other maps/devices. Fitting the cold scene sometimes ran before the test player
claim and large assets were ready. Samples with fewer than 500,000 color
triangles were rejected; refitting and requiring a complete scene fixed that
fixture issue. The 5090 Balanced comparison was repeated after clearing a
previous test player's protected claim. Only complete-scene samples are included.
Different passes can have slightly different visible triangle counts during
mist/scene animation; full recorded diagnostics accompany every sample.

- [Integrated results](performance/two-tier-miniatures-2026-10-18/igpu.json)
- [RTX 5090 results](performance/two-tier-miniatures-2026-10-18/rtx5090.json)
- [Viewport/download assertions](performance/two-tier-miniatures-2026-10-18/viewport-qa.json)

## Loading and visibility behavior

Preloading prepares only the preset's distant geometry (Low for High/Balanced,
Battlefield for Low). A figure can request its close
tier only when its projected size warrants it and its full model bounds
intersect the actual camera frustum. Checking the whole bounds covers visible
heads/weapons even when the base is just off-screen. Fog-hidden figures cannot
upgrade. Bounds checks reuse existing measurements and scratch math objects;
they add no rendering pass, pixel readback or mesh traversal per check.

Camera changes now check detail decisions at most every 80 ms during zoom;
close art prepares before its display threshold. The existing 15% size
hysteresis plus a 350 ms downgrade dwell prevent repeated swaps. Both prepared
tiers are reused while on-screen; the inactive body is detached from the scene.
See [zoom preparation and repeated-zoom tests](LOD_ZOOM_PREPARATION_2026_10_18.md).
The coarse figure remains visible while detail loads. A close-tier load can
fall back only to the same preset's distant tier; a failed distant file cannot
silently fetch a dense off-screen replacement or drop below the visual floor.

The real-renderer network test, in each of High/Balanced/Low, verified:

1. Three characters preload exactly three distant-tier GLBs for that preset.
2. Zooming with Druk concealed downloads nothing further.
3. Revealing the zoomed Druk adds only his selected close tier.
4. Panning to Varis adds only his close tier; off-screen Vanec stays coarse.
5. Moving Vanec into that viewport adds his close tier.

Each preset requested exactly six unique GLBs for three characters, all from
its two tiers, with no browser errors. The thresholds remain 300/180/100 CSS
pixels of projected base diameter for High/Balanced/Low respectively. Shared
texture URLs and persistent HTTP/service-worker caching still apply across maps.

The original linked measurements remain historical. The updated visual-floor
loading, continuous zoom and rapid-reuse assertions are in
[this current-policy run](performance/low-model-floor-2026-10-18/loading.json).

## Repeating the tests

Use an isolated preview server with its own save and uploads. Run from repo root.
Create a fixture with the existing `create-character-lod-gameplay.mjs` helper,
using `LOD_BENCH_SERVER` and `LOD_BENCH_SECRET` for that disposable server.
The private fixture contains the test DM secret; builders publish only campaign
code and character IDs, never the secret.

```powershell
node scripts/performance/build-two-tier-loading.mjs <preview-data>/uploads/two-tier-lod
$env:LOD_LOADING_URL='http://localhost:4374/uploads/two-tier-lod/'
node scripts/performance/test-two-tier-miniatures.mjs

node scripts/performance/build-two-tier-gameplay.mjs <preview-data>/uploads/two-tier-perf <private-fixture.json>
node scripts/performance/benchmark-two-tier-miniatures.mjs <private-fixture.json> --high-only
node scripts/performance/benchmark-two-tier-miniatures.mjs <private-fixture.json> --high-only --nvidia
```

`CHROME_PATH`, `IGPU_LUID`, `NVIDIA_LUID` and `LOD_BENCH_RESULTS` override local
defaults. `--candidate balanced` filters to one geometry case; `--reference-only`
tests full High geometry. The gameplay builder's query-based far-tier override
exists only in its isolated benchmark bundle, never the application build.
