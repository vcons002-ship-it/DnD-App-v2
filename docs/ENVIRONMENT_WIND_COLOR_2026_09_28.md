# Wind and scene color controls

DM: **Maps > Environment**.

- Wind strength now ranges from **0% to 300%**. Existing saved values and
  preset speeds are preserved; 100% is the former maximum. Wind drives mist,
  leaves, dust, embers and snow, as well as rain's sideways motion. Rain streak
  angles now track the instantaneous gust velocity instead of only the average
  wind. Particle counts and GPU budgets do not increase with wind strength.
- Lighting adds a **Scene tint** color picker, **Scene tint strength**, and
  **Reset scene tint**. Choosing a color with zero strength starts it at 25% so
  the effect is visible immediately. Strength is adjustable from 0% to 100%.
  Tint affects the map grade, the figures' directional/ambient lighting and
  mist. It is additional to the chosen day/dusk/night/dungeon lighting.
- Local lights retain their colors; tint is reduced around their ground pools.
  Mist color remains an independent control. Scene tint does not recolor the
  HUD, labels, affinity borders, source model files or original map image.
- **Clear day** resets custom tint to white at 0%, uses full ambient brightness
  and balanced miniature daylight, and disables atmospheric coloring effects.
  An unlit, unshadowed map pixel receives no grade contribution. Existing placed
  lights and token shadows are still available. Day previously lowered the
  figures' ambient intensity from 2 to 1.35; restoring the brighter showcase rig
  subsequently washed out diffuse colors. The follow-up below replaces that rig
  with balanced daylight. Other lighting presets retain their looks.

`sceneTint` (strict six-digit hex) and `sceneTintStrength` (0..1) use the existing
sanitized map environment JSON and shared snapshots. Older saves default to no
custom tint; wind is bounded to 0..3. No database migration or campaign rewrite.
Preset patches reset custom tint, so their named looks are reproducible.

## Verification

- Typecheck, production build, **915 tests across 99 files** pass. Existing
  bundle-size advisories remain; model hashes validate unchanged.
- Connected DM/player regression exercises the actual color input and sliders,
  300% wind, reset, Clear day, preset changes, quality controls and save/reload.
  Save export/import tests retain stronger wind and custom color. Invalid
  inputs preserve prior values; player/campaign ownership rules are unchanged.
- Maximum tint and wind, fireflies, rain, wet ground and a forced lightning peak
  remain hidden beneath full map fog: zero changed central map pixels compared
  with environment effects Off.
- The recorded preview compares an unshadowed 170 x 80 map region with effects
  Off and Clear day: zero changed pixels (RGB difference tolerance 3). Applying
  the cool tint changes over 10,000 pixels in the same region. No JavaScript or
  WebGL shader errors occur during capture.
- Published media are checked against local SHA-256 hashes. Mobile viewport
  playback, byte-range seeking and the interactive controls are verified in
  desktop Chrome; this is not a physical-phone performance benchmark.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY --wind-color
node scripts/environment-preview/publish-wind-color.mjs EVIDENCE_DIRECTORY
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-wind-color-20260928/index.html

The video compares Clear day, cool/warm tints, reset, and rain at 0%, 100% and
300% wind plus a direction change. Only static preview media and the isolated
lab are published; the running campaign application and save are unchanged.

## Daylight figure-color follow-up

The brighter restored rig made red robes look pink and lifted skin and cloth
into the tone mapper's pale highlight range. Day now uses ambient fill 0.75,
directional light 2, and reflection intensity 0.35. Source textures, material
colors, renderer exposure and map pixels are unchanged. Tint, lanterns, shadows
and other lighting presets keep working through the same renderer.

`verify-daylight.mjs EVIDENCE_DIRECTORY` compares the published pre-fix scene
with the local rebuilt lab at the same camera and frozen animation time. It
checks original ground pixels and compares the same red-cloth pixels on Vanec.
The run retained 0 changed ground pixels and raised red-cloth chroma from 0.509
to 0.637 across 4,834 pixels, without a saturation filter. Visual review confirms
stronger cloth color and darker, better defined materials on all seven figures.

Comparison: https://dnd.nic024i.app/uploads/previews/environment-daylight-20260928/index.html

The comparison is published separately; the previous videos remain historical.

## Default renderer follow-up

The chest/trap recording exposed a separate route: a map with no environment
settings never instantiated the environment lighting controller, so it retained
ambient 2, key 3 and reflection 1. Disabling environment effects also restored
those original values. The earlier Clear day correction therefore did not cover
ordinary maps or effects-off views.

`miniatureLightingDefaults.ts` now supplies ambient 0.75, key 2 and reflection
0.35 to both renderer initialization and the Clear day palette. Environment
shutdown/quality-off restores that same corrected baseline. Dusk, night and
dungeon settings are unchanged. Source models, textures and map art are unchanged.

Verified with typecheck, all 915 tests, production build, the real DM/player
environment regression and the chest/trap regression. Fresh capture uses a map
without environment settings; preview image/video loading also checked at
390 by 844. The live campaign app is not deployed by this change.

[Corrected map capture and before/after](https://dnd.nic024i.app/uploads/previews/objects-lighting-fixed-20260928/index.html)
