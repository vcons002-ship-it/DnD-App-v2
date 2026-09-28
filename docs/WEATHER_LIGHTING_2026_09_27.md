# Weather and local lighting

Development extension of the saved map environment. Three-dimensional scenery
is deferred. The original map image and miniature files are preserved.

The subsequent [presets and rainstorm revision](ENVIRONMENT_PRESETS_STORM_2026_09_28.md)
adds wet-ground highlights, cloud-lightning illumination and nine complete
atmosphere presets. The limitations below describe this original first batch.

## Controls

DM: Maps → Environment → Enable environment.

- Lighting: Day, Dusk, Night, Dungeon, plus ambient brightness.
- Weather: None, Rain, Snow, strength and wind direction/speed. Wind also drives
  the existing mist. Rain includes short ground splashes; snow drifts slowly.
- Place light on map: click terrain for a light at that position. Each light has
  warm/cool/green color, radius, height, strength and optional gentle flicker.
  Move/remove controls are inside each light's disclosure. Escape cancels only
  placement. The later torch/lantern extension removes the eight-light placement limit; see `TORCHES_LANTERNS_2026_09_27.md`.
- Players and DM retain browser-local Auto/High/Low/Off. Low reduces particle
  count and mist detail. Off restores normal map/miniature rendering.

All map settings use the existing server-validated environment JSON, socket
authorization, backups and map import. Old saves gain Day/None/no lights while
retaining their earlier mist/shadow choices. No new database migration.

## Rendering

Weather uses one bounded instanced GPU draw (maximum 2,200 rain particles or
1,100 snowflakes; Low uses 35%). It runs in map coordinates, scales with the map's
feet calibration, and survives panning, rotation and negative-coordinate tiles.
No per-particle CPU simulation or network streaming. Reduced motion freezes it.

Lighting combines a transparent ground grade with real Three.js point lights
at the saved position/height. Distance attenuation lights the actual figure
surfaces. Brightness and reach share a restrained multi-frequency flame signal;
the ground pool uses the source height and spherical reach as well. The grade
uses the figure depth mask rather than nearly coplanar depth tests, avoiding
banding while preserving foreground figures.

Generated color-only model atlases omitted glTF metallicFactor, which defaults
to fully metallic. The renderer now gives those unspecified atlases a diffuse
response. Explicit metal factors and metallic/roughness textures are preserved;
no GLB is rewritten. This makes skin/cloth react visibly to a torch while
authored metallic weapons and trim keep their material.

The environment renderer remains active on an empty board, including after the
last miniature is hidden or switched to 2D. Previously that lifecycle depended
only on having a miniature, which could silently remove all atmosphere.

## Visibility and limits

Player map fog clips ground lighting, weather positions and each particle's
projected ground footprint. The server removes hidden light sources entirely
from both the player's active map and map list; DM light data remains intact.
Token-only fog still governs creatures, not weather or light locations.
Lingering footprint marks now consult the same token/cell visibility check, so
re-covering terrain or hiding the source cannot leave bright tracks over fog.

Lighting is visual. Painted walls do not block light, and point lights do not
cast additional shadows in this first batch. Existing directional/contact token
shadows remain separate. No weather accumulation, thunder audio, lightning
flashes, automatic day cycle, or changes to combat/vision rules. Effects render
on each viewer's GPU; physical-phone/crowded-board timing remains unmeasured.

## Review

Preview and video:
https://dnd.nic024i.app/uploads/previews/environment-weather-lighting-20260927/index.html

Reproduce the preview with:

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY --weather
```

The real-app environment browser regression exercises DM controls and light
placement, synchronized player weather, Escape cancellation, save/reload,
phone-width Low, independent Off, negative tiles, movement, ruler tools,
overhead/45-degree fog, and the fully covered map pixel comparison. Domain tests
cover numeric/enum bounds, light limits and visibility, role/campaign ownership,
backups and imports. Test databases are temporary. Publication copies only the
static review files; it does not update the running app or live campaign.

Verified: typecheck, production build, 911 server tests, the expanded real-app
environment case (including zero changed pixels under fully covered fog), and
the existing flat-token occlusion and rotated-drag browser regressions pass.
The published short video also plays in a phone-width browser without page
overflow. This is viewport/codec validation, not a physical-phone GPU benchmark.
