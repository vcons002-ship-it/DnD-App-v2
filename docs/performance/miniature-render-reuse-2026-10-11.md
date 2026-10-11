# Miniature render reuse — 11 October 2026

This batch reduces render preparation and draw submission while preserving model detail, lighting, visibility rules and effects. High batches identical static creature parts even when their nearby light selections differ. Balanced and Low retain ordinary light uniforms and require three matching instances; the initial wider shader path was slower on integrated graphics and was not retained for those presets.

## Implementation

- Retain local matrices for unanimated source models and only compose a token root when its position, scale or facing changes. Animated source models and added effects still update normally.
- Prepare scene world matrices once after animation and reuse them for shadows, batching, color and body-mask passes. Newly created batches receive their world transforms before rendering.
- High stores individual source selections in a float texture indexed by instance. Colors, darkvision detail, wall occlusion and shadow slots remain individual. Shared sight, hidden/invisible figures, special player effects and animated models keep their original render path.
- Warm both batched shaders ahead of use. Reuse projected visibility polygons and camera coefficients for light bands. Cache the health orb's CSS width through ResizeObserver instead of reading layout every animated frame.

## Measurements

Same Ryzen 7 7800X3D / 32 GB PC, Chrome 154 with verified AMD integrated or RTX 5090 D3D11 adapter. Player battlefield 1440 × 760, DPR 1, 45°. Mixed dungeon: 30 figures in daylight and 21 in heavy darkness, 23 walls, six placed lights, three lanterns. Tall mist, rain, embers, wet ground and light-source shadows remain enabled in the stress scenes. No recording, profiling or tests ran during timed measurements. Each phase was sampled twice (10 seconds still, 8 seconds rotation, about 11 seconds movement).

FPS is distinct browser animation frames containing an actual map draw, not monitor presentation. GPU timer queries omit SVG/backdrop composition. Main-thread busy percentage describes one browser thread, not total PC CPU usage.

| GPU / setting / phase | Before FPS | After FPS |
|---|---:|---:|
| igpu / high / effects: rotation | 42.4 | 46.2 |
| igpu / high / heavy: rotation | 20.8 | 21.4 |
| igpu / balanced / heavy: still | 46.9 | 49.2 |
| igpu / balanced / heavy: rotation | 28.3 | 29.4 |
| igpu / balanced / heavy: lantern movement | 41.3 | 42.6 |
| 5090 / high / heavy: rotation | 56.2 | 59.0 |
| 5090 / balanced / heavy: rotation | 59.6 | 60.3 |

High clear-scene color draws fell from 305 to 267 (12.5%); heavy-darkness draws fell from 248 to 232 (6.5%). Effects add two extra draws. On the 5090, clear rotation's main-thread busy share fell from about 59% to 52%, and daylight effects from 65% to 58%. These CPU savings do not increase an already refresh/scheduler-limited clear scene's FPS.

The integrated GPU remains the bottleneck in heavy darkness. Short-run results varied enough that a fresh Main build was also measured in the same session for comparison with the final Balanced candidate:

| Balanced integrated GPU | Fresh Main FPS | Final candidate FPS |
|---|---:|---:|
| heavy: still | 49.8 | 49.2 |
| heavy: rotation | 29.9 | 29.4 |
| heavy: lantern movement | 43.1 | 42.6 |

Do not interpret small FPS differences as a universal improvement. The initial all-preset per-instance shader reduced Balanced integrated performance to about 40 FPS still / 24 rotating / 34 moving, despite fewer draws. It was rejected. Final Balanced/Low keep the cheaper uniform path and the original three-instance threshold. High samples were collected before that preset adjustment; the High render path is unchanged by it.

## Verification and scope

- Typecheck, full production build and the full server suite passed (197 files / 2,002 tests).
- Browser pixel comparisons matched batched/unbatched lighting, tints, source selections, darkvision, moving instances and body-mask IDs; both High and shared-uniform paths were checked.
- Twenty-eight distinct targeted browser cases passed across runs and repaired reruns. They cover shadow contact/cache transfer, fog composition, silhouette/LOD, health-orb transparency/reduced motion, fog concealment/shared sight, movement/facing/recoloring, and continuous rotation with one paint per frame.
- The live campaign and installed DnDServer were not used or changed. This is a local feature-branch change, not a deployment.

Compact raw measurements: [JSON receipt](miniature-render-reuse-2026-10-11.json). Full traces and experimental measurements are retained outside Git in the disposable benchmark folder.
