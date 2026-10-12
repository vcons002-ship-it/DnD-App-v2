# Spell areas and elemental impacts

The aiming and resolving spell areas now use their own projected UI canvas
above darkness/fog grading. Bright outlines and faint fills remain visible
while choosing the area and through the final map impact. This displays only
the targeting shape; it does not reveal hidden terrain or creatures. The same
projection updates cover panning, tilt and rotation.

Fireball emits one server-validated area event, with the caster's map position
and the selected 20-foot radius. Its glowing orb travels for 600 ms, then a
turbulent flame explosion expands over that footprint. Individual victims
retain their own defended damage, conditions and HP events, but do not spawn
duplicate Fireballs. Their damage numbers start together at arrival. Empty
areas still produce the visual. Hidden/private rolls retain this cosmetic
timing; a hidden caster's origin is removed from player packets.

Shocking Grasp briefly crackles around the touched body. Its mechanically
active reaction restriction no longer creates a persistent bolt. No change to
the spell's rules or condition expiry is implied.

Call Lightning uses one area event at the chosen 5-foot-radius strike. Bolts
reach across that circle rather than borrowing individual token/base widths.
The 60-foot-radius storm cloud is separate from the strike's damage footprint;
this change does not add damage across the entire cloud.

Validation: production build and both typechecks; all 2,011 unit tests; 13
focused browser regressions covering geometry, hold/skip timing and fog/depth
preservation. Actual Fireball, Call Lightning and Shocking Grasp casts were
recorded from the player view in a disposable campaign, in regular and heavy
darkness, using Windows Graphics Capture and RTX 5090 AV1 encoding.
