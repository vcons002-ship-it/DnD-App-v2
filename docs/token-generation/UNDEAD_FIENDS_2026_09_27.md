# Undead and demon library expansion

Four new physical families and shared-library templates: Shadow (CR 1/2), Mummy
(CR 3), Quasit (CR 1), and Dretch (CR 1/4). Existing skeleton, zombie, ghoul,
ghost/specter, wight and imp families are retained.

## Rules and save behavior

New templates use SRD 5.2.1. The existing SRD 5.1 Quasit remains unchanged;
the curated library's new Quasit uses the 2024 block (25 HP, Rend +5).
`starter-undead-fiends-v1` adds missing entries once. Existing names are preserved,
including edited statistics, explicit `none` models, icons and tint choices.
Deleting a starter does not cause it to return at the next restart. Campaign
instances are never converted by this batch.

All four have rollable attacks, complete ability scores, CR, HP, AC, speed,
damage traits, named special actions, senses and languages. The Mummy's weapon
includes both `1d10+3` bludgeoning and `3d6` necrotic. Non-damage riders (Strength
drain, curses, conditions, daily uses and special saves) remain described DM
actions; this content addition does not introduce new rules automation.

Source: [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).
The project's README includes the required CC-BY-4.0 attribution.

## Actual asset workflow

- Built-in image generation produced a separate four-view sheet per creature.
  Prompts and actual source dimensions are retained per family. The tool returned
  1254-square sheets despite requesting 2048; no upscale was used. Extracted
  views are 619 square. This was a manual basic-miniature batch; the automated
  app's 2048-square source requirement is unchanged.
- Each creature has four distinct named inputs: front, back, left, right.
  Side views are assigned by their actual direction rather than trusting panel
  labels. No images from different creatures are combined in a model request.
- Hunyuan3D-2mv shape and Hunyuan3D-2 texture generation used all four references.
  Generation receipts verify both the checkpoint and named texture inputs:
  50 steps, guidance 5.5, octree 512, 10,000 chunks; seeds 927101 through 927104.
- `monster-reduction-v1` targets 20k body triangles with an error limit of 0.01.
  Opaque color textures use JPEG95, 4:4:4, without resizing the 2048-square atlas.
- The normal Blender cleanup and measured round base process is used. Runtime
  supplies the same raised dark-pewter treatment, affinity outline, facing,
  base-only click region and fog behavior as every existing monster family.
- Original dense and textured meshes remain in the local production workspace;
  selected references and receipts ship in `assets/miniatures/monster-provenance`.

The models are static tabletop miniatures. Quasit uses a Tiny combat footprint,
Dretch Small, and Shadow/Mummy Medium. Appearance tags are informational and
the default `natural` tint preserves their authored colors.

## Checks

Seed tests cover existing-save upgrades, preserving custom copies, keeping
deleted entries deleted, correct creature sizes, model resolution, and the
Mummy's damage rider. The browser scenario creates all four from the actual
library, places them alongside the party, and loads their real bundled models
in tilted and overhead views. Runtime model validation checks hashes, triangle
counts and embedded images.
