# Mobile builder and movement follow-up

The builder now separates what a character receives from optional purchases
and from rules that still need the DM. These changes apply to new characters;
existing campaign sheets are not migrated.

- Starting inventory lists quantities, where items came from, worn/equipped
  items, class gold, background gold and purchases. Pack contents expand in the
  creator and are saved in the pack's inventory notes; loose items are not added
  a second time.
- Background is a chooser. Soldier and Criminal are reviewed 2024 Free Rules
  presets with their own skills, feat, allowed ability increases and tool
  proficiency, plus equipment-package versus 50-GP options. Other backgrounds
  remain explicit Custom choices with the DM. This is not a complete catalog of
  every published background or Origin feat.
- Species, class and Origin features have expandable descriptions in Identity
  and the final review. Labels distinguish starting values, counters, roll
  buttons, toggles and saved references requiring DM resolution. Remaining
  lineage/ancestry choices are called out instead of implying full automation.
- The level-one catalog no longer grants Goliath Large Form or Aasimar Celestial
  Revelation early. Missing starting reference traits are included; new Aasimar
  sheets receive their resistances and Light, and new Druids receive their
  always-prepared Speak with Animals.
- Ability roll history is numbered Roll 1–6. Each roll shows its current ability
  assignment, and each ability shows its source roll and background increase.
  Tied values are allocated one occurrence at a time, without losing a score.

Rules were checked against the official [2024 Character Origins](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins)
and [2024 Equipment](https://www.dndbeyond.com/sources/dnd/br-2024/equipment).
The builder uses short explanations and structured equipment facts.

## Movement preview

The grid changes brightness on drag start/end, rather than being recalculated
for every pointer move. The old 3D preview cloned the model hierarchy and drew
each mesh/material group. In an eight-figure Balanced test at 844 × 390 on the
AMD integrated adapter, Druk's ghost added 43 color-pass draws.

The new preview bakes the same figure geometry into one unlit translucent mesh
while the asset is loading. It adds one color-pass draw, with the same 51,832
additional triangles in that comparison. Geometry is shared by model URL and
base center with reference-counted disposal. The figure's position, facing,
scale and normal scene depth are retained; previews remain local, cast no
shadows and never reveal a DM destination to players.

This measures rendering work, not a promised phone FPS gain. The headless
browser's unconstrained animation-frame rate is not a physical-device FPS
measurement and is deliberately not used as one. The mobile preview remains
the appropriate place for the user to judge actual touch responsiveness.

## Checks

Regressions cover background validation and equipment totals, preserved pack
notes, current roll assignments including tied scores, starting-feature
visibility, model-local geometry, indexed draw ranges and instanced parts.
Browser checks also exercise creating a character, actual stat rolls, mobile
controls and private player/DM movement planning.

Final validation: 17 browser regressions passed across focused runs, all 2,249
unit tests in 211 files passed, both type checks and the production build passed.
The installed campaign was not modified. The existing isolated mobile preview
serves the updated client and builder for physical-device review.
