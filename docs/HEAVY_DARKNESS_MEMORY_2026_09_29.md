# Heavy-darkness memory and creature readability

Remembered terrain previously used a fixed 48% brightness filter, and shared
miniatures used daytime illumination regardless of map darkness. Both could
show more than the party member actually looking into heavy darkness.

- Heavy-darkness memory now uses the actual unlit ground grade and the same
  edge/bright-feature recovery shader as live darkvision, including the grid.
  It reuses the renderer, geometry and textures. The terrain-only image is
  cached until the camera, artwork, grid or darkness grade changes; moving
  figures, light flicker and weather do not force it to redraw.
- Shared miniatures retain the map's darkness illumination and darkvision
  detail, with no torch contribution in the shared pass. Their grayscale layer
  remains slightly translucent. Environment changes invalidate the cached pass.
- Unlit miniature midtones and contours receive a small brightness increase,
  which fades out at the same physical light coverage used by torch lighting.
- Shared 2D token bodies also darken in heavy darkness; their labels remain
  readable. The dim fallback for terrain does not expose a bright map while
  its darkvision textures prepare or WebGL is unavailable.
- Map switches and renderer cleanup clear cached terrain immediately. Existing
  exploration masks, explicit fog, reveal timing and targeting rules still apply.

Verified in two simultaneous player sessions with a sentry 45 feet from Varis,
outside lantern light. Druk observes only shared sight. At the same terrain
patch, mean grayscale levels were 8.889 (personal) and 8.901 (remembered), on a
0–255 scale. The creature's raw body luminance was 7.733 (personal) and 7.742
(shared, before its existing 78% opacity). Both terrain patches were grayscale.

Browser cases for exploration on retreat, party awareness/input restrictions,
and the recorded heavy-darkness corner reveal pass. Typecheck, production build
and all 996 tests pass. No live campaign or service changes were made.

[Before/after images and a short mobile replay](https://dnd.nic024i.app/uploads/previews/heavy-memory-20260929/index.html)
