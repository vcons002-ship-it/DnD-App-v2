# Dice background handoff test - 11 October 2026

The battlefield prepares its full raster 500 ms before the existing impact release,
while the tray is still showing results. It keeps the 12 FPS background cap until
the roll releases its effects. No extra reading time or roll delay is introduced.

## Matched integrated GPU comparison

Windows Chrome, verified AMD Radeon integrated graphics via ANGLE/D3D11.
Balanced preset, DPR 1, 1440 x 760 battlefield, 45 degree view, heavy darkness,
30 placed creatures (about 21 visible), 23 walls, six lights, three lanterns,
8 ft mist at 0.7 strength, rain and embers. Three actual server 8d6 physics rolls
per version. Six visibility-filtered cosmetic Fireball impacts were correlated
with each real roll ID. This tests the real presentation handoff, not Fireball
rules/HP calculation. Campaign HP was not modified.

The before/after comparison uses the same simpler spell-overlay mode to isolate
raster preparation. Before: a7b0937. After: this change with
`&spellColorOverlay=1`. The default game retains full spell illumination.
No video capture, CPU profiling, or DOM mutation observer ran during measurement.

| Measurement | Before | After |
|---|---:|---:|
| Resolution restore before first effect (ms) | 185.9 | 609.1 |
| Longest frame near impact, mean of 3 runs (ms) | 153.4 | 119.2 |
| Mean frame interval near impact (ms) | 66.4 | 53.0 |
| Active impact FPS | 15.6 | 15.3 |

Frame intervals come from browser requestAnimationFrame, not GPU execution time.
"Near impact" is from 150 ms before to 500 ms after the first active effect frame.
The longest intervals were 180/147/133 ms before and 121/123/113 ms after.
This small sample suggests a smoother handoff, not a guaranteed FPS gain across
hardware. The resize moved roughly 0.6 seconds before the first effect. The
longest boundary interval fell about 22% on average; sustained effect FPS did
not improve. Resize work still exists, but takes place behind the tray earlier.

Raw evidence: `D:/dnd-approved-release/roll-background-prewarm-20261011/`:
`before-igpu.json`, `after-igpu.json`, and `transition-bench.mjs`.

## Visual features retained and their costs

Full spell illumination and local darkvision color restoration remain normal
behavior. Balanced is restored to directional figure illumination. Low keeps its
ground-sampled figure budget. The simpler overlay is only a diagnostic alternative.

Earlier fixed-preset effect tests, without dice handoff, showed:

| Effect | iGPU full/ground to overlay FPS | 5090 full/ground to overlay FPS |
|---|---:|---:|
| Six Fireball impacts | 17.7 to 18.0 | 43.3 to 51.0 |
| Six Hail of Thorns impacts | 16.5 to 17.7 | 48.7 to 55.1 |
| One lightning impact | 26.4 to 29.5 | 54.9 to 54.5 |

Those comparisons include both mask and illumination changes, so they do not
separately attribute FPS gains to each feature. Spell-mask JavaScript p95 dropped
from roughly 9.5-9.8 ms to 0.7-1.1 ms on iGPU and 7.5-8.0 ms to 0.7-0.8 ms on
5090 for the larger bursts. This excludes SVG painting/compositing costs.
Removing nearby figure spell lighting alone did not produce a consistent
same-preset overall speedup. Therefore neither visual feature is removed from
the normal High/Balanced game. Results are kept for later performance decisions.
See [ground lighting tests](GROUND_LIGHTING_PERFORMANCE_2026-10-11.md) and
[overlay tests](SPELL_COLOR_OVERLAY_PERFORMANCE_2026-10-11.md).

## Verification

Browser checks cover raster preparation before impact, original impact timing,
immediate skip, stale/replaced roll protection, private approval protection,
default spell grading without sight expansion, wall clips, expiry, and the actual
player spell/hit-feature flow in a disposable heavy-darkness dungeon.
