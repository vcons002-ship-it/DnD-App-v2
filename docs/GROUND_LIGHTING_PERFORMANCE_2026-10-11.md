# Ground lighting performance — 11 October 2026

This experiment did not produce a consistent overall FPS improvement over the previous same-preset lighting. Low is faster than High as a whole preset; the lighting simplification alone was mostly neutral, with mixed Balanced results.

Candidate uses ground-only spell lighting on Balanced and ground-sampled figure lighting on Low; High retains directional lighting.

[Video and measurements](https://dnd.nic024i.app/uploads/previews/ground-lighting-performance-20261011/index.html)

| GPU | Preset | Ordinary lighting FPS | Fireball FPS | Hail of Thorns FPS | Shocking Grasp FPS |
| --- | --- | ---: | ---: | ---: | ---: |
| Integrated Radeon | high | 35.8 | 16.0 | 16.2 | 23.8 |
| Integrated Radeon | balanced | 40.4 | 17.7 | 16.5 | 26.4 |
| Integrated Radeon | low | 48.1 | 19.6 | 18.9 | 28.7 |
| RTX 5090 | high | 54.6 | 41.8 | 45.6 | 55.1 |
| RTX 5090 | balanced | 55.9 | 43.3 | 48.7 | 54.9 |
| RTX 5090 | low | 54.6 | 45.4 | 47.3 | 53.9 |

Uncaptured production renderer, fixed presets and verified WebGL adapters. Same isolated heavy scene and three repetitions per spell. Identical visibility-filtered cosmetic fx:hp packets replayed at the app socket boundary; dice and gameplay randomness excluded.

Thirty placed tokens (about 21 visible), 23 walls, six lights, three lanterns, strong 8 ft mist, rain and embers, heavy darkness, 1440 x 760 map viewport, DPR 1, 45-degree view. No dice, recording or profiler in measurements. Whole-preset comparisons include existing model, shadow and particle differences. Same-preset before/after measurements and p95 intervals are on the linked report. Single paired runs include background variation and are not hardware guarantees.

Videos use real Windows Graphics Capture frames at 60 fps, AV1 NVENC on RTX 5090, with H.264 copies for phone playback. Their HUD readings include capture overhead and are separate from the table.

Validation: 2,004 unit tests, eight focused browser checks, typechecking and production build passed. Isolated data; no live campaign changes.
