# Battlefield body reduction

The accepted earlier Druk repair was **61,202 triangles**, versus 51,832 in
the original Battlefield model. It replaced only the body armor/clothes and
arm primitives with a gentler reduction from Low: ratio `0.2`, error `0.002`,
locked borders, no Meshoptimizer `Permissive` flag. Protected components and
texture bytes were retained. The old geometry download grew from 1,319,656 to
1,715,688 bytes. The historical record is in the
[Druk component trial](DRUK_COMPONENT_TEXTURE_TRIAL_2026_10_18.md#cheap-battlefield-candidate).

## Repeatable production policy

`scripts/token-assets/reduce-characters.mjs --battlefield` now applies that
safer policy to body mesh nodes, including their material-split primitives.
Heads, separate hands, weapons, accessories, local repairs and effects retain
their existing reduction/preservation policy. Vanec already used conservative
body settings and retains his protected head and crown policy.

This avoids raising the triangle count of every accessory just to repair body
seams. It does not guarantee that arbitrary source meshes are watertight.
High, Balanced and Low models and the runtime tier-selection rules are unchanged.

This tier builder applies to the bundled character catalog. In-app creature and
hero crafting (including re-crafts and view refreshes) use the shared production
finishing pipeline to publish one reduced, compressed GLB per completed job;
they do not automatically publish four model tiers.

| Current character | Previous Battlefield triangles | Seam-safe triangles | Previous geometry bytes | Seam-safe geometry bytes |
|---|---:|---:|---:|---:|
| Druk, approved v29 | 59,021 | 67,543 | 1,475,284 | 1,710,180 |
| Varis | 74,034 | 81,756 | 1,799,740 | 1,985,464 |
| Vanec | 179,963 | 179,963 | 7,005,820 | 7,005,820 |

Counts differ from the old repair because Druk's current model has subsequent
approved hand, wrap and material changes. This is a geometry policy, not a
fixed triangle budget. Shared texture images are unchanged and remain cached
across tiers. Vanec's resulting geometry GLB is byte-identical to his previous one.

To regenerate from the current Low models, including shared-texture inputs:

```sh
node scripts/token-assets/reduce-characters.mjs artifacts/battlefield-lod-seam-safe --battlefield
node scripts/token-assets/install-battlefield-lod.mjs artifacts/battlefield-lod-seam-safe
node scripts/token-assets/share-character-textures.mjs
node scripts/token-assets/validate-battlefield-lod.mjs
```

The approved Druk installer also uses this policy for subsequent rebuilds.
Installation writes hashed runtime URLs and reconstruction receipts; remove
superseded/intermediate geometry files after preserving any wanted comparisons.

## Verification

- All textures remain byte-exact; materials and node transforms are preserved.
- Every non-body primitive was compared with its previous Battlefield version
  using triangle/vertex-attribute signatures independent of index ordering.
  All were exact: 35 Druk primitives, 77 Varis primitives, 34 Vanec primitives.
- Geometry indices and finite positions, source hashes, base transforms and
  shared-texture reconstruction passed the production asset validators.
- Typecheck and production build passed.
- Interactive comparison uses actual GLBs on one map, with the same lighting,
  scale and camera for both versions; supports desktop and phone.
- No new FPS benchmark was run for this modest geometry increase.

Machine-readable results: `assets/miniatures/battlefield-lod/seam-safe-summary.json`.
Review: <https://dnd.nic024i.app/uploads/previews/battlefield-seam-safe-20261019/>.
