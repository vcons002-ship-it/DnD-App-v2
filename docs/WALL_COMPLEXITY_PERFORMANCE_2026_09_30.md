# Wall complexity: measured replacement for the 512-edge cap

The 512-segment rejection is removed from manual authoring, saved-wall loading,
mask contour conversion, separate wall/door imports and combined map setup.
Valid walls are not silently discarded to meet a segment budget.

The DM receives a **non-blocking warning at 2,000 boundary segments**. It appears
once per detailed map in the current DM view, remains available in the Walls
menu, and appears in draft review when the selected result crosses the threshold.
No confirmation is required and Apply stays enabled. This is an advisory, not a
claim that every map below 2,000 is fast or every map above it is unusable.

## What an edge counts, and how simplification helps

An edge is a straight section of the collision/sight boundary, not a wall object,
map tile, stone in the artwork or 3D mesh triangle. A solid rectangle has four;
a rectangular perimeter with an empty rectangular room inside has eight. Curved
and freehand walls consist of multiple straight sections, including their inner
boundaries. The warning counts the effective boundary after cleanup.

The mask converter already removes pixel stair-steps with bounded curve
simplification (up to 1.5 working-image pixels), validating protected openings,
wall cores and at least 96% mask coverage. A second, effectively lossless cleanup
now removes duplicate and collinear straight-through vertices. It does not round
corners, remove real bends or erase deliberate backtracking. Its 0.00000001-pixel
tolerance only handles floating-point subdivision noise. Saved control points
remain intact; rendering, light, sight and collision share the compact geometry.

Subdividing the accepted Mossgate outline from 500 to 1,000, 2,000, 4,000 or 8,000
raw edges now produces **500 effective edges in every case**. This is deliberately
redundant test input, not a claim that any detailed 8,000-edge cave can become 500
without approximation. The irregular 8,192-edge cave benchmark retains all 8,192.

## Why removing the constant alone was insufficient

The original visibility polygon cast rays toward every wall endpoint and checked
each ray against every edge. It also compared every pair of edges for crossing
corners. At higher counts that repeated work grew roughly quadratically.

Changes preserve the saved wall outlines and exact segment intersection tests:

- Cache a bounding-volume tree for each immutable edge array. Rays visit nearby
  candidate boxes first and skip boxes beyond their closest known blocker.
- Use the same tree to find potentially crossing strokes.
- Deduplicate identical corner coordinates.
- Remove redundant straight boundary points and cache boundary segments per
  immutable wall, avoiding repeated allocation during collision checks.
- When consecutive rays land on the same straight wall edge, retain only the
  endpoints in the rendered visibility polygon. Curves, gaps, corners and
  radius-limited arcs remain represented.
- Keep wall-mask coverage and narrow-gap validation. Complexity never authorizes
  filling a doorway or cutting away a painted wall.

## Repeatable geometry benchmark

Measured locally in Node on this Windows host, with fixed room layouts and an
irregular cave rim. Old results use five changed-source calls and final results
use fifteen, after the initial cold call. Full-distance sight uses the same function as daylight visibility and
wall-clipped lights. These numbers are **CPU time for one polygon, not frame rate**.

| Boundary segments | Old rooms | New rooms | Old cave | New cave |
|---:|---:|---:|---:|---:|
| 512 | 8.94 ms | 1.88 ms | 9.70 ms | 1.81 ms |
| 1,024 | 32.05 ms | 3.71 ms | 34.62 ms | 3.38 ms |
| 2,048 | 129.18 ms | 6.71 ms | 130.30 ms | 7.01 ms |
| 4,096 | 487.69 ms | 13.51 ms | 475.44 ms | 14.19 ms |
| 8,192 | 1,929.02 ms | 28.93 ms | 1,863.26 ms | 29.56 ms |

At 4,096 edges the room-layout overlay falls from 24,672 points to 358 without
changing which sampled terrain points are visible. Detailed curved cave walls
retain more points because their outlines actually change direction.

Chrome was also tested with 15 samples per case, normally and with 4x CPU
throttling. The final throttled run costs roughly 34–37 ms at 4,096 edges and
76 ms at 8,192 edges for one full-distance visibility polygon. That simulates
a slower CPU; it is not a physical phone/GPU test. All earlier measurements are
retained in the numeric report; timings vary with runtime and host load.

Reproduce from the repository root:

