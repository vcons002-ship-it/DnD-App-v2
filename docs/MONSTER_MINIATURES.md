# Monster miniatures

The battlefield uses the approved reduced goblin, skeleton and wolf models.
Each instance uses the same renderer, base hit region, movement-facing formula,
5-foot Fit to map setting and local 2D/3D / overhead / 45-degree controls as PCs.
Models and textures are cached by URL; instance materials are cloned for tinting.

## Appearance

The template editor and a placed creature's **DM tools** expose:

- **3D family**: Automatic, 2D only, Goblin, Skeleton, Wolf. AI can assign other
  physical families (for example elephant); these use the existing 2D fallback.
- **Color**: Automatic from tags, named palette colors, or Natural.
- **Appearance tags**: comma/space-separated tags, also accepting `[fire]` syntax.

An explicit Color overrides color tags; the last color tag overrides theme tags;
otherwise the last recognized theme wins. Natural clears tint. Recognized themes
are fire, poison, ice/frost, lightning and undead. Tags do not grant damage,
resistances, conditions or other combat rules. Whole-model tint preserves texture
detail; white/natural are a neutral multiplier, not a new white texture.

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
Enemy player snapshots include public appearance without exposing combat stats.

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

| Family | Body + base triangles | Runtime bytes | Texture |
| --- | ---: | ---: | --- |
| Goblin | 20,000 + 764 | 1,564,924 | 2048 x 2048 JPEG95 |
| Skeleton | 20,000 + 764 | 1,768,908 | 2048 x 2048 JPEG95 |
| Wolf | 20,000 + 764 | 1,388,464 | 2048 x 2048 JPEG95 |

Source workspace: `DnD-token-models/geometry-test-v1/20k.glb` (goblin) and
`DnD-token-models/model-reduction-v1/{skeleton,wolf}/model.glb`. These derive from
the reviewed multiview models. Original masters and full generation/reduction
receipts remain in that art workspace, outside this repository.

The approved `monster-reduction-v1` policy targets 20k triangles with a geometric
error limit of 0.01, retains texture dimensions, and uses JPEG quality 95 / 4:4:4
only for opaque base-color-only images when smaller. Alpha/data maps stay intact.
No mesh compression or quantization is added. Reduction runs once on the master,
reloads and validates its output, and preserves the original. The prior reduction
tool uses glTF Transform 4.5.0, meshoptimizer 1.2.0 and Sharp 0.35.4.

For this integration, Blender fitted each reduced body by its foot contact to a
unit-diameter round base (top at 0.055). Desired body heights were 1.25, 1.75 and
0.9 units respectively, capped to keep feet inside radius 0.465. No additional
body simplification was applied. The original reduced JPEG bytes were restored
after Blender export to avoid another encoding pass. Bases add 764 triangles.

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

Verified 2026-09-23: typecheck and production build passed; 618 tests in 67
server test files passed; six focused browser regressions passed. The browser
checks include held-drag HUD concealment, player sizing and WebGL-loss fallback.

Reduced geometry lowers draw work per monster, and cached shared textures avoid
one download per copy. This is not GPU instancing: each miniature still incurs
draw calls. Crowded-board/mobile performance needs separate measurement.
