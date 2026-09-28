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
  and the ordinary miniature lighting, and disables atmospheric coloring effects.
  An unlit, unshadowed map pixel receives no grade contribution. Existing placed
  lights and token shadows are still available. Day previously lowered the
  figures' ambient intensity from the normal 2 to 1.35; it now uses the renderer's
  captured original lighting values. Other lighting presets retain their looks.

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
