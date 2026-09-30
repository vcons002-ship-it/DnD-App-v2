# Spell impact lighting and hunter effects

Spell impacts briefly illuminate the visible map, atmosphere and nearby 3D
figures. Fire is orange, cold icy blue, lightning blue-white, thunder lavender,
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
Light sources follow the actual animated spell geometry: luminous arrow shafts,
growing vine tips, positions along a lightning bolt, or drifting elemental sparks.
Each source uses the geometry's world transform, including its height. Arrows
therefore light the ground more strongly as they descend; vines light surfaces
at the height where they are wrapping the target. The visible glow and emitted
light share one brightness envelope. Elemental bursts glow for up to 0.55 seconds;
arrows and vines fade over their 0.9–1.65 second animation. Light uses soft
exponential falloff and there is no separate target-centered lamp or floor halo.
The existing HP numbers remain intact; zero-damage spell effects show no number.

Flashes respect wall occlusion and restore color inside already-visible dark
terrain. They do not expand personal sight, uncover hidden rooms or creatures,
or persist explored terrain. The DM can see effects on DM-visible hidden tokens.

## Rendering budget

Procedural geometry requires no asset downloads. At most sixteen concurrent
impacts are rendered, with up to three light samples per effect and twenty-four
spell light samples total. These samples approximate extended luminous geometry;
this is not ray-traced emissive global illumination. Illumination reuses the
existing bounded light field and the strongest eight nearby lights per miniature.
Spell lights do not add cube shadow renders. Reduced motion suppresses light
flashes and uses stationary geometry.
The first and final light update bypass the ordinary vision-light throttle so
a static scene cannot retain a stale flash mask after rendering goes idle.

## Verification

- Server regressions cover canonical identity, colors, smooth expiry, real Hail
  of Thorns save correlation, Ensnaring Strike hit/ongoing effects, marked weapon
  damage in manual and automatic modes, and hidden-token privacy.
- The browser regression runs the actual player spell/hit-feature controls in a
  disposable heavy-darkness dungeon with walls, a lantern, all three player
  models and goblins. It verifies impact timing, expiry, hidden enemy privacy,
  increased rendered brightness on a nearby miniature, and light positions that
  descend with arrows and rise along the growing vines.
- Existing saves and the installed campaign are not modified by the tests.

The automated arrow/vine effects are a first visual pass. They are transient;
they do not replace the target's persistent condition indicators.
