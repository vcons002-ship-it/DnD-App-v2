# Character dice power

Druk, Vanec, Varis and the DM react to each die's natural confirmed result. Strength
runs from 0 for a 1 to 1 for the highest face: maximum d4, d6, d8, d10, d12
and d20 results all reach full power. Both halves of percentile dice use the
complete d100 result. Modifiers and the sum of a pool do not charge individual
dice. A maximum damage die is still damage, not a critical hit.

- **Druk:** during a 0.85-second buildup, a maximum heats to mostly molten lava
  and shudders with increasing frequency and force. Only the visible shell
  shakes; the settled physical pose and result stay unchanged. It then tears the actual die
  into eleven irregular solid shards. Exterior triangles retain their original
  materials, UVs, gold trim and portions of numerals. The fracture faces are
  solid dark obsidian with a little residual heat. Exposed interior fracture
  faces use the same polished obsidian shader as the exterior, without gold
  markings or the molten warning layer. Cannon rigid bodies handle
  the forceful launch and collisions with the tray and other shards. They stop
  tumbling before fading in place, without melting or liquid splashes. A bright
  irregular molten interior drains through short viscous strands that thin and
  break into uneven falling drops as the shell opens, then spreads into a bright
  lava pool at its explosion position until the roll is
  cleared. Its irregular cooled rim, drifting molten channels and dark floating
  crust retain texture around the hot center. A soft amber spill stays on the
  felt. The release is bounded to eight drops and four connecting strands;
  it adds no fluid solver, rigid bodies or dynamic lights.
  One dominant draining mass breaks into differently sized, bent, tapered lobes
  and a few small drops. Smooth deformed normals and wet highlights replace
  uniform round particles. Release and pool share the same molten channels,
  cooling plates, palette and animation function.
  High natural rolls expose more branching fissures and hotter lava glow,
  while retaining predominantly black obsidian behind the readable gold numbers.
  Crack width and heat are capped below the maximum's warning intensity.
  Shard interiors own their heat uniforms so fading fragments cannot dim the
  intact die's high-roll glow.
  In the final warning before a maximum bursts, most of the shell becomes
  incandescent lava with a few dark obsidian islands; numbers and gold trim
  remain distinct. This molten appearance stays on the intact die only. Its result still fills the normal result box.
- **Vanec:** stronger results shorten randomized pauses between internal
  discharges exponentially. A minimum sparks once on confirmation, then pauses
  roughly 4–6 seconds; a 5 on a d6 repeats about every 0.5–0.7 seconds.
  Maximum results remain faster, at roughly 0.12–0.21 seconds between crimson
  bursts with brief dark gaps,
  rotating the whole coherent branching field randomly in three dimensions
  each burst. Geometry and timing remain independent for each die.
- **Varis:** his enclosed wandering mote grows more luminous with strength. A
  maximum draws it smoothly into the center, where it stays and softly lights
  the surrounding resin. Eight softly rotating green-gold light shafts continue
  through the resin and gently escape its faces. Short, narrow volumes fade
  smoothly into the air without hard cone edges or bright face apertures.
  The internal and external sections share their direction and rotation.
  Distance falloff, absorption and face angle shape the resin illumination.
  Reduced motion retains the ordinary mote glow and omits escaping shafts.
- **DM:** more active curling ink is silhouetted against soft internal purple
  light within the refracting resin. A confirmed maximum transitions the cloud
  to blood red. Gold numerals stay on the opaque front inlay, outside the cloud
  shader. Reduced motion retains the color change without flashing.

The live tray receives confirmed faces directly from `LiveDiceFrame.values`.
Unknown/moving dice keep their ordinary material. Power changes ease in, and
repeated frames or the result-reading hold cannot retrigger an eruption. A
genuine reroll resets it. The same renderer supports playback and the ordinary
character dice roller; standalone result dice retain the power treatment.
Gold critical dice keep their metallic finish; Druk's gold dice also
shatter. Reduced motion keeps Druk intact and omits eruptions and rapid
maximum discharges.

A single bounded client-side cosmetic physics world serves the whole tray after
confirmed maxima. Each exploding die adds eleven convex shards; their bodies
are removed once they settle, before the fade. The world does no stepping while
inactive. Shard shadows reuse the existing tray shadow map. Server roll physics,
outcomes, HP, skip behavior and roll ownership are unchanged.

`/dice-power.html` compares explicitly labeled sample values and replays maxima.
It is an art review, not a gameplay roll. Switch between the three characters and the DM,
all supported die types, gold critical dice, and an explosion close-up. Browser regressions also roll
real d20s in the player UI to verify the art follows server-confirmed values.

`/dice-comparison.html` is the interactive live-physics roller for Druk, Varis,
Vanec and the DM. It uses the same current materials and per-face power effects
as gameplay, with d4, d6, d8, d10, d12, d20 and paired d100, custom quantities,
individual results and totals. The roller and power comparison link to each other.
Standalone packages must include all four tray textures and the current bundled
renderer; use `node --import tsx client/scripts/package-dice-roller.mts <folder>`
after the client build to package both pages without any campaign connection.
