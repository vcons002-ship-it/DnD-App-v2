# 3D chests and traps

Chest and trap objects now resolve to bundled 3D props by `objectKind`. Existing
saved objects require no migration or rename. A mimic remains a creature. Doors,
items and other object kinds retain their existing 2D rendering.

The Monsters 2D/3D preference controls these props for each viewer. Their tooltip
now includes chests and traps. Missing/failed models retain the 2D fallback.
Object props have no creature affinity outline, combat-style badge, random
creature tint variation, or round miniature pedestal. Explicit color choices
still apply. The existing compact size control adjusts the footprint.

The shared miniature renderer supplies camera projection, depth ordering,
lighting and shadows. The existing token footprint handles selection, menus
and dragging. Server-filtered visibility and the common fog-anchor check apply
unchanged; a concealed trap is never added to a player's miniature list.

Open/Locked chest and Armed/Disarmed trap conditions, loot and interactions are
unchanged. These first models are static: opening a chest changes its condition,
not the lid mesh. The jaw trap is the common visual for existing trap objects;
it does not change their damage or rules into a bear trap.

## Assets and repeatable production

| Prop | Triangles | Download size | Texture |
| --- | ---: | ---: | --- |
| Wooden chest | 20,000 | 1.63 MB | 2048-square JPEG95 |
| Iron jaw trap | 20,000 | 1.47 MB | 2048-square JPEG95 |

Built-in image generation created separate four-view reference sheets. The
returned chest sheet is 1254 square and the trap sheet is 1536 by 1024; views
are cropped without upscaling. Hunyuan3D-2mv consumed four named views for
shape and the installed named-multiview texture adapter consumed all four for
texturing. Receipts verify both, with 50 steps, guidance 5.5, octree 512 and
seeds 928401/928402.

The existing `monster-reduction-v1` reduction targets 20k triangles at 0.01
error and compresses opaque color maps with JPEG95/4:4:4 without resizing.
`prepare_object.py` grounds and centers the actual model footprint without a
pedestal. Existing packaging restores exact compressed image bytes after
Blender export. Source art and receipts are preserved under
`assets/miniatures/object-provenance`. Runtime manifests are separate from
creature families, so props never initiate creature-production jobs.

`validate-objects.mjs` checks hashes, counts, embedded textures/buffers, budgets
and absence of miniature bases on every production build. The browser regression
uses a throwaway campaign to load both props, hide/reveal the trap, select and
open the chest, switch views and 2D/3D, and check token fog.

## Verification and preview

Typecheck, all 915 tests, production build and the real-browser object regression
passed. The browser run exercised both DM/player views with the actual GLBs and
saved screenshots plus a recording. Mobile preview verified at 390 by 844.

[Map views and recording](https://dnd.nic024i.app/uploads/previews/objects-chests-traps-20260928/index.html)

Only static preview media is published; the live campaign application has not
been updated by this change.
