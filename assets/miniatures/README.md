# Accepted static miniatures

This directory is the historical Druk v7 / Varis v3 review archive. The newer
live battlefield models and their integration are documented in
[Character miniatures](../../docs/MINIATURE_BATTLEFIELD_2026-09-20.md).

The separate [runtime provenance archive](runtime-provenance/manifest.json)
records the selected full-detail
battlefield revisions, including Varis's user-requested reuse of the accepted
Druk v7/v8 glove sculpts and his newly reconstructed shortsword and dagger.
Wrist fitting and local cuff edits are documented there. It does not replace
the historical review models or manifests below.

These are the selected high-detail **review assets**, not a new live VTT feature. No campaign token, database, server setting, or player workflow is changed by this package. The models have no rigs or character animations.

| Character | Selected revision | Model | Triangles | Size |
| --- | --- | --- | ---: | ---: |
| Druk, male half-orc fighter | v7 assembled-03, corrected right wrist | [druk.glb](models/druk.glb) | 421,725 | 48.4 MB |
| Varis, male half-elf ranger | v3 candidate-06, balanced beard tone | [varis.glb](models/varis.glb) | 368,344 | 28.6 MB |

Druk retains the separate bone-and-steel longsword and larger fitted hands. Varis retains his shortsword, dagger, and quiver; the bow was deliberately removed. Vanec has no accepted model in this package.

The [generation and refinement workflow](../../docs/token-generation/WORKFLOW.md) records the actual reconstruction routes, effective settings, selected prompts, assembly methods, preservation checks, and remaining limitations. The [manifest](manifest.json) identifies all delivered binary files by SHA-256 and byte length.

## Retrieve and validate

The two model binaries use **Git LFS**. Install Git LFS before retrieving them; a source ZIP or a checkout without LFS may contain pointer files instead of models. Ordinary app builds do not load these assets.

```sh
git lfs install
git lfs pull --include="assets/miniatures/models/*.glb"
node scripts/token-assets/validate.mjs
node --test scripts/token-assets/validate.test.mjs
```

Run commands from the repository root. The validator is read-only and needs Node.js 22 but no npm dependencies. It checks package hashes plus the supported GLB structures, accessor bounds, triangles, normals, embedded image signatures, and absence of animation/skins. It is not a full glTF conformance, anatomy, printability, or runtime-performance certification.

## Render both on a grid or your own map

With Blender 5.1+ on your path:

```sh
blender --background --python scripts/token-assets/render_preview.py -- --out .token-preview/review-01
```

To use a map image you have rights to use:

```sh
blender --background --python scripts/token-assets/render_preview.py -- --out .token-preview/review-02 --map "/path/to/map.png" --map-columns 19
```

PowerShell users with Blender outside PATH can replace `blender` with `& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"`.

The script uses a neutral grid by default and writes `tabletop.png`, `tactical.png`, and `receipt.json` into a **fresh** output directory. It verifies model hashes before import and again after rendering, and changes only scene placement and uniform scale. Both bases occupy 90% of one cell. A supplied map is flat artwork; its depicted walls do not become 3D geometry. Rendering does not start the app, access campaign data, or enable 3D tokens. Generated output is ignored under `.token-preview/`.

## Evidence and provenance

- [Druk full model](previews/druk-three-quarter.png), [grip front](previews/druk-grip-front.png), [grip side](previews/druk-grip-side.png).
- [Varis lit face](previews/varis-head-front.png), [lit side](previews/varis-head-side.png), [unlit face](previews/varis-head-albedo-front.png), [unlit side](previews/varis-head-albedo-right.png).
- `references/` contains selected AI-generated reconstruction input artwork. It is **not** evidence of model geometry; `previews/` contains actual exported-model renders.

Only accepted final models and selected supporting art are retained. Rejected iterations, local generation caches, private map uploads, campaign saves, service configuration, and map-preview scenes are excluded. Source image generation, Hunyuan3D reconstruction, and local mesh/material refinement all contributed to these assets. Consult the relevant generators' and checkpoints' terms before reuse; this package does not assert independent rights clearance or a new blanket asset license.

Before live use, separately implement and verify asset budgets/LODs, loading/caching, browser materials and lighting, selection behavior, and non-destructive opt-in token mapping. These dense review models are not claimed to meet a live multi-token performance budget.
