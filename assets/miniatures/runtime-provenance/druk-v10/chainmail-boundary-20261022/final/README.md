# Approved Druk model

`druk-high-source.glb` is the accepted full-detail model, including the revised
body and sword textures, beard, shoulders, collar, and repaired full-size
pauldrons. The rear inner pauldron edge restores the original chainmail and
leather strap appearance without shrinking the steel plates or moving their
surface. Crossing faces were subdivided at the material boundary, with original
and interpolated normals restored after Blender editing.

Source SHA256: `77cb574f0a29a10835b9415ee61ce40b6b6097c2f7022438ea3e185ccfe4001f`.
High contains 1,079,213 triangles. Balanced, Low, and Battlefield contain
454,903, 287,251, and 194,641 triangles. All retain the approved repaired
pauldron geometry, material boundary, UVs, and normals. Shared texture payloads
are identical across the four versions.

From the repository root, rebuild High and all reduced tiers with:

```sh
node scripts/token-assets/install-approved-druk-boundary.mjs
```

The command uses this immutable GLB, creates content-addressed shared deliveries,
records receipts, and updates only Druk's rows in the three runtime manifests.
It does not require the local Blender review master or earlier experiments.
The `blenderMaster` value in the approval receipt identifies that local review
archive; it is not a checkout dependency.

Verify delivery with:

```sh
node scripts/token-assets/validate-runtime.mjs
node scripts/token-assets/validate-quality-models.mjs
node scripts/token-assets/validate-battlefield-lod.mjs
```

The Battlefield reduction prioritizes seam and shading error limits over an
arbitrary triangle ratio. Protected repairs are preserved and larger surviving
models produce a performance advisory.
