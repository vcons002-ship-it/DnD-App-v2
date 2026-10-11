# Player visibility and temporary dice background budget

Visibility decisions and wall intersection geometry run on the CPU. Drawing the
scene, shading it, rasterizing masks and compositing darkness are separate costs.
The earlier DM/player video used different vision modes and is not a controlled
measurement of the cost of line-of-sight alone.

## Implementation

- Project circular light falloff bands as exact conic ellipses, retaining the
  existing clipped 96-point path when a circle crosses the camera plane. The
  same 48 attenuation bands, source heights, reach and wall clips are preserved.
- Reuse stationary personal/party sight objects. Invalidate on snapshots,
  movement and map changes, including the final movement frame.
- Avoid replacing unchanged SVG sight, wall-clip and exploration markup.
  Hide the unused dim-light filter layer during daylight and heavy darkness.
- While a full dice tray or private approval is active, render the battlefield
  at 12 FPS and 65% of its usual pixel ratio, capped at DPR 1. The dice renderer,
  UI size, textures, selected model quality, saved settings and server physics
  stay unchanged. The background remains live, with reduced raster detail.
- Restore the original map pixel ratio before damage/healing effects, on skip,
  and when the tray closes. Compact results do not keep the map reduced.
- Benchmark mode now reports scene GPU and final visibility GPU time separately.
  Their displayed sum adds rolling medians; it is not a paired total per frame.

## Integrated GPU test

Disposable campaign A4CF on isolated port 4356. AMD Radeon integrated graphics
on the Ryzen 7 7800X3D, verified by ANGLE D3D11 adapter 0x164E. Viewport 1440x900,
DPR 1, High preset and 45-degree view. There are 30 figures on the board (21
visible), 23 wall rectangles, heavy darkness, strong high-quality mist, rain,
embers, six placed lights and three carried lanterns. Assets are warm.

| Measurement | Before | Final version |
| --- | ---: | ---: |
| Stationary map, 12 seconds | 29.3 FPS | 34.4 FPS |
| Stationary map after the roll, 12 seconds | 25.3 FPS | 33.3 FPS |
| Live dice median frame interval | 42.5 ms | 8.0 ms |
| Live dice p95 frame interval | 72.7 ms | 29.5 ms |

These are individual runs, not a broad hardware survey. Before was unrecorded;
final was recorded through Windows Graphics Capture and RTX 5090 NVENC AV1,
up to 60 FPS with variable frame rate. The AMD GPU rendered the app. Median dice
interval is not sustained FPS. There are still slower frames in the final run.
The first intermediate implementation measured 28 map FPS and an 11.1 ms median
dice interval, showing why the full map gain should not be generalized.

At full resolution, median display-mask construction was 0.7 ms CPU, the final
WebGL visibility pass 1.32 ms GPU, and preceding scene rendering 18.80 ms GPU.
The mask CPU timer does not measure server-authoritative sight decisions. The
WebGL timers exclude browser SVG rasterization and CSS/backdrop composition, so
these numbers cannot account for the entire DM/player gap. Roll-time GPU counters
include earlier full-resolution samples in their 120-frame rolling medians.

## Verification

Typecheck, production build and all 1,995 tests in 195 server suites passed.
Browser checks cover light-band pixel parity at multiple rotations/tilts, body
visibility and remembered-map composition, warm/cold dice assets, all three skip
methods, and quality restoration before healing and grouped Hail of Thorns HP
animations. An older Hail test assumed its total faded at 3 seconds, although
the configured hold is 3.2 seconds; it now checks against the actual hold/fade
constants. This changes the test expectation, not the HP animation.

Raw run data and AV1 source are outside the repository in
`D:/dnd-approved-release/player-vision-roll-budget-20261011`. A compact report is
stored alongside this note. The video is published at
https://dnd.nic024i.app/uploads/previews/roll-background-performance-20261011/index.html.

No live campaign, combat rules, save data or visibility permissions were changed.
