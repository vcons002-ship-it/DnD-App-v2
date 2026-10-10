# Graphics presets

Players choose **Interface settings > Graphics quality**. The DM chooses
**Campaign > Settings > Interface > Graphics quality**, also available under
**Maps > Environment > Graphics quality**. Settings are saved in this browser,
using the existing `dnd-environment-quality` preference; they do not change the
campaign or another viewer's settings. Balanced is the default when no valid
saved choice exists. Existing choices, including Auto, remain unchanged.

| Budget | High | Balanced | Low |
|---|---:|---:|---:|
| Player models | Original | Conservative reduction | Lighter reduction |
| Combined player triangles | 2,924,413 | 980,695 | 553,413 |
| Maximum render pixel ratio | 2 | 1.5 | 1 |
| Token shadow method | Point-light cube | Floor silhouette | Floor silhouette |
| Token shadow texture | 512 per cube face | 768 floor mask | 512 floor mask |
| Maximum token shadow sources | 4 | 4 | 2 |
| Maximum map shadow texture | 2048 | 1024 | 512 |
| Dice shadow texture | 1024 | 512 | 256 |
| Maximum dice render width | 1440 | 1200 | 960 |
| Weather/decorative particle budget | 100% | 35% | 18% |
| Mist resolution fraction / ray samples | 50% / 24 | 25% / 12 | 25% / 12 |

Actual resolution also respects the device pixel ratio. All lights still
illuminate the scene in Low; only the strongest two receive token shadow maps.
Balanced and Low project full figure silhouettes onto the flat map, following
each selected light's position and height. Other lights still fill those shadows.
These floor shadows do not cast onto other figures; High retains that detail
with full point-light cube maps.
Effects off uses Low resolution, removes mist/weather/decorative particles and
token/map shadows, and keeps lighting, darkness and fog. Character dice powers
remain visible at every preset. Dice capture their graphics budget when a roll
scene is created, so changing a preference does not resize an active roll.

Auto starts at Balanced below 900 CSS pixels and High otherwise. During continuous
rendering it samples actual frame intervals in three-second windows. Two slow
windows (75th percentile above 25 ms) lower one tier; changes have a 30-second
cooldown. Recovery requires a stable minute below 18 ms and a two-minute delay
after a downgrade. Loading, the following three-second warm-up, hidden tabs and
idle frame caps are excluded. Narrow screens stay at most Balanced in Auto.
Explicit presets always override Auto. The resolved setting appears next to the
quality control. This is a browser rendering preference, never a visibility rule.

Auto selects model quality along with its resolved lighting/effect tier: originals
at High, conservative reduced copies at Balanced, and lighter copies at Low.
Balanced defaults to about 58.67 MB combined versus 83.64 MB for originals,
with 66.5% fewer triangles and identical texture images. Low is about 51.10 MB
combined with 81.1% fewer triangles.

Original player assets stay intact. Reduced variants retain exact embedded texture
bytes and base measurements, and Varis' reduced variants include the approved
weapon refinement. Only the chosen variant is requested; if unavailable the
loader tries the original. Changing quality keeps the current figure visible
until its replacement is prepared, so it does not flash back to 2D.

Eligible opaque, static repeated creatures share instanced color/depth draws.
Independent tint, facing and base selection are retained. Shadow-only geometry
casts each light's shadow; animated, transparent and shared-party-sight
figures stay on the existing path. Different nearby light sets are separate
batches. The developer comparison flag `?batching=off` disables batching for
measurement; it is not a saved preference. Frame diagnostics include actual
color draw calls, including instanced draws.

Per-source visibility tests are cached until a light/receiver moves or wall/door
geometry changes. Camera motion and flame flicker reuse those tests. Stationary
wall-light geometry and figure measurements are also reused. Doors block each
source independently; a blocked lamp cannot cancel a lamp inside another room.

Shadow geometry is simplified in a background Worker once per loaded geometry.
Visible meshes, texture bytes, base measurements and saved assets are untouched.
Small parts and partial draw ranges retain their original topology. Simplification
uses a 0.75% extent error limit and preserves borders; deforming meshes retain
vertex identity to preserve skinning and morph data. If the Worker or simplifier
fails, original geometry remains available for shadows.

