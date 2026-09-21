# Vanec lightning and cast glow

Vanec retains the approved full-detail GLB, staff, hands, ruby and lightning
geometry. `vanecLightning.ts` improves the runtime materials with pale cores,
additive crimson sheaths, soft depth-tested halos, and a smooth idle shimmer.
Halos attach to the existing lightning branches and measured ruby position, so
they follow rotation, zoom, movement and the source animation. There is no
fullscreen bloom pass and no replacement model download.

Accepted `ability:roll` spells (including level-zero cantrips and leveled
spell-backed stances) and `summon:cast` spells emit `fx:spellCast` after the
authoritative operation. Staff and hand charge together over 0.3 seconds and
fade over 2.1 seconds. Attack misses still count as casts. Each multi-beam spell
casts once; applying individual beams, saves or damage does not retrigger it.
Existing slot/resource rules are unchanged, including the ordinary roll path's
soft warning when a slot is exhausted. Descriptive entries without a supported
cast operation do not emit effects.

The event contains only token IDs from each recipient's shaped snapshot. This
preserves existing hidden-token, fog, map and ownership visibility rules. It
is transient: reconnects, loaded roll history and switching back from 2D do not
replay old casts. Only ready Vanec miniatures respond. Hidden browser tabs drop
new cast effects. Reduced motion disables the idle animation and glow expansion
and uses a restrained cast highlight. All added sprite materials and textures
are disposed with the miniature.

Validation covers actual socket guards (accepted/rejected casts, summons,
multi-beam resolution and viewer visibility) and production-browser cantrip and
spell buttons, automatic expiry, reduced motion, reload, and 2D/3D switching.
Preview recordings use an isolated database and the original ruined-crossroads
map; they do not alter the installed campaign.
