# Spell impact lighting and hunter effects

Spell impacts add a brief soft colored overlay above the visible battlefield
and darkvision grading. This is cosmetic color, not a temporary torch: it does
not affect darkvision, cast shadows or enter the ground/figure light field.
The same approach applies on High, Balanced and Low.
Fire is orange, cold icy blue, lightning blue-white, thunder lavender,
acid yellow-green, poison green, necrotic purple, radiant gold, force violet,
psychic pink and healing green. Physical damage alone adds no light.

Named effects preserve the spell's identity even when its damage is physical:

- Hail of Thorns, Conjure Barrage and Conjure Volley: descending magical arrows.
- Ensnaring Strike and Entangle: growing vines and leaves around the target.
- Lightning Arrow: one luminous blue arrow.
- Hunter's Mark: a brief green aura when cast or moved, and on physical hits.
- Smite riders retain their elemental color even on a physical weapon attack.

An elemental attack against a marked creature keeps its own elemental color.
The existing condition mechanics, spell costs and damage calculations are
unchanged; these are presentation effects, not new automation for spell rules.

## Timing and visibility

`HpFxEvent.spell` carries only a canonical cosmetic identifier. The server
retains it through a weapon's combined damage, saves and ongoing spell damage.
Non-damaging marks use the same visibility-filtered impact channel. Hidden,
off-map and party-shared-only targets do not send an impact to that player.

The impact follows the correlated roll's completion or skip, just like damage
numbers. A cast without a roll, such as Hunter's Mark, displays immediately.
Color samples follow the actual animated spell geometry: luminous arrow shafts,
growing vine tips, positions along a lightning bolt, or drifting elemental sparks.
Each sample uses the geometry's world transform projected onto the battlefield
plane. The visible glow and color overlay share one brightness envelope.
Elemental bursts glow for up to 0.55 seconds;
arrows and vines fade over their 0.9–1.65 second animation. Color uses a soft radial
gradient with no separate lamp, directional lighting or shadow calculation.
The existing HP numbers remain intact; zero-damage spell effects show no number.

Flashes reuse the inverse of the existing visibility cover, so color stays
within already-visible terrain. They do not restore daylight colors, alter
darkvision, expand personal sight, uncover hidden rooms or creatures,
or persist explored terrain. The DM can see effects on DM-visible hidden tokens.

## Rendering budget

Procedural geometry requires no asset downloads. At most sixteen concurrent
impacts are rendered, with up to three color samples per effect and twenty-four
samples total. One modest-resolution Canvas2D overlay draws soft gradients;
it has no new WebGL context, per-figure source selection or spell shadow maps.
Reduced motion suppresses color
flashes and uses stationary geometry.
Graphics presets affect presentation only. High and Balanced leave ordinary
torches and lanterns directional. Low bypasses that selection and its sight checks:
each figure samples the existing wall-clipped ground light texture at its base,
with one texture lookup per vertex and a uniform diffuse response. Batched figures
retain separate sample positions. Ground creature shadows keep the preset's
existing budget; spell sources remain excluded from shadow generation. Shared
party sightings disable the ground sample just as they disable direct lights.
The overlay is cleared on the final flash frame, including when the renderer
then goes idle.

Player vision maintains only ordinary-light masks. Spell colors update at the
map's rendered frame rate without changing those masks; ordinary lantern/torch vision
updates retain their approximately 15 Hz cadence. Camera changes, movement,
wall/door edits and server snapshots still refresh vision immediately. A
cosmetic flash does not rebuild darkvision or the GPU sight/exploration cover.

The SVG light masks cache projected geometry for their 48 attenuation bands
and retain wall clips instead of replacing the entire overlay DOM tree. Camera
or source motion invalidates only that source's projected geometry; flicker
updates the cached attenuation profile. Changed mask markup is batched into one
DOM write per mask, avoiding hundreds of individual SVG attribute updates.
Sources with exactly zero peak coverage skip projection/clipping entirely;
only bands with nonzero opacity are projected. Geometry, rounding, falloff and
clipping match the previous ordinary-light masks. Effect geometry, model quality
and fog rules are unchanged.

Floating damage components use one elapsed-time animation each, replacing
separate follow, drift and fade callbacks/timers. The existing hold durations,
easing and rise remain the same. A delayed frame catches up to the impact's
schedule instead of extending a fade into the next colored number; components
mounted after their lifetime do not flash back onto the map.

Performance measurements distinguish active spell-impact frames, ordinary map
frames and dice-time background throttling. The existing 12 FPS map budget
during a dice roll is not a spell-effect benchmark. Repeatable impact tests
can replay identical visibility-filtered `fx:hp` payloads at the client socket
boundary, without dice or gameplay randomness, then verify real combat timing
separately. Use a fixed graphics preset, verify the actual WebGL adapter, and
keep capture, CPU profiling and DOM mutation instrumentation out of FPS runs.
The ground-lighting experiment did not show a consistent overall speedup over the
previous same-preset lighting. See the [ground-lighting preset measurements and
videos](GROUND_LIGHTING_PERFORMANCE_2026-10-11.md) for the tested tradeoffs.
The subsequent [cosmetic overlay measurements and video](SPELL_COLOR_OVERLAY_PERFORMANCE_2026-10-11.md)
remove spell/darkvision coupling. This reduces mask work, with a larger FPS gain
on the 5090 than on integrated graphics in the tested multi-target effects.
See the [11 October dual-GPU comparison](SPELL_IMPACT_PERFORMANCE_2026-10-11.md)
for the measured gains and remaining frame-time limits.

## Verification

- Server regressions cover canonical identity, colors, smooth expiry, real Hail
  of Thorns save correlation, Ensnaring Strike hit/ongoing effects, marked weapon
  damage in manual and automatic modes, and hidden-token privacy.
- The browser regression runs the actual player spell/hit-feature controls in a
  disposable heavy-darkness dungeon with walls, a lantern, all three player
  models and goblins. It verifies impact timing, expiry, hidden enemy privacy,
  the colored overlay after damage rolls, and sample positions that
  descend with arrows and remain attached to the persistent vines.
- Existing saves and the installed campaign are not modified by the tests.
- `e2e/spell-light-mask.spec.ts` compares the retained masks against the old
  attenuation using browser-rasterized pixels, verifies geometry/clip reuse,
  unchanged-node retention, zero-contribution skips, clip invalidation,
  ellipse/path fallback and expiry. Pixel tests check colored flashes above
  regular/heavy darkvision, clipping behind a wall and complete expiry. Flashes
  do not redraw darkvision or sight masks; lamps, movement and camera still update. The movement renderer
  regressions also cover rotation during snapshots and door invalidation.
- `e2e/hp-number-clock.spec.ts` advances a blocked-frame clock across multiple
  damage components and verifies ordering, fade expiry, the cumulative total,
  and late mounting. Real Hail of Thorns and Cure Wounds timing checks use
  actual combat rolls. Persistent spell visuals are distinguished from newly
  triggered impact flashes when checking that dice finish before new effects.

Arrow impacts are transient. Ensnaring Strike's condition-backed vines remain
on the target while the condition is active, alongside its condition indicators.
