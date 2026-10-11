# Spell impact lighting and hunter effects

Spell impacts illuminate nearby terrain and figures with colors that follow
actual effect geometry. Their temporary light also restores local color through
the darkvision grade. Full illumination is the default on High and Balanced;
Low uses the existing ground-sampled figure lighting. Spell sources do not
create additional shadow maps or reveal unexplored rooms, hidden creatures,
or terrain outside personal visibility.

A diagnostic URL option, `?spellColorOverlay=1` (or append with `&`), retains
the simpler soft color overlay experiment. This is for isolated comparisons,
not the normal game behavior. It bypasses spell illumination and spell grading
masks; ordinary lights, vision, and exploration remain active.

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
plane. The visible glow and illumination share one brightness envelope.
Elemental bursts glow for up to 0.55 seconds;
arrows and vines fade over their 0.9–1.65 second animation. Illumination follows moving samples without adding spell shadow maps.
The existing HP numbers remain intact; zero-damage spell effects show no number.

Transient spell masks restore color locally through darkvision grading, while
the existing personal sight and exploration cover remains independent. A flash
cannot uncover hidden rooms or creatures, extend sight, or persist exploration.
The DM can see effects on DM-visible hidden tokens.

## Rendering budget

Procedural geometry requires no asset downloads. At most sixteen concurrent
impacts are rendered, with up to three color samples per effect and twenty-four
samples total. Reduced motion suppresses flashes and uses stationary geometry.
High and Balanced use directional figure illumination, including nearby spell
samples. Low samples the existing wall-clipped light texture at each figure's
base; shared party sightings retain their existing grayscale presentation.
Ground creature shadows keep the preset's budget and exclude spell sources.
The diagnostic overlay instead uses a modest-resolution Canvas2D layer, with
no additional WebGL context or source selection per figure.

Separate retained SVG nodes update spell grading at the rendered frame rate
without rebuilding sight/history on each flash frame. Ordinary lamp masks keep
their approximately 15 Hz cadence. First and final flash frames always update,
including when the scene becomes idle. Camera changes, movement, wall/door edits
and snapshots still refresh vision immediately.

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
  nearby figure illumination after damage rolls, and sample positions that
  descend with arrows and remain attached to the persistent vines.
- Existing saves and the installed campaign are not modified by the tests.
- `e2e/spell-light-mask.spec.ts` compares the retained masks against the old
  attenuation using browser-rasterized pixels, verifies geometry/clip reuse,
  unchanged-node retention, zero-contribution skips, clip invalidation,
  ellipse/path fallback and expiry. Pixel tests check colored flashes above
  regular/heavy darkvision, clipping behind a wall and complete expiry. The diagnostic overlay avoids spell grading redraws; the default restores
  local color without changing sight or exploration. In either mode, lamps, movement and camera still update. The movement renderer
  regressions also cover rotation during snapshots and door invalidation.
- `e2e/hp-number-clock.spec.ts` advances a blocked-frame clock across multiple
  damage components and verifies ordering, fade expiry, the cumulative total,
  and late mounting. Real Hail of Thorns and Cure Wounds timing checks use
  actual combat rolls. Persistent spell visuals are distinguished from newly
  triggered impact flashes when checking that dice finish before new effects.

Arrow impacts are transient. Ensnaring Strike's condition-backed vines remain
on the target while the condition is active, alongside its condition indicators.

## Roll handoff

Dice-time battlefield rendering stays capped at 12 FPS. For a completed physical
roll, its existing final reading hold prepares full battlefield raster resolution
500 ms before map impacts are released. This shifts allocation and the first
full-size paint behind the tray. It adds no delay, does not release damage early,
and does not change dice sizes, roll timing, modifiers, or the Druk finale.
Skip still releases immediately. Stale preparation callbacks cannot affect another
roll, and private approval steps remain required. See
[roll handoff measurements](ROLL_BACKGROUND_PREWARM_2026-10-11.md).
