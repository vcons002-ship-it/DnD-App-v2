# Movement, Lightning Bolt lighting, and area cover fixes

## Behavior

- Moving a miniature updates its retained body matrices before lantern-anchor
  queries. The figure now moves with its lantern and mist disturbance instead
  of remaining at the old position until a later render.
- Lightning Bolt emits a connected strip of blue-white light along its advancing
  stroke. The light follows the bolt pulses, map rotation and scale, with soft
  spill at its sides. Terrain, miniature lighting, and the temporary vision
  composite use the same segment-distance calculation. Ordinary lights remain
  point sources, and the spell uses the existing bounded emitter count.
- Placed area spells pass their server-computed origins into save/damage
  resolution. Fireball checks cover from its explosion center rather than
  repeating a caster-to-victim check. An unseen creature around a corner can
  take damage if the blast reaches it. Walls and closed doors still block the
  blast; direct targeting and unplaced manual applications retain their checks.

There is no save migration or database schema change.

## Validation

- Client/server typechecking and production build.
- 2,228 server/shared regression tests, including a retained-matrix reproduction
  and area-cover tests that failed before the fixes.
- Eleven focused browser checks in `ground-lighting.spec.ts`,
  `spell-area-effects.spec.ts`, and `spell-flash-reveal.spec.ts`: continuous beam
  coverage, rotated endpoints, wall/door clipping, and synchronized light pulses.
- Actual app recordings on an RTX 5090, captured using NVIDIA AV1 and published
  with an H.264 copy for mobile playback:
  - [Movement with mist and a lantern](https://dnd.nic024i.app/uploads/previews/latest-pr-improvements-20261015/movement-sync.html)
  - [Lightning Bolt in overhead and tilted views](https://dnd.nic024i.app/uploads/previews/lightning-beam-shape-20261015/index.html)

## Separate issues observed during testing

The complete browser suite is not claimed green. Earlier testing found a
door-preload reveal exceeding its 250 ms target, a Hold Person overlay assertion,
and an older Command test that does not confirm the cast in its current dialog.
A mixed-color lantern assertion also fails with the unchanged Main lighting
module: its warm and blue lights saturate the sampled pixel, contradicting the
assertion's required blue/red separation.

A first day-to-darkness switch can stall on shader compilation. This is separate
from the miniature/lantern movement desynchronization fixed here. The recordings
and GPU checks do not establish mobile or integrated-graphics performance.
