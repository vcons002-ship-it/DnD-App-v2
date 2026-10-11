# Cosmetic spell overlay - 11 October 2026

Spells no longer modify darkvision masks or the ground/figure light field. Soft colored flashes are composited above grading and clipped by existing visibility. Ordinary lamps are unchanged.

[Video and measurements](https://dnd.nic024i.app/uploads/previews/spell-color-overlay-20261011/index.html)

| GPU | Phase | Before FPS | Overlay FPS | Vision JS p95 ms before / after |
| --- | --- | ---: | ---: | ---: |
| Integrated Radeon | idle | 40.4 | 42.2 | 0.8 / 0.8 |
| Integrated Radeon | Fireball | 17.7 | 18.0 | 9.8 / 1.1 |
| Integrated Radeon | Hail of Thorns | 16.5 | 17.7 | 9.5 / 0.7 |
| Integrated Radeon | Shocking Grasp | 26.4 | 29.5 | 1.0 / 0.8 |
| RTX 5090 | idle | 55.9 | 58.1 | 0.8 / 0.7 |
| RTX 5090 | Fireball | 43.3 | 51.0 | 7.5 / 0.7 |
| RTX 5090 | Hail of Thorns | 48.7 | 55.1 | 8.0 / 0.8 |
| RTX 5090 | Shocking Grasp | 54.9 | 54.5 | 1.0 / 0.9 |

Fixed Balanced preset, actual verified adapters, same isolated heavy fixture, three repetitions per spell; FPS measured without recording. Effect messages replayed into actual client; real combat flow tested separately.

Thirty placed tokens (about 21 visible), 23 walls, six lights, three lanterns, heavy darkness, strong 8 ft mist, rain and embers. Balanced preset, 1440 x 760 map viewport, DPR 1, 45 degrees. Six targets for Fireball/Hail; one for Shocking Grasp. No capture/profiler during measurements; exclude dice background throttling. Timings include ordinary system variation and are not hardware guarantees. Vision JS values do not include browser painting/compositing.

The mask work decreases, but remaining multi-target impact slowdowns are substantial; this is not a complete performance fix. A frame-rate increase does not by itself isolate another bottleneck.

Video: actual window frames, AV1 NVENC at 60 fps on RTX 5090, H.264 phone copy. Isolated save; no live campaign changes.

Validation: typechecking and production build passed; 197 unit test files / 2,004 tests passed; seven focused browser checks passed, including real Hail of Thorns, Ensnaring Strike, Hunter's Mark and Fire Bolt controls. Pixel checks cover regular/heavy darkvision, hidden terrain clipping and flash expiry. Ordinary lighting, movement/camera updates, batched ground lighting and damage-number timing remain covered.
