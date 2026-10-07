# Character dice power

Druk, Vanec and Varis react to each die's natural confirmed result. Strength
runs from 0 for a 1 to 1 for the highest face: maximum d4, d6, d8, d10, d12
and d20 results all reach full power. Both halves of percentile dice use the
complete d100 result. Modifiers and the sum of a pool do not charge individual
dice. A maximum damage die is still damage, not a critical hit.

- **Druk:** recessed obsidian fissures widen and heat up smoothly. A maximum
  surges with heat, then shatters the actual polyhedron into solid wedges, with
  glossy black exteriors, gold edges and hot broken interiors. A molten core
  flash, expanding pressure ring and small embers accompany the tumbling chunks.
  Fragments bounce, cool and fade; the intact die stays gone for that result.
  The result number still follows its ordinary path into the result box.
- **Vanec:** stronger results shorten randomized pauses between internal
  discharges. A maximum fires rapid crimson bursts with brief dark gaps,
  rotating the whole coherent branching field randomly in three dimensions
  each burst. Geometry and timing remain independent for each die.
- **Varis:** his enclosed wandering mote grows more luminous with strength. A
  maximum draws it smoothly into the center, where it stays while 22 soft light
  streams radiate above, below and around the resin. The rays grow as it arrives.

The live tray receives confirmed faces directly from `LiveDiceFrame.values`.
Unknown/moving dice keep their ordinary material. Power changes ease in, and
repeated frames or the result-reading hold cannot retrigger an eruption. A
genuine reroll resets it. The same renderer supports playback and the ordinary
character dice roller; standalone result dice retain the power treatment.
Gold critical dice carry the same class maximum effects; Druk's gold dice also
shatter. Reduced motion keeps Druk intact and omits eruptions/rays and rapid
maximum discharges.

These are cosmetic shaders and bounded instanced geometry, with no additional
physics worlds, shadow maps, dynamic lights, or changes to outcomes, HP, server
authority, skip behavior, or roll ownership.

`/dice-power.html` compares explicitly labeled sample values and replays maxima.
It is an art review, not a gameplay roll. Switch between the three characters,
all supported die types, and gold critical dice. Browser regressions also roll
real d20s in the player UI to verify the art follows server-confirmed values.
