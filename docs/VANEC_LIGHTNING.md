# Vanec lightning and cast glow

Vanec retains the approved full-detail GLB, staff, hands and ruby. The baked
lightning branches and floating droplets are hidden at runtime. In their place,
`vanecLightning.ts` generates tapered three-dimensional discharge filaments with
pale cores, additive crimson sheaths and soft depth-tested halos. Independent
discharges change shape six to eight times a second, fading between strikes.
Palm arcs curl upward; staff arcs crawl around the ruby. Casting adds extra
filaments. Reusable tube buffers avoid geometry allocations during animation.
Emitters use the source palm and measured ruby positions and follow token
rotation and movement. There is no fullscreen bloom pass or model download change.

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
and uses fixed, restrained filaments with a gentle cast highlight. Added tube
geometry, sprite materials and textures are disposed with the miniature.

Validation covers actual socket guards (accepted/rejected casts, summons,
multi-beam resolution and viewer visibility) and production-browser cantrip and
spell buttons, automatic expiry, reduced motion, reload, and 2D/3D switching.
Preview recordings use an isolated database and the original ruined-crossroads
map; they do not alter the installed campaign.