Moving lights/figures refresh shadows at up to 30 Hz without capping scene FPS.
Idle animated poses refresh at 10 Hz. Final movement positions remain scheduled
until rendered. Camera motion and flicker reuse masks; wall/door geometry,
caster visibility and model replacement invalidate immediately. New snapshots
with identical walls do not invalidate the cache. Fixed floor lights maintain
separate stationary masks, so moving a figure does not repeatedly redraw every
stationary monster. A carried lantern must update its entire mask as it moves.
These clocks affect rendering only, never movement, targeting or fog rules.

Ordinary movement refreshes at most two shadow sources per rendered frame,
oldest first. Deferred sources keep their last valid mask and matching projection;
door, visibility and model changes bypass that budget. Wall-clipped light geometry
uses separate reusable buffers per source, so moving a lantern uploads only its
polygon and torch flicker changes uniforms without uploading geometry. Equivalent
wall snapshots retain light-to-token sight caches. Camera gestures update the map,
3D camera and player masks in the same paint and preserve live angles when an
unrelated server snapshot arrives before the gesture commits.

GPU-rendered names now suppress their original Konva scene paint with visibility,
rather than zero opacity. Konva otherwise still paints transparent stroked text
through a full-layer buffer: at the tested perspective viewport that buffer
contains roughly six million pixels. The source text nodes remain available for
name textures, live transforms and the 2D fallback; health and initiative HUDs
retain their existing input and layering. Name textures normalize this paint-only
visibility out of their cache keys and render visible clones.

Repeated creature transforms are compared in their actual GPU Float32 precision,
so stationary fractional map coordinates do not repeatedly upload identical
matrices or recompute batch bounds. The body/depth mask retains its exact pixels
until visible geometry, transforms, skin/morph poses, personal/shared layers,
mirror textures, viewport or camera changes. Upload counters alone do not force
redraws when the instance data is unchanged. This screen mask is refreshed in
the same movement/camera frame; it has no throttling interval or resolution loss.

A detailed follow-up profile (2026-10-10, baseline `9dc0e20`) compared the same
27-figure board, 20 walls, two flickering torches and Druk's moving lantern,
heavy darkness and player vision, Balanced, 1440 x 900 / DPR 1 on AMD integrated
graphics. Mist and weather were off. Model loading and shadow preparation
completed before measurements; FPS samples had neither tracing nor recording.

| Scene | Before FPS | After FPS | Before / after p95 frame interval |
| --- | ---: | ---: | ---: |
| Stationary with flickering lights | 33.7 | 38.3 | 45.1 / 42.4 ms |
| Movement every 450 ms | 18.7 | 25.7 | 65.4 / 48.5 ms |

Stationary median WebGL GPU time fell from 17.0 to 13.0 ms. During movement it
remained around 19 ms; much of the improvement came from eliminating duplicate
Canvas2D paint. In separate ten-second layer-instrumentation samples, the token
HUD's scene drawing time fell from 636 to 20 ms. Its frame count increased, so
this is reduced work rather than fewer movement frames. Separate seven-second
CPU/graphics traces found the renderer main thread idle in approximately 68%
of movement samples and substantial GPU-process command/raster work. That does
not measure whole-machine CPU utilization or exclusive GPU hardware busy time.
The WebGL timer excludes Canvas2D, SVG and compositor work, so its duration must
not be treated as the complete frame interval. Short sequential runs vary.

