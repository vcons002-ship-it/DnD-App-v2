# Character dice power

Druk, Vanec and Varis react to each die's natural confirmed result. Strength
runs from 0 for a 1 to 1 for the highest face: maximum d4, d6, d8, d10, d12
and d20 results all reach full power. Both halves of percentile dice use the
complete d100 result. Modifiers and the sum of a pool do not charge individual
dice. A maximum damage die is still damage, not a critical hit.

- **Druk:** after a 0.49-second warning glow, a maximum tears the actual die
  into eleven irregular solid shards. Exterior triangles retain their original
  materials, UVs, gold trim and portions of numerals. The fracture faces are
  solid dark obsidian with a little residual heat. Cannon rigid bodies handle
  the forceful launch and collisions with the tray and other shards. They stop
  tumbling before fading in place, without melting, liquid splashes or pools.
  High natural rolls expose more branching fissures and hotter lava glow,
  while retaining predominantly black obsidian behind the readable gold numbers.
  Crack width and heat are capped below the maximum's warning intensity.
  In the final warning before a maximum bursts, most of the shell becomes
  incandescent lava with a few dark obsidian islands; numbers and gold trim
  remain distinct. This molten appearance stays on the intact die only. Its result still fills the normal result box.
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

A single bounded client-side cosmetic physics world serves the whole tray after
confirmed maxima. Each exploding die adds eleven convex shards; their bodies
are removed once they settle, before the fade. The world does no stepping while
inactive. Shard shadows reuse the existing tray shadow map. Server roll physics,
outcomes, HP, skip behavior and roll ownership are unchanged.

`/dice-power.html` compares explicitly labeled sample values and replays maxima.
It is an art review, not a gameplay roll. Switch between the three characters,
all supported die types, gold critical dice, and an explosion close-up. Browser regressions also roll
real d20s in the player UI to verify the art follows server-confirmed values.

`/dice-comparison.html` is the interactive live-physics roller for Druk, Varis,
Vanec and the DM. It uses the same current materials and per-face power effects
as gameplay, with d4, d6, d8, d10, d12, d20 and paired d100, custom quantities,
individual results and totals. The roller and power comparison link to each other.
Standalone packages must include all four tray textures and the current bundled
renderer; use `node --import tsx client/scripts/package-dice-roller.mts <folder>`
after the client build to package both pages without any campaign connection.
