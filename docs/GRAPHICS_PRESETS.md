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
| Token shadow cube face | 512 | 384 | 256 |
| Maximum token shadow sources | 4 | 4 | 2 |
| Maximum map shadow texture | 2048 | 1024 | 512 |
| Dice shadow texture | 1024 | 512 | 256 |
| Maximum dice render width | 1440 | 1200 | 960 |
| Weather/decorative particle budget | 100% | 35% | 18% |
| Mist resolution fraction / ray samples | 50% / 24 | 25% / 12 | 25% / 12 |

Actual resolution also respects the device pixel ratio. All lights still
illuminate the scene in Low; only the strongest two receive token shadow maps.
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
Independent tint, facing and base selection are retained. Individual geometry
still casts each light's shadow; animated, transparent and shared-party-sight
figures stay on the existing path. Different nearby light sets are separate
batches. The developer comparison flag `?batching=off` disables batching for
measurement; it is not a saved preference. Frame diagnostics include actual
color draw calls, including instanced draws.

Per-source visibility tests are cached until a light/receiver moves or wall/door
geometry changes. Camera motion and flame flicker reuse those tests. Stationary
wall-light geometry and figure measurements are also reused. Doors block each
source independently; a blocked lamp cannot cancel a lamp inside another room.

Validate the tier package with `node scripts/token-assets/validate-quality-models.mjs`.
The client prebuild runs both original and reduced asset validation. Real-board
coverage and an A/B comparison live in `e2e/adaptive-rendering.spec.ts`.

The 2026-10-10 RTX 5090 browser comparison used 27 real figures, original High
party models, two flickering lights, dense mist and weather at 1440 x 900 / DPR 2.
Batching reduced scene draws from 450 to 366 (18.7%) with the same 6,870,310
rendered triangles. Median measured GPU time was 5.36 ms without batching and
4.52 ms with it. Both runs were near the 60 Hz frame cap; this demonstrates
reduced work, not a guaranteed FPS increase on every device. The small receipt
is `docs/adaptive-rendering-benchmark.json`. Phone performance remains unmeasured.
