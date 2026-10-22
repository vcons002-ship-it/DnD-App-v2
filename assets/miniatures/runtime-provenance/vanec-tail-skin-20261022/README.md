# Vanec: tail matched to skin

Vanec's tail uses the same muted lavender family as his existing facial skin. Its scale texture, highlights, and shadows remain visible. The robe, armor, face, hair, hands, staff, base, and spell FX are unchanged. Varis is a separate character and was not edited.

## Accepted files

- `vanec-tail-high-source.glb`: self-contained corrected High, SHA256 `57d680b34a48eb124f8f096e96adfc843be7ebfbfdc17be3d5b0d2d91ed9bcfd`.
- `body-original-exact.png`: immutable, exact decoded body atlas before the tail correction.
- `tail-skin-color.png`: accepted corrected atlas at its original 2048 � 2048 resolution.
- `tail-mask-core.png`: tail UV coverage selected from the surface in Blender5.1.
- `non-tail-protection-mask.png`: all other body/robe UV coverage, protected from paint.
- `tail-paint-mask.png`: final accepted paint region, including a small filtering gutter outside protected UV regions.
- `paint-receipt.json`: exact before/after decoded pixel hashes, color transfer parameters, and pixel counts.

The complete source is a GLB with its original materials and animations. It can be imported in Blender for later editing. An editable review scene is not required to reproduce the delivery files.

## Authoring method

Blender surface picking and a connected face selection isolated 6,949 tail triangles. Their UVs cover 35,052 pixels of the body atlas. The final mask protects 196 border pixels also covered by non-tail faces and adds a two-pixel atlas gutter only where other body/robe faces are absent. Exactly 45,731 RGB pixels change; all other pixels and the complete alpha channel remain exact.

The approved skin reference is sRGB `[151, 131, 144]`, sampled from the existing facial texture. The OKLab transfer changes the tail's median lightness and chroma to that reference while retaining 95% of its local lightness variation and 10% of local chroma variation. This keeps the existing scale detail and shading.

Only image0 is replaced in each existing tier. The embedded buffer is spliced directly, so encoded geometry, normals, UVs, node transforms, material properties, animation payloads, and all other images remain byte-for-byte unchanged. No simplification or model export is rerun. The four deliveries share the same corrected body texture.

## Reproduce and verify

Install the normal repository dependencies first. Run from the repository root; the script resolves its asset inputs from its own location:

```powershell
node scripts/token-assets/rebuild-vanec-tail.mjs --out C:/Temp/vanec-tail-reproduction
```

The output folder must be separate from application and source asset directories. The command:

1. Checks the immutable source pixels and reads the tracked paint/protection masks.
2. Repeats the approved color transfer, verifying the exact edited RGBA hash.
3. Encodes the same lossless WebP and verifies its pixels.
4. Restores each current High/Balanced/Low/Battlefield delivery from its shared-texture receipt, replaces only image0, and reproduces the embedded and shared GLBs.
5. Requires every resulting model hash to equal its current approved receipt and writes `reproduction-report.json` plus the recovered files under the separate output folder.

The command reads only tracked repository inputs. It has no dependency on temporary review folders, local absolute model paths, live server data, Blender, or the original AI worker. PNG container bytes may differ between encoders; the accepted RGBA pixels and all four delivery hashes are verified exactly. With the repository's locked dependencies, the generated WebP SHA256 is `24908f0a14a181901cbbdb1832bd3be727f024946c80b230d0f11778c7649067`.

## Runtime installation and validation

The corrected models are already registered in the committed runtime manifests, using unique hashed URLs so an old cached body texture cannot replace this version. A normal checkout/install/update followed by the app's build deploys those assets; this authoring tool does not rewrite a campaign or live app.

The runtime model/receipt chain is:

| Tier | Shared model | Triangles | Shared GLB bytes |
| --- | --- | ---: | ---: |
| High | `vanec-tail-high-shared-bb819190f4f0.glb` | 1,138,771 | 20,907,872 |
| Balanced | `vanec-tail-balanced-shared-86f0baef5cb6.glb` | 355,589 | 10,456,572 |
| Low | `vanec-tail-low-shared-3512f25137d4.glb` | 207,975 | 7,599,952 |
| Battlefield | `vanec-tail-battlefield-shared-de2e340c454c.glb` | 179,963 | 7,005,820 |

Receipts are in `assets/miniatures/shared-textures/vanec-tail-*-20261022.json`, `assets/miniatures/character-compression/vanec-tail-20261022.json`, `assets/miniatures/character-reduction/vanec-tail-{balanced,low}-20261022.json`, and `assets/miniatures/battlefield-lod/vanec-tail-20261022.json`. The High source and derived source hashes all refer to the corrected texture version.

From the repository root, validate after a release/install:

```powershell
node scripts/token-assets/validate-runtime.mjs
node scripts/token-assets/validate-quality-models.mjs
node scripts/token-assets/validate-battlefield-lod.mjs
```

The body texture is 486 bytes smaller than before. The separated shared GLB sizes and all triangle counts are unchanged.
