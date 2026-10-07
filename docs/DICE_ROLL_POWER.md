# Character dice power

Druk, Vanec and Varis react to each die's natural confirmed result. Strength
runs from 0 for a 1 to 1 for the highest face: maximum d4, d6, d8, d10, d12
and d20 results all reach full power. Both halves of percentile dice use the
complete d100 result. Modifiers and the sum of a pool do not charge individual
dice. A maximum damage die is still damage, not a critical hit.

- **Druk:** recessed obsidian fissures widen and heat up smoothly. A maximum
  pulses with heat and forcefully launches 34 glowing molten droplets upward and outward. They
  arc downward and cool at the tray floor; the die and number remain intact.
- **Vanec:** stronger results shorten randomized pauses between internal
  discharges. A maximum fires rapid, separate crossing discharges
  inside the red glass, with brief fully dark gaps and new channels each burst.
  Geometry and randomized timing remain independent for each die.
- **Varis:** his enclosed wandering mote grows more luminous with strength. A
  maximum releases 22 soft, tapered light streams in a sphere around the mote,
  including above and below the die, rather than only along the tray.

The live tray receives confirmed faces directly from `LiveDiceFrame.values`.
Unknown/moving dice keep their ordinary material. Power changes ease in, and
repeated frames or the result-reading hold cannot retrigger an eruption. A
genuine reroll resets it. The same renderer supports playback and the ordinary
character dice roller; standalone result dice retain the power treatment.
Gold critical dice preserve their gold surfaces, readable engraving and class
maximum effects. Reduced motion omits eruptions/rays and rapid maximum discharges.

These are cosmetic shaders and bounded instanced geometry, with no additional
physics worlds, shadow maps, dynamic lights, or changes to outcomes, HP, server
authority, skip behavior, or roll ownership.

`/dice-power.html` compares explicitly labeled sample values and replays maxima.
It is an art review, not a gameplay roll. Switch between the three characters,
all supported die types, and gold critical dice. Browser regressions also roll
real d20s in the player UI to verify the art follows server-confirmed values.
