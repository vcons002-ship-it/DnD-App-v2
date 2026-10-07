# Character dice power

Druk, Vanec and Varis react to each die's natural confirmed result. Strength
runs from 0 for a 1 to 1 for the highest face: maximum d4, d6, d8, d10, d12
and d20 results all reach full power. Both halves of percentile dice use the
complete d100 result. Modifiers and the sum of a pool do not charge individual
dice. A maximum damage die is still damage, not a critical hit.

- **Druk:** a maximum tears the actual die into eleven irregular Voronoi
  fragments. Exterior triangles retain their original materials, UVs, gold
  trim and portions of numerals; only newly exposed cuts use molten material.
  Cannon rigid bodies use convex fragment colliders, gravity converted from SI,
  volume-based mass and contacts with felt, lining, intact dice and other chunks.
  Their motion uses the same 0.75 presentation rate as the rolling dice.
  Eight viscous globs stretch from the split core, collide and spread into hot
  pools, with animated crust, emissive interiors, soft bloom and warm light
  spilling onto the felt. The lava surface and pooling are visual approximations,
  not a fluid solver. Chunks and lava cool and fade after the burst; the intact
  die stays gone for that result. Its result still fills the normal result box.
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
confirmed maxima. Each exploding die adds eleven convex chunks and eight globs;
bodies are removed when the effect fades, and the world does no stepping while
inactive. Chunk shadows reuse the existing tray shadow map, and twelve bounded
floor-light samples avoid dynamic shadow-casting lights. Server roll physics,
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
