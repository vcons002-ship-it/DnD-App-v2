# Retained Legacy rendering — 2026-10-28

Follow-up: [Per-movement pipeline timing](movement-pipeline-timing-2026-10-28.md) separates accumulated server CPU from command-to-frame latency, image readiness and browser state-to-display work.

Legacy mode now preserves unchanged token pixels and replaces changed server visibility tiles. In two paired heavy-room trials, combined browser main-thread busy time fell by **24.7%** on average. Pooled median release-to-visibility time fell by **10.1%**. Initial load did not improve.

## Implementation

- The two Legacy token canvases retain their pixels. Moving, changing, hiding, adding or deleting a token invalidates its previous and current screen bounds. Only intersecting tokens and private movement overlays are painted again, in the existing order, so overlapping artwork is restored correctly.
- Unchanged art caches, labels and token controls remain in place. Hit testing uses retained regions; its map is retained during a drag and refreshed on release. Pan, zoom, resize and mode changes request full paints. A sufficiently large change also falls back to a full paint.
- Chat and roll feeds subscribe separately from the map. Feed-only changes do not repaint tokens. The server also reuses prepared artwork and visibility when their input has not changed. Roll-related board controls retain their own relevant subscription.
- New clients negotiate rendering protocol 2. Legacy server masks use a fixed map resolution and a stable grid of 512 × 512 pixel PNG tiles. Pixel-content hashes identify unchanged tiles, worker caches avoid re-encoding them, and state deltas preserve unchanged tile objects. Only missing image keys are fetched and decoded. Matching visibility and positions still publish atomically.
- The server **still computes sight and rasterizes the full mask before extracting and comparing tiles**. This is not incremental server line-of-sight calculation. Bounds exceeding the 8-million-pixel worker limit use the existing bounded single-mask fallback. Older protocol-1 clients retain single-mask compatibility.
- Server image credentials and per-viewer grants continue to protect tile and token images. Caches and the worker queue remain bounded.

Retained token painting applies to Legacy mode, with either server-assisted sprites or the existing local artwork fallback. Feed isolation and prepared-server-frame reuse also apply to standard mode. Standard 3D models, perspective, animation and effects continue using their existing local rendering path. The experimental full-token-image stream remains off by default.

## Test method

Four separate disposable-server runs, in order: before, after, before repeat, after repeat. Both sides use the same built client and server assistance on. The before case sets the internal benchmark switch `localStorage['dnd-retained-rendering']='off'`, which restores full token-layer redraws and protocol-1 single masks. The after case uses the new defaults. No live campaign data or service configuration is changed.

- 143 tokens total, including 140 goblins and 3 PCs; approximately 122 server token images visible to each player in the final position.
- 48 lights, 28 wall pieces / 112 edges, 240 × 160 ft room with a 3840 × 2560 background.
- Two independent player browser contexts, each throttled to **20× CPU slowdown before campaign load** and throughout movement.
- GPU and accelerated Canvas2D disabled; WebGL blocked. No model loads or WebGL attempts in any measured run.
- Ryzen 7 7800X3D, 16 logical CPUs, 31 GiB RAM, Chrome 156.0.8078.49. Node server unrestricted on the same host. Server rasterization uses CPU workers, not the RTX 5090.
- Six alternating real mouse drags per run, three per player. No video recording, CPU profiler or Playwright trace during measurements. No simulated network latency or RAM cap.

Main-thread and script numbers sum both players over the complete six-gesture sequence. The sequence takes different elapsed time in each case; these are not fixed-duration utilization measurements. Visibility timing observes the displayed mask revision and allows two animation-frame paint opportunities after pointer release. It is a browser probe, not a camera measurement. The token probe now includes the art group's offset to avoid mistaking the pointer-following wrapper for committed artwork.

## Results

