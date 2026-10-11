# Rotation rendering and daylight vision performance

Camera projection and animated scene updates now use a shared frame scheduler. Camera and vision transforms run first; the existing scene paints once afterward. Panning also queues its scene paint instead of rendering immediately. No model, mist, shadow or resolution settings are reduced.

Daylight with both automatic fog switches off no longer mounts or updates the unused SVG player vision overlay. Dim/heavy darkness still uses its grading, light masks and range; wall movement collision and targeting remain server-authoritative. The FPS diagnostic counts distinct RAF frames, with separate raw draw and frame counters.

## Controlled integrated-GPU comparison

AMD Radeon integrated graphics, High settings, 1440 x 760 map canvas, 45-degree view, identical framing, LOD and model URLs. Daylight has 30 visible figures. Heavy darkness naturally has 21 visible figures. Dense 8-ft mist, rain, embers, six placed lights and three lanterns are retained in the stress cases. The clear cases disable mist, weather, particles and shadows. No recording or tests ran during measurement.

| View and scene | Stationary before / after | Fast rotation before / after |
|---|---:|---:|
| DM: Daylight/no fog/effects retained | 59.0 / 58.8 FPS | 28.6 / 53.6 FPS |
| DM: Clear daylight/no fog | 58.2 / 58.0 FPS | 63.3 / 63.5 FPS |
| Player: Daylight/no fog/effects retained | 47.1 / 50.7 FPS | 26.1 / 50.0 FPS |
| Player: Clear daylight/no fog | 59.1 / 59.3 FPS | 47.4 / 64.3 FPS |
| Player: Heavy darkness/fog | 34.4 / 33.3 FPS | 16.1 / 22.4 FPS |

All after measurements recorded one render per frame (median, p95 and maximum). Stress rotation previously recorded two per frame, occasionally three. GPU cost per draw remains comparable; frame scheduling removes repeated work rather than making each draw lower quality.

FPS here is distinct browser animation frames containing a map draw, not a monitor-presentation trace. This is one paired run; stationary heavy-darkness variation is not an improvement claim. First daylight player samples include a few joining/background long tasks. The underlying receipt retains those results rather than filtering them away.

## Verification

- Typecheck and production build passed.
- 196 server suites / 1,999 tests passed, including frame ordering, cancellation and recurring camera/effect scheduling.
- Ten targeted browser cases passed across the initial run and repaired reruns: rotation/dragging in both projections, one paint per frame under continuous rotation, fog switches across daylight/dim/heavy darkness, names/batching/body-mask invalidation, GPU sight composition, projected light attenuation, and Cure Wounds/Hail of Thorns roll-to-map timing.
- Updated the older rotation test to assert the actual camera angle rather than the obsolete angle text on the reset button, and wait for cold model loading.
- The integrated-GPU comparison completed without browser errors.

Raw paired values: [measurement receipt](rotation-scheduler-2026-10-11.json). The live campaign and installation were not used for these tests.
