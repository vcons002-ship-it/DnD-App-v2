# Server managed rendering and player controls — 2026-10-28

Follow-up: [Retained Legacy rendering](legacy-retained-rendering-2026-10-28.md) adds partial token-canvas painting, stable visibility tiles and prepared-frame reuse. The measurements below document the earlier single-mask implementation; the follow-up contains the current before/after comparison and its server CPU/request-count tradeoffs.

The default is server managed rendering **on**, independently of graphics quality. Unsaved graphics quality now defaults to **Low**. Existing explicit graphics preferences are retained.

## What ships

- Legacy visibility is calculated and painted in server workers. The browser receives a private PNG and displays it as an ordinary image, rather than building and painting the wall/light mask paths. Mask paths are omitted from this transport; affinity flags remain available.
- Token portraits and upright labels/health/badges are rendered into reusable server sprites from the viewer's already authorized snapshot. They reuse the same shared display resolver as the client. Enemy HP absent from a player snapshot cannot enter its sprite. Moving a token reuses its appearance images.
- Token hit regions, selection, hover, context menus, drag planning, targeting and character controls remain in the browser. Selection and initiative indicators remain live. Standard mode retains smooth movement and its 3D planning ghost. Legacy retains its existing reduced-motion behavior.
- Collision, difficult-terrain costs and advisory visibility during drag use server workers when management is enabled. The final movement command remains authoritative.
- Standard mode receives prepared wall polygons for stationary lights and accepted sight positions. It retains local perspective projection and its existing calculation for intermediate animated positions. Detailed attenuation, animated lighting, WebGL model rendering, shadows, effects and final screen composition remain local.
- Unchanged token decoration, including 3D HUDs and unsupported portrait sources, is cached locally to avoid repeating its individual text and shape painting. Uploaded raster portraits use prepared images; unsupported external/bundled sources retain the existing fallback.
- New Legacy joins wait for their first server artwork before mounting the complete token layer, avoiding a throwaway initial render of all fallback labels.
- Image decoding completes before matching positions and visibility are published. Superseded frames are discarded; HP feedback waits for the accepted rendering frame. Rejoin/disconnect invalidates pending frame work.

Images use per-connection media credentials and per-viewer asset grants. The content hash alone does not authorize an image request. Rendering uses a bounded worker queue and a 96 MiB shared image cache. This is CPU rendering through Sharp; the RTX 5090 is not used by this path.

## Controls and persistence

The **Server managed rendering** checkbox is available at startup and in the map view controls for both roles, in every graphics mode. A player's choice is saved in that browser and sent again on reconnect.

Authenticated DMs have **Server rendering controls** in the map view controls. Each board and connected player has Player choice / Force on / Force off. Here, board means the selected map. Precedence is:

1. Forced board setting.
2. Forced individual player setting, keyed by the existing durable browser identity.
3. That browser's preference, defaulting to on.

An owner override disables the affected player's checkbox and explains its source. It does not overwrite the player's saved preference. Restoring Player choice restores that preference. Board/player policies persist in the campaign database and survive backup/restore with board IDs remapped. Rendering off retains server authorization and game rules.

## Measured comparison

Two separate Chrome player contexts, both throttled to **20×** before initial campaign load and throughout movement; unrestricted Node server on the same host. Hardware: Ryzen 7 7800X3D, 16 logical CPUs, 31 GiB RAM. Room: 240 × 160 ft, 143 tokens, 48 lights, 28 wall pieces. Both players performed three alternating real mouse drags, six total.

GPU and accelerated Canvas2D were disabled and WebGL was blocked. No Playwright trace recording, video, or CPU profiler ran during these measurements. There was no network latency simulation or RAM cap. This approximates severe CPU pressure; it does not certify a particular old CPU, integrated GPU, Safari version, or WAN connection.

| Measurement | Server management off | Final default on |
|---|---:|---:|
| Combined browser main-thread busy time during six moves | 39,354 ms | 32,664 ms |
| Combined JavaScript execution time | 24,582 ms | 16,710 ms |
| Median release-to-visibility probe | 2,742 ms | 2,712 ms |
| Mean initial load to usable controls | 23,659 ms | 25,419 ms |
| Node process CPU time during movement window | 1,001 ms | 3,406 ms |
| Additional rendering-image HTTP bytes, both players | 0 | 1,841,753 |

