# Roll hold preparation and floating totals - 11 October 2026

## Result

Outlined/shadowed floating text was a major sustained cost in the tested scene.
After all transient spell geometry/light had expired, six totals still brought
integrated-GPU FPS down to 19.2. Disabling only their number-layer draw raised
that phase to 46.6, with the same full spell lighting, darkvision and environment.
Caching the native-resolution text and skipping unchanged total redraws keeps
those numbers visible at 44.0 FPS. During the Fireball itself, FPS rises from
19.9 to 37.0; the scene remains about 47 FPS after the labels disappear.

No font sizes, colors, outline widths, shadows, rise, count-up, hold or fade
lifetimes were reduced. Camera and token movement still update the anchors.

## Integrated-GPU measurements

| Phase | Before FPS | Cached FPS | Frame p95 ms before / cached |
| --- | ---: | ---: | ---: |
| Plain numbers: rise/count | 19.9 | 43.6 | 76.2 / 32.8 |
| Plain numbers: totals remain | 18.3 | 45.0 | 76.9 / 30.9 |
| Fireball + numbers | 19.9 | 37.0 | 78.1 / 46.4 |
| Fireball ended, totals remain | 19.2 | 44.0 | 68.2 / 31.9 |
| After numbers disappear | 46.3 | 46.9 | 30.2 / 29.7 |

Same fixed Balanced heavy scene: 30 placed / about 21 visible tokens, 23 walls,
six placed lights, three lanterns, heavy darkness, strong 8 ft mist, rain and
embers. Verified AMD Radeon integrated adapter, 1440 x 760 battlefield, DPR 1,
45-degree view. Three repetitions per mode, no recording or profiler.

Six cosmetic damage messages are replayed at the real client socket boundary,
without applying campaign HP. This isolates presentation work; actual spell
controls are tested separately in a disposable dungeon. Effect phase is the
first 1.5 seconds; total-only is 1.8-4.8 seconds; finished is 5.4-8 seconds.
The total-only samples assert zero active spell effects. The diagnostic number
layer override is used only by the measurement harness and is not shipped.
Single paired runs include ordinary background/system variation.

## What preparation does

At the beginning of the existing physical-roll reading hold, restore raster
resolution and format held labels. Build spell geometry/materials in a detached
scene, compile shaders asynchronously and upload their actual buffers in a tiny
offscreen pass. Prepare bounded wall-light geometry and detached SVG darkvision
light clips. Retry dice themes whose session preloading was interrupted.

Prepared visuals stay invisible. Their full animation lifetime starts on actual
release/skip, and live positions, wall/camera changes and animated light sample
positions are checked again. Max 16 prepared spell effects / 24 light samples;
stale resources are disposed. This shifts first-use allocations and does not
eliminate the recurring cost of full spell illumination, mist or vision.
Native text raster caches are created when labels mount; only their formatted
payloads are staged during the hold. The server's rolls/HP are not changed.

The raster/geometry-only comparison before the text fix warmed six meshes per
roll and moved full raster restoration from approximately 0.6 to 2.6 seconds
before effect release. Mean worst handoff frame changed only from 113.6 to
107.5 ms; preparation alone did not solve the sustained dip. Do not compare
these full-lighting measurements with the older diagnostic-overlay study.

## Skip behavior

Skipping never waits for compilation. Ready resources are reused; missing work
uses the normal render path. Late compilation callbacks cannot hide or replay
an activated effect. Approval of private DM results remains separate.

Real server 8d6 rolls, six correlated cosmetic impacts, verified RTX 5090:

| Reading-hold case | Skip to first effect | Meshes built / reused | Effect phases |
| --- | ---: | ---: | ---: |
| normal | Normal release | 6 / 6 | 1 |
| early-skip | 27.0 ms | 6 / 6 | 1 |
| prepared-skip | 17.7 ms | 6 / 6 | 1 |

These live skips occurred within the reading hold with prepared resources.
A focused browser regression also releases before warmup is complete and before
any preparation exists, checking immediate activation and safe late callbacks.
All three live runs leave zero prepared effects; no browser errors.

## Review

[Normal hold and skips video](https://dnd.nic024i.app/uploads/previews/roll-hold-preparation-20261011/index.html)

Video is actual Windows Graphics Capture at 60 fps, AV1 NVENC on RTX 5090 with
a mobile H.264 copy. It shows real server physics dice and correlated cosmetic
Fireball presentation events, rather than claiming a scripted replay is a real
Fireball cast. Measurements above exclude capture overhead. The installed
campaign/server are not changed.

Focused browser checks cover offscreen preparation, GPU warmup, reuse without
rebuilding, full lifetimes, invisible staged masks, stale/private-roll guards,
skip during compilation, floating total caching, count-up/fade clocks and
moving anchors. Actual Hail of Thorns, Ensnaring Strike, Hunter's Mark and Fire
Bolt controls verify illumination/timing/privacy in a disposable dungeon.
