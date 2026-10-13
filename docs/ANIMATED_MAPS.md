# Animated battle maps

In the DM's **Maps** panel, choose an image, MP4 or WebM and click **Upload image
or animated map**. Videos loop silently. **Tiles → Add map tile** accepts the
same formats, including mixtures of static and animated tiles.

Each browser has a **Map animation: On / Off** button beside the map view
controls. Off uses the saved poster without changing the campaign, token
positions, scale, walls, fog, lighting or combat. The choice persists in that
browser. A reduced-motion preference starts animation off unless the user has
explicitly chosen otherwise. Hidden browser tabs pause video playback.

## Artwork and visibility

- The server saves the original video and extracts a still JPEG poster using
  the bundled FFmpeg executable. Static maps and old campaigns are unchanged.
- The poster remains `imagePath`; the optional `videoPath` is saved with the
  map or tile and included in normal snapshots and map imports.
- The original video is not re-encoded. H.264 MP4 is a useful compatibility
  choice; a video that cannot play falls back to its poster with a notice.
- A shared browser resource owns one muted, looping decoder per video URL.
  Konva paints the moving artwork; darkvision uses a video texture from that
  same decoder. Frame callbacks request paint through the battlefield scheduler.
- Existing server sight, wall/door movement, targeting, painted fog, personal
  token visibility and shared-party sight rules are unchanged. A new video frame
  never recalculates exploration or grants sight.
- Remembered terrain uses the still poster. It retains the existing grayscale,
  darkness grading and grid. "Keep revealed" also uses stable poster artwork
  outside current sight. It does not leak live animation from an unseen room.
- Lit and directly visible animated terrain uses the existing lighting and
  darkvision treatment. The map, video, grid and masks use the same dimensions,
  tilt, rotation and tile coordinates.
- Wall/door/window/light analysis and arch art continue reading the poster.
  Uploaded map videos are artwork; they do not automatically create dynamic
  mechanical lights or creatures from objects baked into the video.

## Storage and performance

The host keeps videos and posters under its existing `server/uploads` (or the
configured sandbox uploads directory). No third-party video service is needed.
The asset worker caches complete same-origin videos locally and serves partial
range requests from that cache, including seeks. It never stores a partial
response as a complete video. Quota failures fall back to network playback.
Browsers can evict their local cache; disk persistence remains best effort.

Image uploads retain the 25 MB limit; videos allow up to 250 MB. Video posters
preserve aspect ratio and are capped at 1920 pixels per dimension without
upscaling. Playback is fit to the poster's map coordinates. Portable campaign
exports include video references/assets under the existing combined 300 MB
asset capacity; exports report files omitted by that capacity.

1080p, 30 FPS loops are a sensible starting point for bandwidth and decode cost.
Compare **Map animation: Off** on the same board before lowering figure quality.
The server serves files; each viewer's device decodes and renders the video.

## Verification

- `server/src/mapMedia.test.ts`: actual video decoding, invalid-content rejection,
  old map behavior, saved map/tile fields, snapshots and import schema.
- `client/src/lib/assetCache.test.ts`: complete-file caching, byte ranges, suffix
  seeks and unsatisfiable ranges without another download.
- `e2e/animated-maps.spec.ts`: actual upload/playback, darkness, shared decoder,
  exploration memory, local still fallback, offline seeking, tiles and 45° view.
- `e2e/animated-map-gameplay.spec.ts`: opt-in real downloaded maps, paired static
  and animated measurements and direct NVIDIA NVENC AV1 gameplay capture.
  Still screenshots are taken only after the live recording stops.

The opt-in demonstration uses the separate media folder specified by
`DND_ANIMATED_MAP_DEMO` and the disposable Playwright campaign. It does not
modify the installed campaign or restart the live server.

## Desktop comparison (2026-10-13)

Chrome selected the RTX 5090 (ANGLE / Direct3D 11). Balanced, 1600 x 1000,
DPR 1; six-second samples, same board toggled between poster and video, with
recording stopped. Temple: three PCs, three goblins and a chamber barrier/door.
Other maps: three PCs. Each source is a 1080p, 30 FPS preview loop.

| Scene | Static idle render FPS | Animated idle render FPS | Static camera frame p95 | Animated camera frame p95 |
| --- | ---: | ---: | ---: | ---: |
| Ritual Temple, daylight | 59.3 | 60.7 | 19.6 ms | 20.0 ms |
| Ritual Temple, regular darkness | 60.1 | 67.3 | 20.4 ms | 23.4 ms |
| Ritual Temple, heavy darkness | 60.1 | 66.3 | 20.0 ms | 20.2 ms |
| Haunted Forest, daylight | 60.3 | 60.5 | 7.9 ms | 7.9 ms |
| Volcano Temple, daylight | 55.1 | 60.3 | 7.2 ms | 4.7 ms |

Video invalidations can increase the renderer's redraw count. Higher redraw
counts are not a rendering-speed improvement. Camera frame times are browser
RAF intervals, not GPU-only shader time. Short samples have warm-up and scheduling
variation; they establish no significant sustained slowdown on this desktop,
with a worst measured camera p95 regression of 3 ms in regular darkness.
They do not establish phone or integrated-GPU performance.

Final validation: typecheck/build, 2,161 unit tests and six browser/gameplay
cases passed. The two-minute recording is live Windows Graphics Capture,
NVIDIA NVENC AV1 (1600 x 1084), with an H.264 playback copy. All 6,626 master
frames were checked for the previous grey-flash defect; zero were found.
