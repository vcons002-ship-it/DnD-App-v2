# Personal dungeon vision

Enabled Night and Dungeon map environments use the accepted campaign rule:
each player sees within 60 feet of their own placed character. Regular darkness
is dim, colored vision; heavy darkness is nonmagical darkness rendered grayscale.
Lanterns (20 feet) and revealed placed light pools retain color and affinity
outlines. Unlit token affinity outlines/dots are hidden. Lights do not extend the
60-foot horizon. The DM retains the full map overview.

The server filters tokens and creature lists separately for every viewer and
limits live drag broadcasts accordingly. Encounter tags are assigned only when
a creature reaches a placed party character's range, in addition to existing
active-map and manual-fog rules. Tags already revealed remain stable.

The client mask follows committed animated movement, pan, tilt and rotation,
and remains enabled when environment quality is Off. Players without their own
placed token have no dungeon view yet. Existing fog/hidden-token rules still
apply. Painted dungeon walls do not automatically block sight.

Environment, weather, lights, and darkness settings remain saved per map using
the existing environment persistence. No save migration is needed. This is a
fixed campaign vision mode, not a species-specific or wall-raycast rules system.

Verification: server tests cover two-player isolation in both broadcast orders,
60-foot boundaries, movement, hidden/fogged creatures and carried lights, DM
visibility, and encounter numbering. The production-browser demo exercises both
darkness levels, the real lantern control, click-drag movement, a second player's
independent view, overhead projection, and effects-off enforcement.

## Natural light reveal refinement

Color restoration now follows the ground-light irradiance falloff, source height,
strength and live flickering radius. The renderer supplies the actual animated
hip-lantern position. A soft sampled attenuation mask replaces the hard inner
color disk; overlapping sources combine. Personal vision retains a dim ambient
floor so Darkvision stays readable while the original torch lighting can glow.
Regular darkness needs no color mask at all. The separate 60-foot visibility
horizon remains enforced. Effects-off uses the saved-source falloff fallback.
Carried lanterns reach 20 feet; newly placed torches default to 15 feet, with the
DM's 3-60 foot radius control retained. These are current app light radii.

## Useful light radius

The configured radius now means useful illumination, with a smooth spill ending
at 1.5 times that radius. A carried lantern illuminates about 20 feet outward
(40 feet across), fading out by 30 feet. A default placed torch illuminates about
15 feet outward, fading out by 22.5 feet. Flicker still subtly varies reach.
Ground illumination, miniature surface lighting, and Darkvision color reveal
share the same falloff definition in shared/lightFalloff.ts. This is an artistic
light profile calibrated to readable map distances. The 60-foot personal horizon
and manual fog still cap visibility, regardless of the spill.

## Darkvision preserves ambient darkness

Darkvision no longer raises map brightness or adds a brighter miniature fill rig.
The actual map lighting preset, ambient light slider and heavy-darkness multiplier
apply unchanged. The vision overlay only desaturates unlit areas and enforces
range. Torches/lanterns retain their normal illumination and stand out against the
same dark environment seen by the DM. This supersedes the earlier dim ambient
floor described in the natural-light refinement.

## Subtle Darkvision contours

Heavy-darkness player views add a soft grayscale detail pass to the unlit image.
A small blur suppresses pixel noise, then a positive edge filter adds a faint
highlight to brighter edges while leaving uniform dark surfaces unchanged.
The existing illumination mask fades this pass out under lantern/torch light,
and the outer personal mask keeps it inside 60 feet. It runs over both scenery
and tokens without changing ambient lighting or restoring affinity colors.
Regular darkness retains its existing rendering.