```powershell
node --import tsx tools/benchmark-walls.mts
node --import tsx tools/benchmark-walls.mts --browser
node --import tsx tools/benchmark-walls.mts --browser --throttle=4
```

Browser mode uses installed Chrome. `BROWSER_PATH` can select another Chromium
executable. Each line is JSON with cold/warm sight, nearby sight, 100 movement
queries, 100 direct line-of-sight queries, output vertices and payload size.

## Running-app checks

An isolated server on port 4101 used copies of the Mossgate map, heavy darkness,
Druk's carried lantern and three placed flickering lights. Identical boundaries
were subdivided to 500, 1,000, 2,000, 4,000 and 8,000 edges. This controls map art,
lighting and visible geometry while increasing segment complexity. Actual player
mouse drags exercised the cave route and an attempted movement through solid rock.

Before the straight-point cleanup, Chrome's 95th-percentile frame interval during that walkthrough was about
12 ms, 18 ms, 28 ms, 42 ms and 88 ms respectively. At 8,000 edges, the median frame
interval was about 65 ms: that is visibly slow, even though movement and wall
blocking still worked. The initial indexed-only run had a missed drag at that
load; the corrected drag script uses the displayed token position and passed the desktop route.
Under 4x CPU throttling, even 1,000–2,000 edges were noticeably slower with all
lights active. This is why the advisory starts at 2,000 rather than 4,096.
The throttled 4,000-edge run missed an automated drag and stopped; the full app
was not then tested at 8,000 edges under throttling. This is a stress-test
limitation, not a passing claim. The separate geometry benchmark did complete
8,192-edge cases under throttling.

After straight-point cleanup, the same 500/8,000-source-edge maps both calculate
500 effective edges. A repeated desktop route measured 12/15 ms at the 95th
percentile, with the same movement destinations and solid-rock collision stop.
This improvement comes from eliminating redundant detail, not raising the cap.
The 4x-throttled repeat measured 55 ms at the 95th percentile for the original
500-point map. On the 8,000-source-point copy the first run's second drag landed
19 map pixels away from the scripted destination. A follow-up that refreshed the
projected drop coordinate immediately before release completed all five moves,
including the blocked-rock attempt; its 95th percentile was 64 ms. Both runs are
retained. Several lights and the unchanged larger source payload still cost time;
effective edge count alone is not a guarantee of smooth performance on a phone.

Raw measurements and screenshots are in the local `artifacts/wall-performance/`
folder. They include the original, indexed-only and final results, rather than
just the fastest cases. Browser frame intervals include actual rendering and
are not directly comparable to the one-polygon timings above.
The portable numeric summary is [saved alongside this report](benchmarks/wall-performance-20260930.json).

## Correctness and remaining bounds

- Indexed hits match an independent exhaustive ray test for randomized crossing
  segments, collinear rays, exact corner contacts and finite/infinite sight range.
- Narrow openings, closed/open doors, polygon holes, movement blocking, erased
  wall sections, rotated walls and backup restoration remain covered.
- Oversampled straight/diagonal paths and closed rings with holes produce the
  same sight and movement results as their simple counterparts. Genuine bends
  and backtracking remain, and source points are not mutated.
- A single intricate comb-shaped mask converts beyond 512 edges while retaining
  its small gaps. Existing mask fixtures retain their coverage checks.
- Saved maps with 8,192 edges retain all walls; combined wall/door/light setup
  applies above 4,096 edges with linked door objects.
- A real HTTP wall-draft import accepted a 397,577-byte request and preserved all
  8,192 edges. The three DM geometry Apply routes now allow 8 MB JSON requests;
  otherwise Express's default 100 KB limit would replace the removed edge cap
  with an accidental payload-size failure.
- The final DM UI check used actual corners (not removable subdivisions): no
  warning at 1,000 edges, a warning at 2,000/8,000, and a manual rectangle added
  successfully to the 8,000-edge map.
- Existing invalid-coordinate checks, per-draft suggestion counts and normal
  transport-size limits remain. There is no replacement hard segment cutoff.
- Highly intersecting strokes, many active light sources and enormous maps can
  still be expensive. The warning permits the DM to continue and simplify detail
  if needed; it does not change wall geometry to get below a threshold.

Final automated verification: typecheck, all 1,085 tests across 121 files, and
the production build passed. Existing bundle-size advisories remain.

The live campaign, port-4000 service and installed deployment were not changed.