| Measurement | Before, run 1 / run 2 | Retained, run 1 / run 2 |
|---|---:|---:|
| Combined main-thread busy time | 37,238 / 33,314 ms | 27,440 / 25,665 ms |
| Combined JavaScript execution | 19,244 / 17,132 ms | 18,366 / 17,292 ms |
| Median release to visibility, six moves | 3,027 / 2,696.5 ms | 2,628 / 2,514.5 ms |
| Mean initial load to usable controls, two players | 29,455 / 25,726.5 ms | 29,187.5 / 27,312.5 ms |
| Node CPU during movement window | 3,249 / 3,469 ms | 4,828 / 4,469 ms |
| Server RSS after movement | 349 / 367 MiB | 389 / 404 MiB |
| Rendering-image HTTP bytes, both players | 1,841,753 / 1,841,753 | 1,756,761 / 1,756,761 |
| Rendering-image HTTP requests, both players | 77 / 77 | 193 / 193 |
| Elapsed movement observation window | 36,425 / 32,289 ms | 24,886 / 23,413 ms |

Across the two runs per case:

- Mean combined main-thread busy time: **35.28 → 26.55 seconds, 24.7% less**. Each pair improved, by 26.3% and 23.0% respectively.
- Pooled median of 12 visibility samples per case: **2.855 → 2.568 seconds, 10.1% faster**. Severe CPU throttling still leaves substantial input/visibility delay.
- Mean script execution: **18.19 → 17.83 seconds, 2.0% less**, with the second pair slightly higher. Most of the observed gain is outside JavaScript execution; these unprofiled trials do not assign every remaining native/browser cost to a specific subsystem.
- Mean initial load: **27.59 → 28.25 seconds**, approximately 2.4% slower. There is no demonstrated startup gain.
- Mean server CPU: **3.36 → 4.65 seconds**, approximately 38.4% more. Mean observed server RSS rose by 38.5 MiB. No worker or delivery failures occurred.
- Image HTTP bytes fell **4.6%**, while request count rose from **77 to 193**. Tile delivery is not a demonstrated WAN bandwidth/latency win; a high-latency connection could behave differently.
- Retained counters recorded **zero full token-scene repaints during movement** in both enabled runs. Changes used partial painting; input hit maps can still refresh fully on drag release. Visibility changes may legitimately alter multiple tiles and several tokens' sight classifications.

These are two paired simulations on one PC, not certification for a particular old processor, integrated GPU, Mac/Safari or real remote connection. Run order was not randomized. The result supports keeping unchanged token pixels, with a measured server CPU / request-count tradeoff for mask tiles.

## Verification

The dedicated browser regression compares retained canvases against fresh ordinary Konva full paints. It covers movement near other tokens, selection, hidden opacity, deletion, spawning, real dragging, context menus, pan, zoom, resize, server-assist toggles and Legacy/standard transitions. It permits an 8/255 per-channel tolerance for canvas edge rounding. A feed-only update adds no token paints.

Unit checks compare every decoded tile pixel against the corresponding full-mask pixels exactly, verify stable keys outside a changed area, enforce private grants, retain unchanged tile references in player/DM-party deltas, remove obsolete tiles, and verify feed updates reuse prepared server output.

Final validation: **2,341 unit tests in 231 files passed**, all **11 selected browser regressions passed**, all four heavy-room benchmark runs passed, root typechecking passed, and the production build including model validation passed. Browser regressions include DM player visibility with light/wall editing, policy enforcement, state resynchronization/rejoin, startup mode selection, rotation controls and saved damage-prompt dismissal.

Raw measurements and screenshots:

- [Before, run 1](../../artifacts/legacy-retained-before-20261028/results.json)
- [Retained, run 1](../../artifacts/legacy-retained-after-20261028/results.json)
- [Before, run 2](../../artifacts/legacy-retained-before-repeat-20261028/results.json)
- [Retained, run 2](../../artifacts/legacy-retained-after-repeat-20261028/results.json)
- [Retained player screenshot](../../artifacts/legacy-retained-after-repeat-20261028/player-1-20x.png)

The live DnDServer service was not restarted for this work. Builds and tests establish workspace behavior; a running server process requires its normal restart/update to load server changes.
