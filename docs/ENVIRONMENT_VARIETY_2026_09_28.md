# More battlefield atmospheres

DM: **Maps > Environment > Environment preset**. Six additional presets bring
the shared catalog to 15. Each can be adjusted afterward; the selector then
shows Custom settings. Presets preserve placed lights, shadow direction/length,
wind direction, carried lanterns, map calibration and per-browser quality.

| New preset | Appearance |
| --- | --- |
| Autumn wind | Tumbling orange/gold leaves, warm evening light, faint low mist |
| Firefly glade | Gently glowing fireflies and thin green mist in moonlight |
| Haunted marsh | Deeper green mist, sparse glowing motes and wet ground |
| Ashfall | Grey ash, rising orange embers and smoky evening haze |
| Sandstorm | Windblown dust grains and warm, taller billowing haze |
| Blizzard | Strong wind, dense snow and cold low mist |

## Controls and storage

- **Atmosphere particles**: None / Autumn leaves / Fireflies / Ash and embers /
  Windblown dust, with a density slider. Independent of rain/snow and mist.
- **Mist color**: Natural / Cool blue / Eerie green / Ash grey / Warm sand.
  Existing height, density, shading and movement reactions still apply.
- Existing wind direction and strength drive both weather and particles.
- Selecting Clear day resets the new effects along with existing atmosphere.
- `particles`, `particleIntensity` and `mistColor` join the sanitized environment
  JSON. Defaults are none, 0.5 and natural. Older maps retain their appearance;
  no schema migration or rewrite of campaign content is necessary. Save export,
  import and DM ownership follow the existing environment update path.

## Rendering and limits

One additional instanced quad draw uses seeded GPU motion in map coordinates.
High-quality maximum budgets are 350 leaves, 140 fireflies, 900 ash/embers or
1400 dust grains, multiplied by density. Low uses 35% of those counts; Auto uses
Low on small screens or large drawing buffers. Off hides the layer. There is
no per-particle JavaScript simulation or network traffic. Rendering remains
on each viewer's GPU, with bounded extra work rather than a frame-rate promise.

Leaves flutter and tumble; fireflies drift and brighten gently; ash falls while
embers rise; dust follows wind. Fireflies and embers are visual glows, not new
point lights. The original mist shader supplies the tinted volume and retains
its lower-body movement wake. No new scenery, accumulating snow, leaf piles,
wall collisions or weather damage/vision rules are introduced.

Particles depth-test against 3D figures. Both their map position and projected
ground pixel are masked by map fog, including glow fringes. Hidden figures and
hidden lights continue to follow existing visibility rules. Reduced motion
freezes particles and suppresses lightning. A final-frame guard ensures a
preference change gets painted even inside the animation frame cap.

## Demonstration and verification

The six-look comparison uses the same original courtyard and seven full-detail
miniatures. It includes party movement with hip lanterns, rotation, overhead,
and returning to Clear day. The lab uses the same preset catalog and renderer
as the app.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY --variety
node scripts/environment-preview/publish-variety.mjs EVIDENCE_DIRECTORY
node scripts/environment-preview/verify-variety.mjs EVIDENCE_DIRECTORY
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-variety-20260928/index.html

Verified locally:

- Typecheck, production build, all 914 server tests across 99 files; existing
  bundle-size advisories remain. Original model hashes validate.
- Expanded real DM/player browser regression against a temporary database:
  all six presets, custom particles/tint, simultaneous snow and leaves, shared
  state, preserved lights, reload, mobile quality, movement and fog.
- A forced peak lightning pulse plus rain, wet ground and maximum fireflies
  produces zero changed central map pixels under fully covered fog compared
  with effects Off. Reduced motion clears the flash and freezes particles.
- The 40.76-second H.264 recording is 1142 x 752 (14.5 MB), with no
  JavaScript/WebGL shader errors. Publication checks
  compare remote files to local SHA-256 hashes. Mobile verification records
  playback, HTTP range support, six presets, preserved lights, bounded particle
  counts, reduced motion, movement wakes and responsive layout in its receipt.
  This uses a mobile viewport in desktop Chrome, not a physical-phone benchmark.

Only preview media and the standalone interactive scene are published. The
running campaign application and live save have not been updated.