Main-thread busy time fell **17.0%**, and JavaScript time fell **32.0%**. Visibility latency was effectively unchanged. Initial load was approximately **7.4% slower**, not faster. Do not infer a large latency win from the CPU reduction. The six-move sample is small and run order was not randomized. The movement observation window was 36.2 seconds off and 31.7 seconds on; totals cover the complete gesture sequence, not a fixed-duration utilization trial.

The final server used 358 MiB RSS at the end of movement, with no failed worker jobs or deliveries. Rendering image traffic averaged approximately 29 kB/s per player during this movement sequence, in addition to state messages. Idle unchanged images are reused. HTTP byte counts include image response overhead; Socket.IO payload counters in the raw reports are separate, uncompressed event-payload counts.

Raw data and screenshots:

- [Local rendering baseline](../../artifacts/server-rendering-off-20261028/results.json)
- [Final default](../../artifacts/server-rendering-final-20261028/results.json)
- [Final player screenshot](../../artifacts/server-rendering-final-20261028/player-1-20x.png)

The token-position probe uses Konva node coordinates and paint opportunities. It is not an independent pixel-level assertion of the committed artwork, particularly while a private drag ghost is active. The summary above therefore uses the visibility revision probe, not token-node timing, for latency claims.

## Full token-layer streaming experiments

The server can also paint all eligible normal Legacy token sprites into one transparent board image. Local body hit regions and selection/initiative overlays remain. Shared-sight tokens and unsupported sources retain their existing handling. This experimental path is available through `SERVER_TOKEN_COMPOSITE=1`; it is **off by default** because the measured candidates were worse.

| Candidate | Combined main-thread busy | Median visibility | Rendering HTTP bytes |
|---|---:|---:|---:|
| Separate cached sprites, first SVG image-display version | 32,446 ms | 2,688 ms | 1,841,753 |
| Single token layer, PNG | 40,214 ms | 2,832 ms | 8,781,179 |
| Single token layer + mask, lossless WebP effort 0 | 61,977 ms | 4,651 ms | 25,283,925 |

The WebP result is specific to this fast lossless encoding configuration and these live frames. It does not establish that all WebP settings perform worse. Earlier isolated static-mask tests with other encoding settings produced smaller WebP files; those results did not include the full live token layer and browser composition workload.

Experimental raw reports: [first sprites](../../artifacts/server-rendering-on-20261028/results.json), [composite PNG](../../artifacts/server-rendering-composite-20261028/results.json), [composite WebP](../../artifacts/server-rendering-webp-20261028/results.json).

## Why 2D tokens cost CPU

A token includes portrait clipping, text layout and outlines, health bars, tags, rings, icons and badges. React memoization avoids some component updates but does not cache their painted pixels. Konva can redraw every token's decoration when its shared layer changes. The prior [CPU diagnosis](legacy-cpu-diagnosis-2026-10-28.md) identified that repeated drawing as the largest attributable application hotspot; hiding token artwork while retaining hit targets reduced total main-thread work by about one third in that diagnostic run.

The current default removes much of that repeated vector/text work. Remaining browser work includes React/UI updates, decoding and compositing images, hit testing, camera transforms, map/grid drawing and detailed 3D rendering. Streaming more pixels also adds decoding, transfers and server work. These tests do not show that full board-image streaming is a faster default.

## Validation and deployment boundary

Targeted unit coverage includes policy precedence and authorization, portable persistence, mask pixels, private images, appearance-cache reuse, HP visibility, composite layer exclusions, detailed wall outlines, and reference-preserving deltas. Browser coverage includes startup, player preferences, forced board/player policies, reconnect, standard/Legacy switching, context menus, movement, and the existing map-editing/rotation/prompt regressions.

Tests use disposable databases and uploaded fixtures. The working client is built locally; the live DnDServer service and live campaigns were not restarted or modified for these tests.

Verification: 2,336 unit tests across 230 files passed; 10 targeted Chromium browser regressions passed; client/server type checks and the production client build passed. Native macOS Safari was not exercised in this run.
