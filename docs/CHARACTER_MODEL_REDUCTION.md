# Lighter player model experiment

Review candidates generated on 10 October 2026 from the exact runtime models in
`client/public/miniatures/manifest.json`. The original catalog and GLBs remain
unchanged. Reviewed copies now ship as local graphics tiers: High uses originals,
Balanced uses conservative copies, and Auto/Low/Effects off use lighter copies. Campaign
token data and base sizes do not change.

| Character | Original triangles | Conservative triangles | Lighter triangles | Original MB | Lighter MB |
|---|---:|---:|---:|---:|---:|
| Druk | 880,404 | 277,100 | 142,186 | 24.97 | 14.97 |
| Varis | 905,238 | 348,006 | 203,252 | 25.47 | 16.23 |
| Vanec | 1,138,771 | 355,589 | 207,975 | 33.21 | 19.90 |

The lighter set totals 553,413 triangles, 81.1% fewer than the 2,924,413 original
triangles. Texture images remain byte-for-byte identical, including their
resolution and encoding. Roughly 34.4 MB of texture payload remains across the
three characters, so file-size reduction is smaller than triangle reduction.

## Repeatable process

From the repository root:

```powershell
node scripts/token-assets/reduce-characters.mjs D:/dnd-approved-release/character-reduction-20261010
node scripts/token-assets/build-reduction-review.mjs D:/dnd-approved-release/character-reduction-20261010
```

The generator creates two copies per character and JSON receipts. It welds exact
duplicate vertices, simplifies indexed geometry with Meshoptimizer, and applies
the existing lossless Meshopt delivery encoding. It does not quantize vertex
attributes, regenerate normals, resize textures or retexture the models.

Conservative copies target 22% of body/accessory triangles and 45% of head,
face, hand and wrist triangles, constrained by a 0.001 error threshold. Lighter
copies target 8% and 25%, constrained by 0.002. Targets are goals, not guaranteed
counts: UV seams, shape and attribute error constraints can stop simplification
early. Normal, UV and vertex-color values influence collapse selection. Borders
remain locked. Small pieces, lightning/glow geometry, repairs and wrist
transitions are preserved. Geometry simplification is lossy; retaining textures
does not guarantee identical close-up appearance.

Every export is reloaded and checked for valid indices and finite vertices.
Receipts verify exact texture bytes, material definitions, node transforms and
hierarchy, animation channels and untouched input hashes. Base placement metadata
is copied from the originals. All six candidates passed these checks.

## Visual review and performance measurement

The generated review page loads one character pair at a time, with matching
lighting and synchronized rotation. It offers front, 45-degree, overhead, back
and face views, plus both reduction strengths. It releases previous character
resources when switching. The review lighting is separate from battlefield
lighting; it is a shape/texture comparison, not a phone performance benchmark.

The opt-in browser test uses a throwaway campaign, all three player figures,
24 goblins and identical settings. Original, conservative, lighter and original
again are tested in sequence. Service workers must be blocked: otherwise the
app's persistent asset cache serves original GLBs despite route replacement.
The test verifies all three replacement responses and counts indexed drawing
work to confirm the lighter set really reaches the renderer. Earlier cached
runs are invalid for comparing model performance.

```powershell
$env:CHARACTER_REDUCTION_DIR='D:/dnd-approved-release/character-reduction-20261010'
$env:E2E_PORT='4341'
$env:PW_CHROMIUM='C:/Program Files/Google/Chrome/Application/chrome.exe'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/character-reduction.spec.ts --output=D:/dnd-approved-release/character-reduction-results
```

Set `CHARACTER_REDUCTION_ENV=plain` for daylight without mist, weather or shadows;
unset it for the three-light, dense-mist, rain/embers test. Measured GPU time is
the miniature rendering loop, not the entire app. Desktop results do not establish
Fold/mobile FPS improvements. The tier policy is documented in `GRAPHICS_PRESETS.md`. These earlier measurements
compare geometry alone, before the new batching and cache optimizations.

## Verified results

The heavier scene (three flickering lights, High mist/rain/embers, 27 figures,
1440x900 at DPR 2 on RTX 5090) drew about 66.6-67.1 million indices per frame
with originals, 29.6 million with conservative copies and 21.3 million with
lighter copies. This confirms a roughly 68% reduction in total indexed drawing
work on this board, including the unchanged goblins and additional passes.

All versions remained around 59-60 FPS. GPU median timing was 6.18-6.23 ms for
the originals, 7.16 ms conservative and 7.09 ms lighter. The plain scene was
also around 59-60 FPS, with original GPU timings varying from 3.16 to 4.07 ms
and candidates between 3.45 and 3.54 ms. These measurements do not demonstrate
a frame-time improvement on this desktop, despite the lower drawing work.
Single-point GPU utilization/power readings were lower with candidates, but
are insufficient to establish a reliable utilization or power saving.

Combined decoded geometry buffers fell from 95.98 MB to 26.94 MB (about 72%).
These are geometry-accessor bytes, not total GPU memory or texture memory.
Total delivered lighter GLBs are about 51.0 MB rather than 83.64 MB (39% less).
The next decision requires appearance review and a real mobile-board test;
triangle reduction alone is not evidence of a faster frame rate.

Validation: all six exports reloaded and passed preservation checks; 1,963 unit
tests passed; typecheck and production build passed; both cache-blocked browser
comparisons passed. Fifteen matched-angle screenshots and the interactive viewer
loaded without page errors. Earlier cached benchmark data is excluded.

Review: https://dnd.nic024i.app/uploads/previews/lighter-characters-20261010/index.html
Originals, candidates and receipts are also retained under
`D:/dnd-approved-release/character-reduction-20261010`.

## Varis weapon refinement review

The approved lighter Varis copy has a separate blade refinement candidate.
`sharpen-varis-weapons.mjs` modifies only the existing multiview-generated
shortsword and knife: thinner cutting edges and pointed tips, with a blade-only
steel material. It retains the original texture bytes, grip vertices, node
transforms, and all unrelated geometry. Normals follow the deformation through
its inverse-transpose derivative. No new weapon generation or hand fitting is
performed. The handles and guards retain their existing finish.

The candidate remains at 203,252 triangles and is 16.23 MB (16.12 MB baseline).
Splitting blade and handle materials adds primitives and about 112 KB, so this
is an appearance refinement, not a further performance optimization. The
High uses the original model; Balanced and Low use the sharpened reduced copies.

```powershell
node scripts/token-assets/sharpen-varis-weapons.mjs D:/dnd-approved-release/character-reduction-20261010/varis-light-ce7d0501c260.glb D:/dnd-approved-release/varis-weapons-20261010
node scripts/token-assets/build-varis-weapon-review.mjs D:/dnd-approved-release/character-reduction-20261010 D:/dnd-approved-release/varis-weapons-20261010
node scripts/token-assets/capture-reduction-review.mjs D:/dnd-approved-release/varis-weapons-20261010 varis front,tilt,overhead,sword,knife,map
```

The export validates exact preserved geometry/textures/transforms, finite
positions/normals, valid indices, and an unchanged triangle count. Six
matched-angle comparisons loaded without browser errors. This is studio
review lighting, not a gameplay performance measurement.

Review: https://dnd.nic024i.app/uploads/previews/varis-sharper-weapons-20261010/index.html
