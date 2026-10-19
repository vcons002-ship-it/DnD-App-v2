# Shared character textures and model detail tests - 18 October 2026

**Later update:** [two-tier loading and High-preset hardware tests](TWO_TIER_MINIATURES_2026_10_18.md)
supersede the four-tier loading policy below. The storage receipts and original
measurements remain historical evidence.

The twelve Druk, Varis and Vanec model tiers now share their exact encoded
textures. No geometry, texture pixels, material values, animations, bases,
attachments or effects were changed.

| Active character assets | Before | After |
|---|---:|---:|
| All twelve tiers, including their textures | 237,916,248 bytes | 132,855,756 bytes |
| Image storage across the tiers | 137,516,376 bytes | 32,450,820 bytes |

The total saving is **105,060,492 bytes (44.2%)**. There are 26 unique encoded
images, including images shared between different characters. The new geometry
files total 100,404,936 bytes. Sizes use decimal MB and exclude the unchanged
separate Druk base texture and Vanec FX manifest.

This saving primarily removes repeated downloads/cache entries when different
model tiers are used. A first visit using only one tier is not 44% smaller.
Browser caches from older builds may retain old URLs until eviction or a cache
clear. This does not remove old Git history. Sharing download URLs does not by
itself promise deduplication of all decoded textures in GPU memory.

## Preservation and delivery

`scripts/token-assets/shared-character-textures.mjs` moves embedded images to
SHA-256-named files, adjusts storage offsets, and preserves all buffer-view
indices. A small unused four-byte placeholder replaces each former image
buffer view. Geometry, Meshopt streams and animation bytes are copied unchanged.

Each receipt retains enough information to reconstruct the original standalone
GLB and verifies its original SHA-256. Build validators check this reconstruction
for every tier, then continue checking the existing compression/reduction
receipts, texture hashes, decoded pixels, triangle counts and base measurements.
The shared images use the existing persistent visual-asset cache across maps
and campaigns. New hashed geometry URLs avoid confusing old cached GLBs with
the new delivery layout.

- Install or verify: `node scripts/token-assets/share-character-textures.mjs`
- Focused regressions: `node --test scripts/token-assets/shared-character-textures.test.mjs`
- Standalone export: `node scripts/token-assets/export-character-model.mjs druk high output.glb`

The installer is idempotent. Old delivery files were removed from the runtime
bundle after verification; historical receipts still identify those originals.
Standalone export reconstructs them without depending on the removed files.

## Model detail performance

The existing behavior remains: quality settings cap the model tier, while
projected on-screen base size selects a lighter model at greater distance.
Balanced cannot select High, and Low cannot select Balanced or High. Auto uses
its resolved performance tier. The new shared texture delivery applies to all
tiers and does not change the thresholds or their hysteresis.

Two different tests were used:

1. Production `MiniatureLayer`, continuous slow camera rotation at 1440 x 960,
   DPR 1. Tests cover three figures and a deliberately excessive twelve-character
   stress case at two zoom levels. A second rendering scene adds four flickering
   lights and their shadows, 20 walls, tall mist and rain. These isolate rendering
   and do not include player visibility calculations or the full app interface.
2. Actual player `MapStage` in a disposable thirty-token campaign: Druk, Varis,
   Vanec and 27 monsters, 23 walls, six lights, three lanterns, heavy darkness,
   8-foot mist at 65%, rain and embers. Balanced preset, 45-degree view, with
   stationary and repeated lantern-bearing token movement. Four ABBA loads
   compare zoom-based detail against forced Balanced character models.

Chrome's WebGL adapter string verified the real AMD integrated GPU or RTX 5090
for each test. No recording ran during timing. The gameplay test counts painted
renderer frames separately from browser RAF callbacks, since the renderer caps
its own drawing cadence and RAF alone can overstate visible scene FPS.

The crowded player-map measurements on the AMD integrated GPU were:

| Balanced preset | Fixed Balanced models | Zoom-based models | Change |
|---|---:|---:|---:|
| Stationary scene | 42.2 FPS | 51.1 FPS | +21% |
| Lantern-bearing character moving | 39.0 FPS | 45.8 FPS | +17% |

These are painted map frames, averaged over two samples per condition. They are
measurements of this disposable MapStage scenario, not a guaranteed FPS for
every campaign or the entire player HUD. Twenty-eight miniatures were rendered.
The same figures, textures, lighting and visibility logic were used in both modes.

In the isolated three-character scene with lights/mist, zoom detail improved
AMD RAF cadence by about 46% at the far zoom and 21% nearer in. The twelve-character
stress test also showed a large Balanced-tier difference. Low-tier benefits were
small or inconsistent, including a regression in one far-zoom stress case; zoom
detail is not universally faster. On the RTX 5090, both choices reached the
roughly 253 Hz browser RAF ceiling in the tested rendering scene, so that test
cannot quantify spare GPU capacity or a smaller underlying cost difference.

**Decision: retain zoom-based detail with the existing quality-setting ceiling.**
Its measured integrated-GPU benefit is useful, and shared images remove most of
the storage penalty for keeping multiple geometry tiers. No LOD thresholds or
normal-app quality behavior were changed.

Raw measurements: [crowded player map](performance/character-lod-2026-10-18/full-app-lod.json),
[AMD rendering](performance/character-lod-2026-10-18/igpu-heavy-lod.json),
[RTX 5090 rendering](performance/character-lod-2026-10-18/5090-heavy-lod.json),
[geometry isolation](performance/character-lod-2026-10-18/igpu-lod.json).

## Repeating the tests

Use an isolated preview server and data directory, not a live campaign. The
bundles below are only benchmark pages; their fixed-model override is not part
of the normal application build. Replace paths and adapter LUIDs for another PC.

```powershell
node scripts/performance/build-character-lod.mjs <preview-data>/uploads/character-lod-bench
$env:LOD_BENCH_URL='http://localhost:4374/uploads/character-lod-bench/'
$env:IGPU_LUID='0,95049'
$env:NVIDIA_LUID='0,87834'
node scripts/performance/benchmark-character-lod.mjs
node scripts/performance/benchmark-character-lod.mjs --heavy
node scripts/performance/benchmark-character-lod.mjs --heavy --nvidia

$env:LOD_BENCH_SERVER='http://localhost:4374'
$env:LOD_BENCH_SECRET='<isolated preview DM passphrase>'
node scripts/performance/create-character-lod-gameplay.mjs
node scripts/performance/build-character-lod-gameplay.mjs <preview-data>/uploads/lod-full-app tmp/character-lod-benchmark/full-app-fixture.json
node scripts/performance/benchmark-character-lod-gameplay.mjs tmp/character-lod-benchmark/full-app-fixture.json
```

Results default to `tmp/character-lod-benchmark` (`LOD_BENCH_RESULTS` overrides
this). The private gameplay fixture contains its test-server passphrase; only
its code and character IDs are copied to the public benchmark page.
