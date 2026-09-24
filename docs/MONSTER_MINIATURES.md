# Monster miniatures

The battlefield catalog contains 24 reduced creature families, including the
goblin, skeleton and wolf, humanoid archetypes, dragons and beasts.
Each instance uses the same renderer, base hit region, movement-facing formula,
5-foot Fit to map setting and local 2D/3D / overhead / 45-degree controls as PCs.
Models and textures are cached by URL; instance materials are cloned for tinting.

## Appearance

The template editor and a placed creature's **Token info** expose these DM-editable fields:

- **3D family**: Automatic, 2D only, and the families listed in
  `shared/monsterAppearance.ts`. Human guard/bandit/mage/commoner, dwarf
  warrior/commoner, elf/tiefling commoner, royal archmage, orc, hobgoblin, wight,
  troll, stone golem, ghost, werebear, treant, dragon, two-headed dragon, spider
  and snake join the original three. Other families retain the 2D fallback.
- **Color**: Automatic from tags, named palette colors, or Natural.
- **Appearance tags**: comma/space-separated tags, also accepting `[fire]` syntax.

An explicit Color overrides color tags; the last color tag overrides theme tags;
otherwise the last recognized theme wins. Natural clears tint. Recognized themes
are fire, poison, ice/frost, lightning and undead. Tags do not grant damage,
resistances, conditions or other combat rules. Whole-model tint preserves texture
detail; white/natural are a neutral multiplier, not a new white texture.
Palette colors include bronze, silver and brown. The two-headed gold/silver
dragon uses Natural to preserve its different head colors. Varro uses the
royal-archmage family: white robes, gold trim and a sheathed sword at his side.

Keep D&D category (`undead`, `humanoid`, `beast`) separate from physical family
(`skeleton`, `goblin`, `wolf`). Automatic matching is deliberately conservative:
exact family names, numbered variants, color/theme prefixes and dire wolf work;
wolf spider and goblin statue do not silently become wolves or goblins. A custom
name such as Ashfang works once the DM or AI assigns family `wolf`.

Creature AI creation and **AI fill** both request `modelType`, `modelColor`, and
`visualTags`. Fill passes existing appearance choices as context and rereads the
creature after the request, filling only empty fields so DM edits are preserved.
Unknown/invalid colors are ignored. Clearing a field makes it eligible for fill.
These fields survive templates, duplication, spawning and library save/load.
They belong to the creature's stored information, rather than a map placement;
the per-placement size control remains in DM tools.
Enemy player snapshots include public appearance without exposing combat stats.

## Rules space and miniature size

Occupied combat space follows D&D categories: Tiny 2.5 ft, Small/Medium 5 ft,
Large 10 ft, Huge 15 ft, Gargantuan 20 ft. An explicit size at the beginning of
creature type (e.g. `Large giant`) wins. Dragon age, named giant/dire variants,
and known model families supply defaults when no stat-block size is supplied.
The AI requests this size prefix. Unknown creatures default to Medium; custom
and unspecified dragons use Huge until the DM specifies otherwise. The werebear
catalog depicts its Large bear/hybrid form. Existing occupied widths are retained.

Visible miniatures are smaller than occupied space: a typical Medium NPC has
a 3.5-foot base, player characters use a slightly larger 4-foot base, and ordinary
goblins/wolves have 3-foot bases. Larger figures
scale at 70% of their combat width. The six large catalog models additionally
use tight bases with radius 0.48 around foot contact radius 0.465, producing
6.72/10.08/13.44-foot visible bases for Large/Huge/Gargantuan models. Tightening
the base does not enlarge the body or change combat space.

The compact 3D size control saves an independent `miniatureWidthFt` override.
Fit to map sets the visible base to 5 feet without changing occupied space.
Both roles share that override; copying a token preserves it. 2D fallback uses
the combat footprint. 3D hit tests, selection rings and HUD use the visible base.
Distance/range math continues to use occupied space. No live token widths are
rewritten by this change.

Rules reference: https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game

## Visibility and interaction

The existing role rules still apply: the DM sees everything; explicit Hidden
conceals from players; owners can see their own PC under fog; map fog conceals
other tokens; token fog conceals enemies/neutral creatures but not party allies.
The anchor/base cell determines visibility for the entire model and HUD, even
when its weapons extend into an open cell. The server filters snapshots before
models are chosen. Hidden live previews send only the already-known anchor and
a concealment flag, never the fogged coordinates. Local miniature drags also gate
the mesh against the same rule. Remote movement retains the existing tether
preview; local held drags preview facing from the drag's starting anchor.

Ready models use only their round base as a pointer target. Facing is
`atan2(end.x - start.x, end.y - start.y)` for each movement segment; zero-distance
moves keep their previous facing. Unavailable models/WebGL retain usable 2D art.

## Asset provenance and reduction

`client/public/miniatures/monsters/manifest.json` records exact bundled hashes,
source derivative hashes, geometry counts and measured base dimensions.

Current per-family sizes and triangle counts are recorded in the runtime
manifest. The wolf retains its earlier 1,388,464-byte multi-view derivative.
Goblin and skeleton were regenerated in raised-weapon poses during this
expansion. Earlier accepted masters remain preserved in the art workspace.

