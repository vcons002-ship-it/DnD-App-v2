# Environment presets and the rainstorm

DM: **Maps > Environment > Environment preset**. Applying a preset enables the
environment and sends one normal authoritative settings update. Its values are
editable afterward; the selector shows Custom settings if those values change.
There is no new environment database column or campaign migration.

## Presets

| Preset | Look |
| --- | --- |
| Clear day | Bright daylight and defined token shadows |
| Golden dusk | Warm fading daylight and softer shadows |
| Moonlit night | Cool moonlight with light floor mist |
| Light rain | Gentle rain, subdued daylight, thin mist and light wet highlights |
| Rainstorm | Driving rain, stronger wind, wet highlights and cloud lightning |
| Snowfall | Drifting snow under soft winter light |
| Misty moor | Dim evening light and three-foot drifting mist |
| Dungeon | Approved dungeon lighting and light 1.5-foot floor mist |
| Deep dungeon | The same dungeon setup with Heavy darkness |

All presets preserve placed lights, shadow direction/length, wind direction,
token lantern state, map calibration and each viewer's local quality. They
replace their atmosphere fields completely, so selecting Clear day after a
storm turns off rain, wetness, mist and lightning. Saved settings, backups and
map imports retain the actual values rather than depending on preset IDs.
Small conversion roundoff between feet and preview pixels does not incorrectly
mark a preset as custom.

## Storm effects

- Rain remains the bounded instanced renderer (2200 particles at High/maximum,
  35% at Low), with ground splashes. Wind drift now has continuous mild gusts.
- **Wet ground** controls irregular darkened patches and view-dependent soft
  sheen within the existing ground-grade shader. This is a visual surface
  treatment of the original map, not water accumulation, geometry reconstruction
  or reflections of individual figures. No extra reflection render target.
- **Lightning flashes** is available with rain. Sparse cloud pulses brighten
  the map, directional/ambient/reflection lighting of real models, and mist.
  There is a short rise and slower fade, separated by roughly 12-26 seconds.
  The deterministic wall-clock schedule makes viewers with synchronized device
  clocks see the same pulses; this does not introduce network clock correction.
- Each viewer's reduced-motion preference suppresses the flashes and freezes
  the existing weather/wet-surface animation. Environment quality Off restores
  the ordinary renderer. The DM can disable flashes separately.
- Source map artwork, character models and fog rules are unchanged. The ground
  overlay and weather retain map-fog masking; hidden models remain absent.
  Lightning does not reveal fog. No thunder audio or new 3D scenery was added.

## Preview and checks

The original courtyard and all seven full-detail miniature assets are reused.
The video shows Clear day, Light rain, Rainstorm with an actual scheduled flash,
the party moving with hip lanterns, rotation, overhead view and Clear day again.
The same nine-preset catalog powers the lab and the real DM controls.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY --storm
node scripts/environment-preview/publish-storm.mjs EVIDENCE_DIRECTORY
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-rainstorm-20260928/index.html

Verified:

- Typecheck, production build, 914 tests in 99 files; focused environment tests
  pass after the numeric-tolerance adjustment. Existing bundle-size advisories
  remain. All model hashes validate.
- Real connected DM/player browser regression: preset application, preserved
  placed light settings, save/reload, normal/heavy darkness, reduced motion,
  quality controls, movement, 2D fallback and fog. A forced peak lightning
  pulse plus full wetness/rain produces zero changed central pixels beneath
  fully covered map fog compared with effects Off.
- Original-map recording has no JavaScript/WebGL errors. H.264 video is
  1142 x 752, 37.36 seconds, with seeking and inline playback.
- Published bytes match local media. At 390 x 844 in Chrome, video plays with
  no overflow/error; the interactive scene loads all seven models, picks Low
  mist quality, applies all nine presets while retaining three placed lights,
  honors reduced motion and produces movement wakes. This is mobile viewport
  validation, not a physical-phone performance measurement.

Only static preview media and the standalone lab are published. The running
campaign app and live campaign save are not updated.
