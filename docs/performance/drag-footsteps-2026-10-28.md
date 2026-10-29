# Player drag recordings and Legacy ground tracks — 2026-10-28

The earlier comparison captured only the DM observer, so it omitted the player's mouse-down, held destination preview and release. Footsteps were also explicitly disabled by the Legacy rendering gate in MapStage.

## Legacy footsteps

Legacy now mounts the existing authorized movement-trail component on its own noninteractive Konva layer below tokens and the vision mask. It reuses a single rasterized boot stamp, limits visible marks to 96, retains two active trails and expires older trails. Its clock runs every 100 ms while trails are alive. Held marks have constant attributes and require no layer redraw; changing fade opacity redraws only the footprint layer. It does not load Three.js models, calculate wall visibility or repaint the map for each footprint tick.

Footfalls use the shared token presentation position during the 400 ms Legacy animation so they do not run ahead of the moving figure. Snap presentation deposits its marks immediately. The pre-existing no-tracks, teleport and authorized-token/vision behavior remains in place. These are temporary local cosmetic marks, not persistent game-state tracks.

## Recordings

Public mobile viewer: https://dnd.nic024i.app/previews/drag-footsteps-20261028-03ac9b3548d7/index.html

Each mode now has a player-input recording and a DM Player-view recording captured during the same disposable test session. The player actually presses and holds the token, drags the destination preview with pointer input, pauses briefly and releases it. A capture-only cursor overlay is red while the button is held and yellow when released. The UI, destination preview, accepted movement, masks and footsteps are real app output. Each recording preserves wall-clock timing; this is not slow motion. The viewpoint recordings start at different times, documented by their CDP frame timestamps.

Both player modes now match the tested viewing mode: Legacy overhead or real 3D Low at 45 degrees. 3D pointer coordinates use the board's perspective projection rather than feeding flat coordinates to the tilted input surface. Each player makes eight separate drags past two guards and returns. The guards enter and leave authorized sight. Normal lantern color, current gray darkvision, dim remembered ground and unseen ground use the real courtyard map from the earlier comparison.

Both browsers feed Chrome CDP JPEG frames directly into separate NVIDIA AV1 encoders at 1600 × 1000, 60 fps. The public players use H.264 copies with the same frame counts and timing, and retain downloads for all four original AV1 files. Each mode has scene buttons for the first held drag and the footsteps after release. Two concurrent browsers, screencasts and encoders add overhead; these recordings are interaction/correctness evidence, not a rerun of the throttled-CPU benchmark or a claim that all 3D hitches are gone.

No CPU throttling was enabled for these recordings. The Legacy post-release pause is real: state delivery awaits the complete thirteen-pose animation plan and its graded terrain/mask atlases before emitting the frame, and the client awaits image downloads/decoding before accepting that revision. The server's Legacy delivery coalescer also retains a 500 ms minimum update interval, which can add a wait when an update follows a recent emission. The recording does not attribute generation, queuing, transfer and decode individually. Subtracting each measured pointer-held interval from the request-to-first-observer-motion interval yields approximately 1.02–1.38 seconds across eight moves; this is an approximate observer post-release delay and includes the short setup interval before mouse-down. The intentional 1100 ms pause between completed moves is separate from that delay. Visibility geometry and Sharp image preparation run on CPU workers; AV1 NVENC recording does not accelerate those server jobs.

| Recording | Duration | Frames at 60 fps |
| --- | ---: | ---: |
| Legacy player drag | 53.40 s | 3204 |
| Legacy DM observer | 55.52 s | 3331 |
| 3D player drag | 44.52 s | 2671 |
| 3D DM observer | 46.57 s | 2794 |

Artifacts, event logs and codec probes: `artifacts/drag-footsteps-20261028/`. The Legacy player recording measured eight pointer-down/up pairs and up to 83 simultaneous footprint stamps. Legacy observer token/mask alignment remained within floating-point noise across 739 sampled animation frames. Decoded AV1 frames were visually inspected for both held drags and the Legacy track trail.

## Validation and delivery

Subsequent latency work is measured in [Legacy movement latency](legacy-motion-latency-2026-10-28.md). That revision overlaps endpoint and animation preparation, uses compact illumination atlases, and bypasses the idle 500 ms delivery interval for accepted position changes. The recordings above preserve the earlier behavior and timing.

- Production build and TypeScript checks passed. Focused footstep layout and presentation unit tests passed: 11 tests.
- Player and DM Legacy movement browser tests passed, including tracks appearing, noninteractive stamps, the 96-mark bound, no redraw while marks are held, and only the footprint layer redrawing when fading begins. Both still animate through authorized creature visibility changes and can return to snap mode.
- Standard 2D/3D retained-rendering browser tests passed after the change.
- Both recording scenarios passed: actual mouse input, completed accepted movement, Legacy footsteps, observer guard visibility, Legacy raster reset/alignment, AV1 codec and no page errors.
- Public H.264 files and posters matched local SHA-256 hashes. Original AV1 links returned the expected lengths, and all four playback files returned HTTP 206 for byte ranges.
- All four public clips played decoded frames without media errors in a 412-pixel mobile-emulated Chromium browser. The click/drag scene button sought and played correctly; the page had no horizontal overflow. Physical mobile Safari was not available for validation.
- Static preview assets are under a dedicated folder in `client/public/previews/` and `client/dist/previews/`. The previous mobile viewer links to the new comparison. No DnDServer restart, live campaign or live upload edits were needed. Runtime recording tests use temporary databases and uploads.
