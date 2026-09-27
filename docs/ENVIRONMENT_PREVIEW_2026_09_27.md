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

This revision replaces the flat transparent sheets with one bounded density
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

## Wisps, movement and quality settings

The next revision combines narrow, wind-stretched wisps with sparse low billows.
Drift is about four times faster than the preceding volume. A 160-by-112 RGBA
map-space field bends the density around the four raised scenery pieces and
records token wakes. A moving token parts the mist and adds a softly curled rim;
the wake expands, drifts and fades over 3.6 seconds. The field updates at most
15 times per second, has at most 48 wake stamps and drops stamps immediately
when their source token is no longer visible. Teleports do not draw a long wake.
Reduced motion freezes the density and clears wakes. These are visual
approximations; there is no fluid solver or collision detection for painted walls.

Mist renders separately from the original scene. High uses half width/height
and 24 depth samples; Low uses quarter width/height and 12 samples. A depth-aware
four-sample composite keeps fog from bleeding across miniature silhouettes.
The map and models retain full resolution. Ground shading uses three samples.
Auto chooses Low below 600 CSS pixels of canvas width or above two million
drawing-buffer pixels, otherwise High; it is a resolution budget, not an FPS
adaptive controller. Off disables visible mist and its ground shading.

This standalone test still runs locally and does not add server synchronization.
Campaign integration will need shared wind/time settings and visibility-filtered
movement events, with quality kept local to each viewer.

Preview:
https://dnd.nic024i.app/uploads/previews/environment-wispy-mist-20260927/index.html

The browser recording demonstrates the moving-token wake and recovery, High/Low,
height controls, overhead and orbit. Run the separate performance capture without
recording or another GPU test:

```sh
node scripts/environment-preview/benchmark.mjs PREVIEW_URL EVIDENCE_DIRECTORY
```

It uses asynchronous WebGL GPU timer queries around the complete depth, scene
and mist render passes. Each mode starts from the same camera angle, warms up,
and measures while orbiting. CPU work and browser composition are outside that
measurement. A phone viewport is still the host PC's GPU, not phone hardware.

On the RTX 5090 through Chrome/ANGLE D3D11 at a 1600-by-1000 viewport,
the observed median complete-scene GPU times were 3.505 ms Off, 3.712 ms High,
and 3.519 ms Low; a repeated Off sample was 3.521 ms. This small measured
increment applies to this high-end GPU and test scene only. The accompanying
phone-viewport sample uses the same GPU and cannot predict real phone speed.

Typecheck, production build and all 896 server tests pass. The desktop/phone
browser capture checks buffer scale, sample counts, Off disabling mist shadows,
bounded wakes, wake expiry and scenery interaction toggles. No page, shader or
HTTP errors were reported; two fully delivered and rendered GLB transport
warnings remain recorded with evidence. The 55.16-second, 20.4 MB video was
visually inspected and its public playback verified. The published phone-width
test also loads all seven models, selects quality levels, confirms Auto chooses
Low, and moves Druk to produce a wake.

## Path-following trail refinement

The first movement response looked like a circular distortion following the
base. The revised field records short segments of the travelled path. It clears
a narrow corridor and lets that corridor close from its edges over six seconds.
Spaced sections of the two edges curl inward in opposite directions after the
figure passes, pulling surrounding wisps into the wake and gathering a little
mist along the curl. No circular expansion or rotation is attached to the token.
Only ambient wind moves the old trail slightly after its creation.

The field is now 320 by 224 RGBA bytes (280 KiB per uploaded field) so a curled
strand has enough resolution. Uploads remain capped at 15 Hz and history at 48
segments; the volume still uses the existing High/Low resolution and sample
limits. This remains a bounded visual approximation, not a fluid simulation.
The previous GPU timings above do not measure this revision.

Regression tests cover a retained trail after a turn, no disturbance ahead of
movement, edge curls, complete expiry, hiding a source, disabling interaction,
and skipping teleport streaks. Typecheck, production build and all 900 tests pass.
The environment browser verifier checks the actual rendered effect and expiry;
the focused recording compares interaction off/on and a close overhead view.

Preview: https://dnd.nic024i.app/uploads/previews/environment-curling-trail-20260927/index.html
This updates the separate environment preview, not the live campaign renderer.

## Stronger wake and camera continuity

The cleared corridor is slightly wider and affects more of the low mist volume.
Its edge curls are fuller, with stronger inward rotation and displaced density;
they still stay along the travelled path and fade over six seconds. History and
texture bounds are unchanged.

Camera orbit reproduced a real history reset: twenty retained wake segments
dropped to zero. `setProjection` drew immediately using `performance.now()`,
while animation callbacks supplied the earlier start-of-frame timestamp. The
mist interpreted that small backwards step as a restart. Rendering now reads
one live monotonic clock; stale positive mist ticks are ignored. Tab visibility
no longer restarts the effect clock. Reduced motion still explicitly clears
wakes and freezes the field at time zero.

The former 10:1 wind-stretched noise exposed long parallel strips from some
angles. Two spatial warp fields, differently oriented shorter wisps, and a
broad irregular density envelope break up that alignment. These remain
world-space shapes viewed through the depth-clipped volume, not camera-facing
cards. The density function uses five noise samples instead of four; resolution
and ray sample budgets remain unchanged. Previous GPU measurements above do
not measure this revision.

Validation: typecheck, production build, all 901 server tests, the full
desktop/phone environment verifier, and a focused orbit regression pass. The
orbit regression fails on the prior build and passes on this build. It checks
that existing wakes survive rotation, their age keeps increasing, and mist time
does not go backwards. The recording also exercises a right-button drag during
movement, the opposite camera angle, and overhead. Its actual encoded start
marker determines trimming, avoiding wall-clock/encoder timing differences.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/check-orbit.mjs EVIDENCE_DIRECTORY
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-mist-orbit-20260927/index.html

The 27-second H.264 recording and interactive lab are separate static previews.
No campaign data or running app service was changed.
