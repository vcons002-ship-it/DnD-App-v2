# Weapon attack rendering budget — 12 October 2026

Measured before (`f21171b`) and after melee mirroring, 340 ms projectile flight,
corrected thrown-weapon axes, brown axe handle, and instanced impact shards.

## Method

Headful Windows Chrome, actual WebGL adapter verified as AMD Radeon integrated
graphics or RTX 5090. Balanced preset, 1440 × 760 map canvas, device pixel ratio
1, tilted player view. The isolated fixture has 30 placed tokens (21 visible),
23 walls, six placed lights, three player lanterns, heavy darkness, 8 ft mist at
0.7 strength, rain, and embers. Balanced uses its low mist rendering tier here.
The installed server and campaign save were untouched.

After 12 seconds of warmup: five seconds idle, then three repetitions of each
effect set, with reading/expiry time between them. Identical `fx:hp` packets
were replayed at the socket boundary through the production renderer. No
recording, CPU profiler, or DOM mutation observer was active. This isolates
effects and damage-number rendering; it is not a complete dice/combat benchmark.

FPS counts actual map renders. Weapon rows include frames while effects are
active; the final row includes damage numbers after weapon effects expire.

## Results

| GPU / phase | Before FPS | After FPS | After frame time p95 |
| --- | ---: | ---: | ---: |
| Integrated — idle | 31.6 | 34.5 | 46.5 ms |
| Integrated — one melee impact | 30.3 | 31.2 | 48.5 ms |
| Integrated — six simultaneous weapons | 28.8 | 31.1 | 49.6 ms |
| Integrated — six damage numbers, no weapon effect | 29.1 | 33.1 | 46.9 ms |
| Integrated — damage numbers after weapons | 30.3 | 33.7 | 46.6 ms |
| RTX 5090 — idle | 53.8 | 53.9 | 22.5 ms |
| RTX 5090 — one melee impact | 52.9 | 51.7 | 23.0 ms |
| RTX 5090 — six simultaneous weapons | 53.2 | 53.1 | 23.1 ms |
| RTX 5090 — six damage numbers, no weapon effect | 52.9 | 53.0 | 26.1 ms |
| RTX 5090 — damage numbers after weapons | 53.8 | 53.9 | 22.3 ms |

Idle also improved in the integrated run, so the entire gain cannot be credited
to shard batching. The useful result is no sustained frame-rate regression or
large effect-related collapse in this fixture. Integrated weapon samples still
contained occasional 139–147 ms frames; this does not establish hitch-free
performance. RTX weapon samples had maxima of 38 ms for six effects and 68 ms
for a single impact. Browser error lists were empty in all four runs.

## Cost controls and verification

- Twelve debris shards now use two instanced draws instead of twelve mesh draws.
- Effects do not introduce light sources, shadow redraws, or visibility-mask
  changes. They reuse the existing fog-safe effect pass and roll prewarm path.
- A browser GPU test repeats twelve bursts of six effects, checks no active
  roots survive expiry, checks stable geometry counts, and checks zero retained
  geometry after renderer disposal.
- Monster combat regression tests cover all 17 styles in automatic and manual
  damage modes, plus hidden DM roll redaction. A real browser test resolves a
  monster attack and clicks its damage button, checking the impact in both the
  DM and player views.

Raw before/after samples and the benchmark runner are retained locally at
`D:/dnd-approved-release/weapon-random-perf-20261012`.