The small receipt is `docs/movement-profile-benchmark.json`; full local traces
and profiles are retained at the paths it lists. Browser regression coverage in
`e2e/miniature-paint-budget.spec.ts` checks name texture preservation, fallback,
fractional batch transforms and immediate body-mask invalidation. Existing
shadow, quality, camera/vision and token-input tests also pass.
An [AV1 verification video with a mobile copy](https://dnd.nic024i.app/uploads/previews/frame-profile-20261010/index.html)
shows stationary lights, continuous lantern movement and free rotation with an
on-screen counter. Recording overhead is excluded from the table above.

A follow-up movement comparison against the corrected shadow renderer
(`a1dc882`, 2026-10-10) used 27 figures, 20 walls, two flickering torches and a
moving lantern in heavy darkness with player vision, Balanced quality,
1440 x 900 / DPR 1, AMD integrated graphics, and no mist or weather. In matching
20-second samples, rendered FPS increased from 16.5 to 18.6; median GPU time
decreased from 22.8 to 18.5 ms. The 95th-percentile movement frame interval
decreased from 71.1 to 65.7 ms. This is a modest improvement in a demanding scene,
not a guarantee of smooth frame rates on all boards. A rapid-rotation run with
concurrent token movement found no map/camera/mask angular mismatch in 314 sampled
frames. Native Windows capture was encoded in AV1 by the RTX 5090 while the app
rendered on AMD. See the [movement comparison video](https://dnd.nic024i.app/uploads/previews/movement-performance-20261010/index.html).

The integrated-GPU shadow comparison (2026-10-10, Ryzen 7 7800X3D Radeon
graphics, 1440 x 900 / DPR 1) used matching 20-second before/after samples:

| Scene | Before FPS | After FPS | Median GPU before / after |
| --- | ---: | ---: | ---: |
| Player, Balanced | 20.7 | 23.4 | 27.9 / 23.1 ms |
| Player, High | 12.1 | 14.8 | 54.6 / 46.6 ms |
| DM reference, Balanced | 40.9 | 46.6 | 21.3 / 18.5 ms |

The player scene has 27 figures, 20 walls, two fixed torches and a moving
lantern, wall-based player vision, heavy darkness, tall mist, rain and embers.
The DM reference keeps the figures and effects but removes walls, the carried
lantern and the player vision mask. It matches the lighter conditions of the
earlier roughly 35 FPS test, rather than its complete camera/input replay.
These scene differences explain why player results are lower than the earlier
DM measurement. Do not compare FPS across those setups as an optimization delta.
Low reached 25.5 FPS in the heavier player scene; there is no matching Low
baseline in this run. The 5090 encoded native Windows capture only; AMD rendered
the app. Short sequential samples have recording/device-load variance.
The receipt is `docs/shadow-rendering-benchmark.json`; the comparison video is
at https://dnd.nic024i.app/uploads/previews/shadow-performance-20261010/index.html.

Shadow contact, all presets, stationary-mask reuse, movement throttling and
immediate door invalidation have browser coverage in
`e2e/local-shadow-contact.spec.ts`. Background geometry reduction and no-flash
quality changes are exercised with 27 real figures in
`e2e/adaptive-rendering.spec.ts`.

Validate the tier package with `node scripts/token-assets/validate-quality-models.mjs`.
The client prebuild runs both original and reduced asset validation. Real-board
coverage and an A/B comparison live in `e2e/adaptive-rendering.spec.ts`.

The earlier renderer had a batching/shadow-layer conflict: Three's shadow pass
checks the supplied view camera's layers, not `light.shadow.camera.layers`.
Source meshes suppressed on layer 7 were omitted from local cube shadows until
a snapshot briefly restored their layers. Shadow-only proxies use their own
scene and layer 0, so color batching cannot remove their shadows. Browser pixel
coverage now checks three batched creatures through repeated movement, stops,
and source-layer restoration at all three shadow quality levels.
The original before/after benchmark's early "Before" chapters contain this bug;
their FPS baseline therefore also omitted many creature shadows.

The 2026-10-10 RTX 5090 browser comparison used 27 real figures, original High
party models, two flickering lights, dense mist and weather at 1440 x 900 / DPR 2.
Batching reduced scene draws from 450 to 366 (18.7%) with the same 6,870,310
rendered triangles. Median measured GPU time was 5.36 ms without batching and
4.52 ms with it. Both runs were near the 60 Hz frame cap; this demonstrates
reduced work, not a guaranteed FPS increase on every device. The small receipt
is `docs/adaptive-rendering-benchmark.json`. Phone performance remains unmeasured.
