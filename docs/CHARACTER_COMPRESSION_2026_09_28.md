# Lossless delivery compression for all three characters

The runtime bundle now uses the same additional lossless workflow for Druk,
Varis and Vanec. Druk's September 27 size experiment had not been installed in
the app: all three manifest entries still pointed to the earlier Meshopt-only
copies. The selected sculpts, faces, weapons, bases and animation remain intact.

Sizes below are decimal MB and exclude Druk's separate basalt texture and
Vanec's small FX sidecar, both unchanged.

| Character | Previous GLB | Current GLB | Saved | Triangles retained |
| --- | ---: | ---: | ---: | ---: |
| Druk | 35.75 MB | 24.97 MB | 30.2% | 880,404 |
| Varis | 39.95 MB | 25.47 MB | 36.2% | 905,238 |
| Vanec | 47.60 MB | 33.21 MB | 30.2% | 1,138,771 |
| Total | 123.29 MB | 83.64 MB | 32.2% | 2,924,413 |

## What is preserved

- All 27 texture images retain their exact decoded RGBA pixels and dimensions.
  PNG atlases use lossless WebP or improved PNG encoding when smaller and
  pixel-identical. Existing JPEGs are copied without re-encoding.
- Every triangle retains the exact bytes of its corner attributes, including
  positions, normals and UVs. Verification permits cyclic rotation of an
  index triplet and reordered triangles, but not reversed winding or changes
  to any triangle's content. No simplification or quantization is applied.
- Node transforms, hierarchy, materials and scene definitions are unchanged.
- Vanec retains all 16 animation channels, exact keyframe bytes/interpolation,
  and his existing FX sidecar and spell-triggered lightning integration.

Exact duplicate vertices are shared rather than stored repeatedly. Across
mesh primitives, the position counts drop from 4,526,438 to 1,895,230. This
reduces duplicate vertex data while retaining all triangles. Texture resolution
and triangle rasterization cost remain unchanged, so the download saving is
not a promise of the same percentage increase in frame rate.

## Runtime wiring and verification

The shared player/DM manifest uses new SHA-named URLs:

- `druk-c98df869b913.glb`
- `varis-264feff1b076.glb`
- `vanec-7f57d87ce42f.glb`

The preview packager reads that same manifest. Its published interactive dungeon
therefore loads the compressed copies too. Existing cached original URLs remain
valid; clients download each new URL once and can reuse it across maps. The
historical source files remain unchanged. New binaries use the repository's
existing scoped regular-Git exception policy while LFS is out of quota.

Receipts are under [character-compression](../assets/miniatures/character-compression).
Each records input/output hashes, the geometry proof, decoded pixel hashes,
animation checks and vertex counts. The build validator now requires this
optimization for **every** player model, verifies receipt/file hashes, and
decodes every embedded image to check its pixels and dimensions. This prevents
silently reverting only one character to an unoptimized or altered copy.

The existing Three.js loader supports `EXT_texture_webp` and Meshopt. Build and
browser validation must run against the installed manifest, rather than only
loading a standalone test model.

Validation on September 28: typecheck, production build and all 933 tests passed.
The real-app miniature loading/labels/movement/hiding check and the two-player
darkvision test passed with the installed new URLs. Vanec's cast-glow check
missed the transient pulse in the initial concurrent run; isolated checks with
both the original models and the compressed models passed, including spell-slot
spending, effect expiry, reduced motion and no replay after reload/2D switching.
The public preview loaded all seven models without errors and passed movement,
camera and personal-visibility checks after publication.

## Repeatable workflow

For a future approved model revision, first package its full-detail Meshopt
source and source-image hashes in the character manifest, omitting the previous
`deliveryOptimization`/receipt/runtime-image fields. Then:

```powershell
node --max-old-space-size=8192 scripts/token-assets/compress-characters.mjs artifacts/character-lossless
node scripts/token-assets/install-character-compression.mjs artifacts/character-lossless
node scripts/token-assets/validate-runtime.mjs
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Compression skips already optimized entries. The installer verifies all supplied
receipts before changing the manifest, preserves the originals, and is a no-op
when that exact batch is already installed. Use a fresh output directory for
each new revision; retain reviewed receipts with the final assets. No server
generation or compression runs during play.
