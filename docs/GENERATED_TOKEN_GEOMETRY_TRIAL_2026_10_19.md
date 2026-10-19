# Generated-token geometry trial

Tested the accepted hybrid elf paladin, bandit and goblin at their current
approximately 20k body geometry and at 40k, 60k and 120k body budgets. The
saved 120k textured hybrid outputs are the source of every denser candidate;
no new AI generation or subdivision of the small model was used.

The initial comparison did not change live crafting. The accepted policy below
now connects these generated assets to preset and viewport-based loading, and
prepares the selected tiers for future AI crafting jobs.

## Controlled inputs

- Every variant uses the existing model's exact decoded 2K texture pixels and
  material settings. The source 4K texture upgrade is deliberately not part of
  this geometry comparison.
- Recover uniform scale and translation from retained UV landmarks shared by
  the dense mesh and existing miniature. At least 100 landmarks and 99% agreement
  within 0.0001 model units are required; mismatched sources are rejected.
  These models each matched more than 15,000 landmarks, with maximum errors
  under 0.0000001 model units.
- Keep the existing base positions, normals and world transform. The actual
  production renderer applies its normal procedural pewter base treatment.
- Reduce each candidate directly from its dense source, lock borders, and avoid
  Permissive simplification. Error limits are .004 at 40k and .002 at 60k.
- Finish every candidate with the existing verified lossless delivery encoder.

## Sizes

Accepted policy after the toggle review: generated characters retain a ~120k
High close-up, ~60k Balanced close-up and the existing ~20k Low/distant model.
Creatures keep the ~20k model on Balanced/Low, with ~120k only for High close-ups.
Each preset uses at most two files per family; off-screen models never request
the denser tier. Auto follows its resolved preset. These targets include a few
hundred additional base triangles. Existing custom Druk/Varis/Vanec tier counts
remain unchanged; they already have their reviewed quality tiers.

Decimal MB, standalone files including the same embedded textures. Actual
triangle counts include the existing base: 256 triangles for the elf and 764
for bandit/goblin. The current goblin body has 19,988 triangles.

| Model | Current / ~20k | 40k | 60k | 120k |
|---|---:|---:|---:|---:|
| Elf paladin | 3.99 MB | 4.38 MB | 4.68 MB | 5.53 MB |
| Bandit | 4.07 MB | 4.37 MB | 4.64 MB | 5.39 MB |
| Goblin | 3.68 MB | 3.98 MB | 4.25 MB | 5.01 MB |

## Performance

Production MiniatureLayer, 30 tokens (10 of each model), fixed Balanced graphics,
daylight courtyard map and map shadows, slow continuous camera rotation,
1440x960 at DPR1. Chrome headless, real D3D11 adapter verified. Two seconds of
warmup followed by 6.5-second samples, all four tiers in forward and reverse
order. No recording or simultaneous benchmark on the other adapter.

This isolates geometry. It excludes player vision/fog, mist, spells and network
transfer; these are not full gameplay FPS estimates. The 5090's flat ~4ms frame
times show no meaningful tier difference in this setup, not its maximum capacity.

| Body target | AMD integrated average FPS | AMD p95 frame interval | RTX 5090 average FPS |
|---|---:|---:|---:|
| Current ~20k | 79.6 | 16.0 ms | 254.3 |
| 40k | 64.2 | 17.8 ms | 253.7 |
| 60k | 55.7 | 20.1 ms | 253.9 |
| 120k | 41.9 | 26.6 ms | 253.1 |

The integrated result supports retaining lightweight distant models and loading
the higher tiers only where their visible detail is useful. It does not support
forcing the dense version on every creature in a crowded board.

## Repeat the asset trial

`scripts/token-assets/trial-generated-quality.mjs` accepts an input manifest:

```json
{
  "elf": {"master": "saved-120k-elf.glb", "current": "current-elf-with-base.glb"},
  "bandit": {"master": "saved-120k-bandit.glb", "current": "current-bandit.glb"},
  "goblin": {"master": "saved-120k-goblin.glb", "current": "current-goblin.glb"}
}
```

```sh
node scripts/token-assets/trial-generated-quality.mjs inputs.json NEW_OUTPUT_DIRECTORY
```

The output directory must not already exist. The command writes GLBs, receipts
and models.json, verifies the inputs were not altered, and leaves runtime
catalogs and campaign rows untouched. Each receipt includes alignment, source
hashes, actual counts, reduction settings and delivery verification.

Machine-readable counts, sizes, preservation checks and performance summary:
`assets/miniatures/generated-quality-trial/summary.json`.

## Review

<https://dnd.nic024i.app/uploads/previews/generated-geometry-20261019/>

The board uses the production miniature renderer with the selected files held
at fixed detail, so zooming cannot silently substitute another version. It
supports elf/bandit/goblin, current versus 40k/60k/120k, all four, overhead/45
degrees, figure facing, dragging to rotate/pan, zoom and swapping sides. Swapping
sides helps distinguish position-dependent metallic reflections from a change
to the model. Desktop and 412px mobile views loaded all models without errors.

For rapid comparison in one spot:
<https://dnd.nic024i.app/uploads/previews/generated-geometry-20261019/?mode=toggle>.
All four models stay mounted at the same map coordinates; only one is visible.
They are rendered during preparation under a cover to warm shaders and buffers.
Toggle switches between current 20k and the selected higher tier; Space performs
the same action, and Auto toggle alternates every 900ms. Camera, canvas size,
facing, map position and lighting stay fixed. Desktop and phone checks confirmed
that swapping starts no new GLB requests and keeps the canvas/camera unchanged.
