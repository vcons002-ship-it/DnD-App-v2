# Courtyard environment proof

An isolated interactive lighting study uses the production `MiniatureLayer`
renderer and the existing courtyard image, all three party miniatures, a Cultist
Fanatic, two goblins and a wolf. It is a separate static entry point, not a
campaign migration or a saved DM environment editor.

## Try it locally

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/verify.mjs --output .preview-data/environment
```

The build packages the selected real models into `client/environment-dist`.
Serve that directory and open `environment-test.html` for interactive inspection.
The verification runner starts its own static server, uses installed Chrome and
ffmpeg when available, captures desktop/phone evidence and writes a receipt.
It does not start the game server, connect to multiplayer, or write campaign data.

## Included

- Contact and directional ground shadows with adjustable map-space direction and
  length. Drag from an object toward the end of its painted shadow to set direction.
- Two decorative stone pillars and a rock cluster sharing the miniature depth
  buffer. These are simple procedural scenery prototypes, not final generated art.
- Two localized, low, animated mist patches with depth testing.
- Optional whole-map mist with a dedicated on/off switch, patch/full-map
  coverage toggle, density control, and a 0.5-to-10-foot height slider.
- Original/effects comparison, overhead and 45-degree views, smooth orbit,
  pan/zoom, close-up and a scripted Druk movement to inspect a moving shadow.
- Original ground image preserved byte-for-byte; selected GLBs copied without
  reduction or texture edits. Asset hashes are written in the build receipt.

## Boundaries

Normal battlefields do not pass `environmentPreview` and retain their existing
lighting, visibility, interactions and frame scheduling. This proof adds no
environment columns, socket events, fog mechanics or elevation rules.

The artwork's shadows are baked pixels. The initial 55-degree setting is a
visual approximation, not automatic recovery of the map's physical lighting.
Painted walls do not acquire occlusion or height. Only the added meshes have
real depth; walking surfaces remain flat.

The full party assets make the interactive download substantial. The published
comparison video is the quickest phone preview. Desktop capture timings and a
phone-sized browser viewport are not measurements of real phone GPU performance.

Before a shared in-game environment editor, scenery placements and effects need
server-shaped map visibility, clipping at concealed map regions, saved settings,
lower quality options and crowded-board measurements.

## Verified first test

- Typecheck and production build pass; 896 server tests across 96 files pass.
- Three existing browser cases pass for real monster model loading in both
  views, whole-token fog concealment, and dragging during map rotation.
- The dedicated preview runner loads all seven real models on desktop and a
  390 x 844 viewport, exercises every environment control, verifies shadow
  direction stays in map coordinates during orbit, and records the comparison.
- Two Chrome transport-abort notifications followed complete HTTP delivery of
  models that subsequently parsed and rendered. The receipt preserves them as
  completed-asset transport warnings with delivery and renderer evidence;
  no JavaScript, shader, or HTTP errors were observed.
- The published 29.68-second H.264 video is 10.8 MB and supports range seeking.
  Verification through the public URL confirms video playback and all seven interactive
  models at phone width without horizontal overflow.

Preview: https://dnd.nic024i.app/uploads/previews/environment-courtyard-20260927/index.html

To publish and check a future recording:

```sh
node scripts/environment-preview/publish.mjs EVIDENCE_DIRECTORY PREVIEW_DESTINATION
node scripts/environment-preview/verify-published.mjs PREVIEW_PAGE_URL EVIDENCE_DIRECTORY
```

The publication script requires a passing preview receipt. Publish only to the
intended static preview directory; this does not rebuild or restart the live app.

## Maximum-mist comparison

The follow-up preset sets mist to the current slider maximum (0.50, displayed
as 50%) and increases ground-shadow strength from 0.65 to 0.80. Shadow direction,
light position, art and geometry are unchanged. Opaque miniature and scenery
meshes both cast and receive directional shadows; contact shadows remain flat
under each base. Painted map shadows cannot shade moving figures.

The separate comparison preserves the original preview URL:
https://dnd.nic024i.app/uploads/previews/environment-courtyard-max-mist-20260927/index.html

Verified typecheck, preview build, 896 server tests, desktop/phone preview controls,
and public video playback plus all seven loaded models. The 30.24-second video
is 11.3 MB; first, mist, and rotated frames were visually inspected.

## Whole-map mist and height controls

The next preview starts with whole-map mist at 2 feet, maximum density and the
previously darkened shadows. `Drifting mist` switches the effect on/off;
`Whole-map mist` switches between the full rectangular map and the two original
patches. Height is the top of the mist, converted with the map's 64 pixels per
5 feet. Density and height are independent. The original map edges fade softly.

Height adjustments reposition the existing layers without rebuilding shaders or
refreshing the static shadow map. The full-map view fits the projected map
corners, including the perspective enlargement at the near edge.

Preview:
https://dnd.nic024i.app/uploads/previews/environment-whole-map-mist-20260927/index.html

The recording compares the full map with mist off/on and close views at 0.5,
6 and 10 feet, followed by overhead and rotation. Browser checks verify actual
rendered layer heights, coverage, on/off state and seven loaded miniatures;
the public phone-width check also changes height and switches mist off/on.
This remains a cosmetic preview without new campaign visibility mechanics.
Typecheck, production build and all 896 server tests pass. The inspected and
publicly verified comparison video is 43.28 seconds and 16.0 MB.

## Billowing mist and ground shading

The latest preview replaces the flat transparent sheets with one bounded density
volume. A 64-cubed noise texture defines connected banks, smaller billows and
irregular tops. A 32-step ray march shades the interiors and clips at the existing
opaque miniature/scenery depth, so mist behind a figure cannot wash over it.
Mist in front can partially veil its legs or body, depending on height.

`Mist shadows` switches a soft ground-darkening effect on/off. Six samples toward
the map's light source use the same moving density field as the visible mist.
The effect is capped at 16% darkening and is an approximation of diffuse light
attenuation, not another solid silhouette shadow. It affects the map surface;
mist shadows do not shade the miniature materials. Existing token/scenery
shadows retain their casting and receiving behavior.

Height and density adjust uniforms and the volume bounds without recreating
geometry or refreshing static shadow maps. Reduced motion freezes the mist.
The shader costs more than the former transparent sheets; phone-width browser
verification does not establish performance on physical mobile hardware.
Quality controls remain a prerequisite for campaign integration.

Preview:
https://dnd.nic024i.app/uploads/previews/environment-billowing-mist-20260927/index.html

The dedicated verifier compares mist shadows off/on with the scene frozen,
then exercises coverage, density, 0.5/2/6/10-foot heights, overhead view and
rotation using all seven original miniatures. The landing page includes those
frozen shadow comparisons beside the recording and interactive test. Original
map bytes, models, saved campaign state and fog-of-war rules are unchanged.

Typecheck, production build and all 896 server tests pass. The dedicated browser
capture reports no JavaScript, shader or HTTP errors; one completed model
transport warning is retained with delivery/render evidence. The 43.72-second,
15.0 MB H.264 video was visually inspected and played successfully through the
public URL at phone width. The published interactive test loaded all seven
models and passed height, mist on/off and mist-shadow toggle checks.
