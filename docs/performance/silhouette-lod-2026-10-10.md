# Silhouette borders and distance-based miniature detail

Affinity borders now sample the existing body/depth mask instead of rendering
another model shell. A per-instance palette index preserves individual creature
colors in batches. Only external edges receive a border; thin weapons and
foreground bodies suppress it. Scissors restrict the filter to figure bounds.
The mask's personal-visibility and coverage channels remain unchanged.

Druk, Varis and Vanec have additional battlefield copies with 51,832, 74,034
and 58,441 triangles respectively. Together they contain 184,307 triangles,
93.7% fewer than the originals. Textures remain byte-exact; materials, animation
channels, transforms and base measurements are preserved. Geometry reduction
is lossy, so these copies are intended for small on-screen figures.

The runtime measures projected base diameter in CSS pixels. Detail advances at
100, 180 and 300 pixels, with 15% hysteresis. The chosen graphics preset remains
the maximum detail: Low, Balanced or original at High. Auto uses its resolved
preset. The current model stays visible while the replacement is prepared.
Small figures preload battlefield assets; retired higher-detail GPU assets are
released. Monster models already have much smaller geometry and are unchanged.

## Integrated GPU comparison

Before: merged revision `8241e8bc`. After: its `codex/silhouette-outlines-distance-lod`
implementation. Ryzen 7 7800X3D integrated AMD graphics, verified through ANGLE
D3D11 adapter 0x164E, 1440 x 900 / DPR 1. The RTX 5090 did not render these runs.
This desktop's small integrated GPU is not representative of every laptop.

Matching disposable campaigns have three player figures, six creatures, 23 walls,
three carried lanterns, two placed lights, player vision and 45-degree perspective.
Eight figures are visible in the measured view. Mist is 3 ft high at 35% opacity.
Assets are warm; each stationary sample lasts 12 seconds and movement samples
contain three actual click-and-drag moves. No recording or other benchmarks run
during measurement. Separately generated creature IDs can select different minor
model variants; the family/count/layout and environment configuration match.

| Scenario | Balanced before / after FPS | High before / after FPS |
| --- | ---: | ---: |
| Daylight, stationary | 44.3 / 57.1 | 28.6 / 49.1 |
| Daylight, movement | 37.0 / 56.4 | 23.7 / 41.7 |
| Dim dungeon, lantern movement | 31.0 / 50.6 | 19.0 / 34.8 |
| Heavy darkness, stationary | 38.6 / 55.4 | 23.5 / 41.4 |
| Heavy darkness, lantern movement | 32.7 / 50.7 | 20.1 / 36.0 |
| Heavy darkness, camera rotation and zoom | 37.6 / 51.8 | 22.0 / 38.2 |

FPS counts miniature scene draws over the sample; it is not video encoding FPS.
Camera gestures can schedule extra draws, so browser frame intervals are recorded
separately in the accompanying JSON. Single passes demonstrate this workload,
not a guaranteed frame rate across maps or devices.

In Balanced heavy-darkness movement, median WebGL GPU time fell from 16.52 to
8.84 ms and the 95th-percentile scene draw interval from 57.8 to 34.1 ms. High
fell from 32.19 to 14.85 ms and 73.8 to 51.8 ms respectively. Main color drawing
fell from approximately 2.1 million triangles on Balanced / 6.0 million on High
to approximately 272,000. This is the color scene only, not total geometry across
all depth, shadow and mist passes. Results measure both changes together.

## Repeatable assets and review

```powershell
node scripts/token-assets/reduce-characters.mjs D:/battlefield-candidates --battlefield
node scripts/token-assets/install-battlefield-lod.mjs D:/battlefield-candidates
node scripts/token-assets/validate-battlefield-lod.mjs
node scripts/token-assets/build-reduction-review.mjs D:/battlefield-candidates --battlefield
```

Generation starts from the approved Low copies, including Varis' refined weapons.
Attribute-weighted Meshoptimizer simplification targets 12% body and 25% detail
geometry with a 0.004 error limit. Its permissive mode can cross attribute seams;
borders remain locked and small pieces, eyes, lightning, repairs and wrist
transitions remain intact. Export receipts audit texture hashes, transforms,
material definitions, animations, finite vertices and index validity. Original
and prior quality GLBs remain intact. Prebuild validates the shipped copies.

[Interactive shape comparison](https://dnd.nic024i.app/uploads/previews/silhouette-lod-20261010/index.html)
supports synchronized rotation, zoom and character selection. It uses studio
lighting and is a shape review, not a mobile battlefield performance benchmark.
Normal-distance side-by-side views were inspected for all three characters.

Browser regressions cover thin-blade suppression, overlapping bodies, distinct
instanced border colors, visibility-mask channels, name occlusion, cached masks,
quality ceilings, base selection and zoom switching without a 2D flash.
Raw measurements and the test harness are retained under
`D:/dnd-approved-release/outline-lod-20261010`; summarized measurements are in
[`silhouette-lod-2026-10-10.json`](silhouette-lod-2026-10-10.json).
