# Shared visibility work across rendering modes

Baseline: `677a6921870d415f88da54346e08668a03a4c2d6`. Results are summarized in [the accompanying JSON](shared-visibility-2026-10-31.json).

Follow-up: [heavy mixed-mode browser comparison](shared-visibility-heavy-2026-10-31.md), with 141 tokens, 48 lights, three simultaneous viewers, and both normal and 6x browser CPU rates.

## Change and visual compatibility

Legacy and standard 2D/3D now share a base geometry calculation regardless of which mode requests it first. Requests in the same event-loop batch upgrade a queued job to include detailed outlines. If the basic job has already started or completed, the detailed request computes only the additional outlines; it does not rebuild or transfer the basic paths through the worker again.

Stationary lamps are cached separately from personal sight. A character's movement, personal darkvision radius, or exploration history no longer invalidates an otherwise identical lamp layer. Each viewer still receives their own authorized memory and token affinity. Different authorized light lists remain distinct.

The existing renderers, color constants, attenuation bands, spell effects, movement playback, mask generation, and image formats are preserved. This change shares their inputs; it does not introduce the separately proposed server-mask/local-color renderer. Regression checks compare the complete geometry and Legacy mask/lighting SVG inputs against an unsplit worker across daylight, regular/heavy darkness, walls enabled/disabled, remembered/revealed terrain, and transient spell lighting. Browser tests cover Legacy player/DM animation and switching server assist and rendering modes.

## Geometry benchmark

Four alternating before/after trials, 24 measured revisions following one cold geometry revision in each trial: 96 measured revisions per version/scenario. Four worker threads, 48 walls, 48 stationary lights. These are server geometry completion times, including worker dispatch and return, **not** full movement response times or browser paint times. All 576 measured output hashes per version matched their counterparts.

| Request pattern | Before mean | After mean | Change |
| --- | ---: | ---: | ---: |
| Legacy first, followed by matching 2D/3D requests | 3.73 ms | 2.14 ms | 43% faster |
| Standard first, followed by matching Legacy/standard requests | 3.29 ms | 2.33 ms | 29% faster |
| Legacy alone | 1.24 ms | 1.46 ms | 0.23 ms slower |
| Standard alone | 3.15 ms | 2.09 ms | 34% faster |
| Standard request after Legacy finishes | 3.46 ms | 2.67 ms | 23% faster |
| Three different personal viewpoints, mixed modes | 5.40 ms | 3.01 ms | 44% faster |

In the Legacy-first case, completed worker jobs fell from 48 to 24 for 24 warm updates. With a late standard request there are still two jobs per new sight revision: one base job and one outline-only augmentation. Stationary lamps reuse their cached result. Cold costs and actual worker CPU times are retained in the JSON; CPU time does not improve in every scenario, even where elapsed completion improves. Do not interpret the table as a universal CPU percentage reduction.

Reproduce the current implementation with:

```powershell
node --import tsx scripts/performance/shared-vision.mts artifacts/shared-visibility/current.json
```

For a comparison, supply a separately saved baseline module with its sibling worker/shared sources and dependencies resolvable, then use a new output directory:

```powershell
node --import tsx scripts/performance/compare-shared-vision.mts <baseline/server/src/visibilityWorkers.ts> <output-directory>
```

## Browser movement benchmark

Two trials per version in before/after/after/before order. Sixteen actual drags per mode/version; both the player and DM in Player view are throttled to 6x CPU, with the server unrestricted on the same Ryzen 7 7800X3D PC. The same client build is used for both server versions. The fixture is the courtyard map with one PC, two monsters, walls, heavy darkness, a carried lantern, and remembered terrain. These are same-mode player/DM comparisons; the geometry benchmark above exercises mixed modes and many lights. No artificial WAN latency, RAM restriction, video recording, or tracing. Legacy blocks WebGL; 2D/3D use their normal local renderers. This is not a full simulation of an old computer.

| Mode, assist enabled | Server response mean before → after | Player first-motion median before → after | DM first-motion median before → after |
| --- | ---: | ---: | ---: |
| Legacy | 172.5 → 161.8 ms | 286.0 → 262.4 ms | 286.2 → 264.9 ms |
| 2D | 37.0 → 38.5 ms | 247.7 → 232.9 ms | 194.2 → 194.1 ms |
| 3D | 39.3 → 37.8 ms | 383.3 → 356.1 ms | 316.1 → 294.9 ms |

Server response runs from receiving the move to emitting the prepared state for the player. Browser first motion is an instrumented paint estimate after drag release, including two animation-frame opportunities, not physical display scanout. Overlapping server stages must not be added together.

The per-trial browser results vary substantially. A 4,867 ms baseline 3D player outlier is retained in the results; it makes the pooled mean look much better after the change than a typical drag does. The 3D DM pooled mean worsened from 365.9 to 397.2 ms despite its lower median. The 2D player pooled mean worsened from 255.4 to 268.8 ms. Therefore these measurements do **not** establish a consistent end-to-end latency improvement. The strongest evidence is reduced duplicate work and faster geometry completion in the controlled mixed-mode benchmark. Most observed movement delay remains outside this geometry stage.

All runs use disposable test databases and servers. The installed app and live DnDServer were not updated.

## Validation

- Full unit suite: 2,436 tests passed across 248 files.
- Server/client typechecks and client E2E production build passed.
- Three browser checks passed: server-rendering controls/mode switching, Legacy player movement, and Legacy DM Player-view movement.
- Four browser benchmark runs passed (two baseline and two changed-server runs), each covering Legacy, 2D and 3D with assistance enabled.