The 2026-09-23 expansion uses built-in Codex image generation, not Gemini, for
all source art. Per user direction, prompts are brief and simple humanoids use
one front image; the guard and Herald were already generated with four views.
Dragon, two-headed dragon, spider and snake use four distinct named views.
Armed combatants hold their weapons ready; the Herald keeps his sheathed sword.
The launcher-managed Hunyuan3D-2mv endpoint accepts the single named front slot
for one-view jobs. A one-view receipt is **not** a multi-view reconstruction.
Source images, prompts and receipts are archived under
`assets/miniatures/monster-provenance/`. The larger original GLBs remain in
`DnD-token-models/existing-families-v1/` in the art workspace.

The approved `monster-reduction-v1` policy targets 20k triangles with a geometric
error limit of 0.01, retains texture dimensions, and uses JPEG quality 95 / 4:4:4
only for opaque base-color-only images when smaller. Alpha/data maps stay intact.
No mesh compression or quantization is added. Reduction runs once on the master,
reloads and validates its output, and preserves the original. The prior reduction
tool uses glTF Transform 4.5.0, meshoptimizer 1.2.0 and Sharp 0.35.4.

For this integration, Blender fitted each reduced body by its foot contact to a
round base (top at 0.055; diameter 1, or 0.96 for tight large-family bases). Family-specific desired heights are
recorded in the workflow. Humanoid proportions use the existing PCs as a scale
reference, allowing limited toe overhang (radius 0.6) so wide combat stances are
not disproportionately shrunk. Other families retain the 0.465 foot-fit limit. No additional
body simplification was applied. The original reduced JPEG bytes were restored
after Blender export to avoid another encoding pass. Bases add 764 triangles.
The expansion follows this same policy; a body can finish a triangle below the
target or above it when required by the geometric error limit. The manifest
records the measured count, rather than assuming every body is exactly 20k.

## Existing campaign appearance backfill

`scripts/token-assets/backfill-appearance.py` applies a reviewed ID/name JSON
plan. It defaults to dry run; `--apply` requires a new `--backup` filename and
uses SQLite's online backup API. It adds only missing appearance columns,
fills empty fields, preserves current nonempty choices, skips renamed/missing
records, and verifies that each record's other fields remain unchanged inside
the transaction. It never changes stats, HP, equipment, rules, positions or fog.
Plans and database backups contain campaign data and stay outside Git.

The local 2026-09-23 backfill covered 334 monster records and the Cultist library
entry. Props and Mage Hand retain `none` (2D only); FIRST 1 remains unresolved.
Tests: `python scripts/token-assets/test-backfill-appearance.py`.
Asset/code deployment is separate from this appearance-only database update.

`node scripts/token-assets/validate-monsters.mjs` verifies exact runtime hashes,
sizes, GLB structure, embedded images, triangle counts and base contract; it runs
with every client build. This change does not enqueue new AI model generation.

## Verification

Server tests cover family/tag/color resolution, persistence, library round-trip,
AI response parsing and fill preservation, redaction, fog and movement facing.
The AI gateway is mocked in those tests; no new live-provider inference is claimed.
Browser regression tests load the actual bundled models in a disposable campaign
and exercise both roles, both views, DM appearance edits, base hits, dragging,
2D fallback/toggling, map/token fog and concealed previews.

Verified for the expanded catalog on 2026-09-23: typecheck and production build
passed; 621 tests in 67 server files and two backfill tests passed. Five browser
checks passed: all 24 families plus the three PCs, the real-map preview in both
views, independent tint/base hits/drag facing, whole-token fog concealment, and player/DM sizing with Fit to map.
The 24 runtime monster assets total 40.35 MB; each is 1.38-2.60 MB. Of the 23
new/replacement models, 17 used a single front image and six used four views.
The existing wolf is retained. Desktop checks are not a mobile performance test.

Reduced geometry lowers draw work per monster, and cached shared textures avoid
one download per copy. This is not GPU instancing: each miniature still incurs
draw calls. Crowded-board/mobile performance needs separate measurement.

Verified compact sizing: all 24 battlefield browser checks passed, including
mobile input, fog, base hits, UI, resizing, view persistence and fallback.
After final name/size inference refinements, the catalog and sizing browser
checks passed again. Existing distance tests also pass with visual overrides.

Player token names appear immediately above their health bars in 2D and 3D.
Combat-style badges are omitted for PCs and retained for monster tokens.
The player miniature default is 4 feet (about 14% larger than the earlier 3.5).
Explicit per-token miniature widths continue to take precedence.

Monster names sit below their bases and clear any visible health bar and
combat-style badge, keeping labels off the model art. Player names remain
immediately above their health bars. Labels never expand the base hit region.

Player snapshots omit numeric monster-name suffixes (including inherited
parenthesized counts); DM names and stored names stay intact. Roll-log and reveal
text use the same public names while dice, totals, and DCs retain their values.
No reveal-order numbering is assigned. Monster map labels use a compact single
line with ellipsis; full public names remain in hover and token details.
