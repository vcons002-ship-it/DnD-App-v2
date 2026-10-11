# Spell-impact rendering comparison

11 October 2026. Before: Main 0de8d53. Candidate: codex/spell-impact-vision-cache.

Fixed Balanced preset, heavy darkness, 30 placed tokens (about 21 visible), 23 walls, six placed lights, three lanterns, strong 8 ft mist, rain and embers. Real headful Chrome; actual AMD integrated / RTX 5090 adapters verified. 1440 x 760 map viewport, DPR 1, 45 degree view. Three repeated impacts per spell; six targets for Fireball and Hail of Thorns, one for Shocking Grasp. Identical cosmetic fx:hp packets replayed into the production client socket boundary. Only frames with active impacts are measured for spell rows. No dice, recording, CPU profiler or DOM mutation observer in these runs. This isolates rendering and does not replace real combat correctness tests. Paired single-session measurements include ordinary background variation and cold first-use work; these are not hardware guarantees.

| GPU | Phase | Before FPS | After FPS | Change | p95 frame ms before / after |
|---|---|---:|---:|---:|---:|
| RTX 5090 | idle | 58.4 | 59.4 | 1.7% | 19.5 / 19.5 |
| RTX 5090 | Fireball | 44.0 | 44.3 | 0.8% | 34.2 / 33.6 |
| RTX 5090 | Hail of Thorns | 44.6 | 45.1 | 1.0% | 34.0 / 33.6 |
| RTX 5090 | Shocking Grasp | 54.4 | 55.0 | 1.2% | 21.7 / 19.8 |
| AMD integrated | idle | 43.4 | 42.7 | -1.6% | 31.6 / 31.0 |
| AMD integrated | Fireball | 16.1 | 18.3 | 13.8% | 91.8 / 81.2 |
| AMD integrated | Hail of Thorns | 16.5 | 17.3 | 4.6% | 86.3 / 84.4 |
| AMD integrated | Shocking Grasp | 25.1 | 26.8 | 7.0% | 55.4 / 61.3 |

Large-impact gains are modest on integrated graphics and mostly neutral on the 5090. Idle integrated FPS also varied downward in this pair; these data do not establish an overall FPS improvement. The map remains at full quality during all impact frames. The intentional 12 FPS dice-time map cap is excluded. Spell effect geometry, illumination samples, models, attenuation bands and visibility rules are unchanged. Retained masks reuse clip nodes and projected band geometry and batch changed mask markup. Ordinary-light and GPU sight-cover updates retain their approximately 15 Hz cadence while cosmetic spell flashes remain frame-driven. Camera, movement and server updates refresh immediately.

Regression validation: 2002 unit tests, nine focused browser checks, typechecking and production build passed. Browser checks compare old/new rasterized mask pixels, retention, expiry, zero-contribution skips, clip updates, camera/movement and immediate door invalidation. Gameplay timing is verified separately through real Cure Wounds, Hail of Thorns, Ensnaring Strike, Hunter's Mark and Fire Bolt controls and rolls. Floating damage numbers use one elapsed-time animation rather than delayed timers, preserving their existing easing and lifetimes while preventing overlap after a blocked frame. A browser test also covers mounting after a number has already expired. Live campaign data and installed runtime are unchanged.
