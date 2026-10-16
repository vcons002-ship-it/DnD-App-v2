# Spell interaction with mist

Balanced and High graphics let energetic spell effects displace existing mist.
Auto follows its resolved graphics tier. Low, Effects off, reduced motion, and
the map's disabled mist-interaction setting skip the work.

Fireball, Meteor Swarm, Shatter, Flame Strike, Ice Storm, Ice Knife's splash,
Call Lightning, arrow volleys and Misty Step leave radial disturbances.
Thunderwave pushes from the caster's face of its cube. Burning Hands and Cone
of Cold sweep a cone; Lightning Bolt disturbs a narrow lane along its beam.
Projectile spells wait until impact. Persistent conditions, healing/status
art and weapon flashes do not continuously disturb the air.

The existing 320 x 224 map-space flow texture receives bounded pressure fields
at its existing 15 Hz update rate. Broad spell pressure is sampled per 2 x 2
texels; character contact and the ambient mist retain their original quality.
The field shifts the existing cloudy density, compresses its advancing bank,
adds turbulent displacement during recovery and fades over 3 to 5.5 seconds.
At most eight spell disturbances remain active. Camera changes do not reset
them. There is no added render pass, shader sampler, light, shadow, network
message or change to game visibility, targeting, collision or damage. This is
a visual approximation of air movement, not a fluid simulation.

The map control is labeled **React to figures and spells**. The cosmetic
`spellMist=off` query parameter provides a precise performance comparison
without disabling character wakes or changing the graphics preset.

## Integrated-GPU comparison

Verified WebGL renderer: AMD Radeon(TM) Graphics, device 0x164E, ANGLE D3D11.
The renderer selection was confined to the test Chrome process; Windows app
graphics preferences were not changed.

Real player view, Balanced, 1440 x 960 viewport, DPR 1, 45-degree map, heavy
darkness, eight-foot mist at 65%, rain/embers, 30 placed tokens (28 miniatures
in this player's view), 23 wall pieces, six placed lights and three lanterns.
The same warmed Fireball, Lightning Bolt, Thunderwave and Burning Hands FX
were replayed through the real client's cosmetic event handler. These are
controlled effect-performance measurements, not fabricated combat rolls.
Video recording and builds/tests were excluded from the timing windows.

One mounted scene throughout four 16-second windows: off/on, then on/off.
The mode changed without reloading the scene; each change had a 6.5-second
settling interval. No browser JavaScript errors were reported.

| Spell interaction | First pass FPS | Second pass FPS | Mean FPS | Median frame interval, mean of passes | 95th-percentile interval, mean of passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off | 21.92 | 21.39 | 21.66 | 46.3 ms | 60.45 ms |
| On | 21.75 | 20.94 | 21.34 | 47.5 ms | 61.85 ms |

The observed difference is about 0.31 FPS / 1.5%, with 1.2 ms added to the
median interval. Reported spell-field raster updates were typically 0.2-0.3 ms,
with 95th percentiles of 1.2-1.9 ms, at 15 updates per second. The test reached
two overlapping disturbances. It does not establish zero cost or a universal
frame-rate guarantee. The absolute frame rate is for this deliberately heavy
scene and should not be substituted for ordinary-play performance.

Balanced uses the existing low-resolution mist renderer (360 x 230 at this
viewport). A separate paired test selected the full High preset, including
High mist at 720 x 460. It averaged 28.07 FPS off and 27.95 FPS on, a difference
of 0.12 FPS / 0.4%; mean median intervals were 36.2 and 36.4 ms. Both passes
reached two active disturbances. No JavaScript errors were reported. Compare
on/off within each test, not absolute FPS across these separately run presets:
the earlier Balanced checks already showed substantial between-run variation.

An earlier reload-per-case check also found near-equal paired FPS, but both
variants slowed between passes (roughly 37 FPS to 22 FPS). The single-scene
comparison above avoids that reload confound and is the decision basis.

An isolated CPU microbenchmark, which is not a GPU FPS test, exercised the
eight-field cap: the optimized field update averaged roughly 3.3 ms. Broad
2 x 2 sampling reduced that worst-case CPU raster work from roughly 12.7 ms
in the first implementation without changing ambient mist rendering.

Actual spell casts with live, unforced dice are captured separately using
Windows Graphics Capture / NVIDIA NVENC AV1, with rendering on the verified
AMD integrated GPU. The timing receipts remain separate from the recording.
