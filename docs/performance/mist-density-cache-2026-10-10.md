# Reusable High mist density field prototype

The expensive procedural cloud shape is evaluated into two map-space textures
at 8 Hz. Each texel packs four adjacent height samples into RGBA; 32 height
slices retain the volume. The renderer interpolates both heights and time.
The same density values serve volume illumination probes and ground shading.

Body displacement, clearing and turbulent wakes still use the live contact
field. Vision clipping, patch envelopes, lighting and torch flicker remain
live. High retains 24 ray samples in its half-resolution mist buffer. Cache
updates do not depend on camera rotation; origin, map size/scale and wind
changes invalidate them. This board adds about 2.4 MiB for the two cloud fields.

Low mist uses the procedural shader. Fields above two million density samples,
or outside the device's texture-size limit, also use that path rather than
coarsening detail. Target state, auto-clear and shadow-update state are restored
after cache generation, and all targets are disposed with the environment.

## Integrated GPU comparison

Ryzen 7 7800X3D integrated AMD graphics, ANGLE D3D11, 1440 × 900 at DPR 1,
27 original models, 20 walls, 45° view. Mist is 6 ft high at 35% opacity.
Heavy darkness has two flickering torches, High cube shadows and Druk's moving
lantern. Daylight disables creature shadows. Both runs use the same disposable
campaign and current server. The original client is served from its saved build
through a local proxy. Samples are 15 seconds after warmup, without recording.

| Scenario | Original FPS | Cached FPS | Median GPU time, original → cached |
| --- | ---: | ---: | ---: |
| Daylight, stationary | 24.1 | 28.6 | 31.9 → 26.5 ms |
| Daylight, movement | 19.8 | 23.6 | 39.3 → 32.7 ms |
| Heavy darkness, stationary | 17.8 | 21.7 | 42.5 → 33.8 ms |
| Heavy darkness, movement | 14.4 | 17.5 | 50.0 → 40.7 ms |

This is approximately 18–22% more FPS in these samples. Movement's 95th
percentile frame interval improves from 61.3 to 53.6 ms in daylight and
78.9 to 71.6 ms in heavy darkness. These short samples are not a guarantee
for other devices, map sizes or views.

Two earlier layouts were discarded: a full RGBA atlas barely improved FPS,
and transferring atlas slices to a 3D texture was substantially slower here.
The final packed atlas needs no slice transfers or CPU pixel readback.

## Appearance and validation

GPU density comparisons cover five heights at normal and strong wind, using
the same seed and original procedural formula. Mean absolute differences are
0.05–1.10% of the full density range. The 99th percentile is at most 7.45%; a
few sharp density features differ more (up to 25.5%). This is an approximation,
not a lossless or pixel-identical replacement. Density error is not equivalent
to final image error. Thin wisps deserve visual review.

- Typecheck and production build pass.
- Full unit suite: 1,982 passed; 20 affected checks rerun after the refresh-rate change.
- Six browser checks pass: cache density accuracy, saved map environment and
  fog clipping, wall-specific player sight, context loss, and both fog compositor checks.
- Four final in-app samples and the field comparison report no shader/page errors.

The preview uses direct Windows Graphics Capture and RTX 5090 NVENC AV1 while
the app renders on integrated graphics. Its mobile viewing copy is H.264.
Recording samples are separate from the reported performance measurements.
The live app and campaign save are unchanged.

Raw paired data: [mist-density-cache-2026-10-10.json](mist-density-cache-2026-10-10.json).
Preview: https://dnd.nic024i.app/uploads/previews/mist-cache-20261010/index.html
