# Server-derived Legacy visibility: current split and proposed next steps

**Implementation update:** worker-derived Legacy geometry, movement previews and negotiated state deltas have now been implemented. See [implementation and test report](server-offload-2026-10-28.md). The design discussion below is retained as the original proposal.

Source audit on 2026-10-28. This document proposes a protocol change; that change is not implemented by the canvas/GPU preference optimization.

## What already happens on the server

`server/src/visibility.ts` builds per-viewer snapshots. It decides token eligibility using ownership, manual fog, line of sight, lights, darkvision and applicable creature rules. The DM's Player view requests a combined party-shaped view. Players must continue receiving only their authorized information.

`server/src/exploration.ts` already computes visibility polygons and polygon unions for exploration memory, with a bounded cache. Movement validation/collision and game-rule outcomes are also authoritative server operations. AI image-mask conversion uses Node/Sharp on the server; it is not a DM browser image-processing job.

## What still costs browser CPU

`client/src/canvas/legacyVision.ts` raycasts sight and light outlines and caches SVG path strings. Moving an origin changes its cache key; editing walls invalidates its geometry cache. `LegacyVisionOverlay.tsx` applies the masks in the browser. React snapshot processing, token layers, hit testing, canvas rasterization and SVG compositing also remain local. Server geometry cannot remove all of those costs.

Legacy already disables accepted-movement interpolation (`TokenPresentation.sync` receives reduced motion). Remote accepted positions snap immediately. During a local drag, `TokenShape.paintDrag` still updates a ghost, facing, visibility, distance and terrain cost, and `handleDragMove` checks walls. Removing interpolation again would not change this behavior. A click-token / click-destination action, or a low-frequency minimal drag ghost, could reduce local preview work further. Final validation must still run on the server. No such input change was added in this experiment.

## Recommended geometry protocol

1. Compute sight, near/darkvision and static-light polygons in map coordinates on the server. Cache wall/door topology and static lights by map revision; reuse results across eligible viewers. Derive the hard Legacy boundaries from the same light threshold used by current visibility rules.
2. Send each recipient a revisioned, authorized visibility frame with accepted token positions, SVG paths (or compact polygon coordinates) and exploration updates. Do not include unfiltered player geometry that could reveal concealed sources. Preserve each player's own sight and the DM's combined party preview as separate views.
3. Recompute on accepted moves, wall/door/light edits and vision/rule changes. Coalesce redundant pending work, discard stale results, and install geometry and accepted positions together to avoid showing new tokens against an old mask. Input commit frequency and Legacy display cadence are separate policies; a slow display must not delay rule validation.
4. Use a bounded worker pool for expensive geometry so it cannot block Socket.IO, dice or other campaigns on the Node main thread. Worker jobs should receive immutable geometry inputs rather than access database connections directly. Measure queue latency, server CPU, result size and client paint latency before choosing the cadence.
5. Send small token/visibility deltas between full snapshots. A full snapshot remains useful for join, reconnect and resynchronization. This reduces parsing and reconciliation as well as transfer size; moving only raycasts leaves those other costs intact.

The user's older DM computer connects to a separate server, which makes this division useful. Server load grows with map changes and distinct viewer positions; caching and worker limits matter. A server-delivered geometric mask still needs browser rendering. Rendering all pixels remotely would require a different streamed-video architecture with latency and bandwidth costs.

## Other candidates

| Work | Current status / useful change |
|---|---|
| Movement legality, wall collision, game results | Already authoritative on server; clients can use simpler optional previews |
| Movement cost, terrain intersections, range and targeting previews | Derive on request or at a low rate on server; keep a cheap local pointer response |
| Exploration unions and remembered figures | Already server-derived; send deltas and reuse caches |
| Static light influence and wall spatial indexes | Cache and share server geometry instead of rebuilding equivalent client outlines |
| Asset resizing, thumbnails, simplified model variants | Prepare/cache on server or during asset import; clients still decode and draw chosen assets |
| UI updates and incoming state | Coalesce broadcasts and send authorized deltas; avoid rebuilding an entire scene for an unrelated change |
| Pan/zoom, cursor, selection and actual 2D/3D rendering | Keep local for responsiveness; simplify their rendering on Legacy |

High-quality clients can continue rendering 3D and smooth presentation from the same authoritative state. Legacy can consume the server's basic geometry without downloading models. These are independent per-browser choices.

Reference: [Node worker threads](https://nodejs.org/api/worker_threads.html) are intended for CPU-intensive JavaScript; a pool avoids paying worker startup cost per task. Any speedup from the proposed protocol remains unmeasured until it is implemented and benchmarked.
