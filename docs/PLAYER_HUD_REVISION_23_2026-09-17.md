# Revision 23 - breathing resource-gem light

Development follow-up to `6d4e299`; preview-only, not a production deployment.

## Presentation change

Revision 20 used steady illumination. Available gems now visibly fade down and
up over 3.6 seconds with eased transitions, both inside the stone and in its
colored halo. The existing cut supplies the bloom; there is no duplicate gem,
new raster artwork, moving socket or change to the concentric layout.

The halo extends farther beyond the metal so the pulse can be seen at the
default 85% laptop scale. Its opacity varies from 0.12 to 0.86 for level I and
ordinary class/custom resources. Higher spell tiers progressively raise both
the trough and crest, reaching 0.232 to 0.996 for level IX. A slight fixed phase
offset creates a gentle wave across the resource rows. The stone's base facets
remain colored even at the trough; a dim part of the pulse cannot be confused
with an empty resource.

Spent gems have no idle glow or idle animation. Existing spend/restore energy
effects temporarily take over, then active gems resume breathing. The pulse
changes opacity only: no per-frame React updates, animated blur radius, layout
animation or new timer. Hidden tabs pause it; reduced-motion users retain
steady lit gems without the loop.

Resource amounts, automatic spending, manual editing, extra-slot engravings,
overflow choices, button geometry, HP effects and damage-roll timing are all
unchanged. No server, schema, campaign or DM-layout change is involved.

## Deployment and verification

The rebuilt client is served by the existing local preview on port 4276. A
browser refresh loads it; no additional backend restart is required. Production
on port 4000 is untouched. Tests and recordings use disposable databases, not
the active preview campaign.

- Client and server TypeScript checks passed.
- 597 unit tests across 63 files passed.
- All eight resource-gem browser tests passed in 32.2 seconds against the final
  build. They cover both layouts, all nine spell tiers, dark spent gems,
  unchanged socket geometry, manual edits, automatic spell spending, finite
  spend/restore effects, reduced motion and hidden-tab pause/resume.
- A 7.6-second real-time browser sample measured the level-I halo fading from
  0.12 to 0.86 without moving its socket. Native 14.4375-pixel socket checks on
  dark/medium/bright map tones measured 117/146/180 changed pixels outside the
  socket at the crest (maximum channel differences 79/59/47).
- Detailed browser evidence: `preview-evidence/gem-idle-fade-20260917/final-tests/`.
- Final served assets: `index-DzSGVdHx.js`, `index-DA0q79CQ.css`.

The actual-browser recording under
`preview-evidence/resource-gems-breathing-v23-2026-09-16/` uses the existing
preview character's resource rows in a disposable database, without adding
slots or changing maxima. Its historical directory suffix is retained by the
recorder; the receipt records the actual capture time. Source HP and resource
records compared equal before/after recording. The longer demonstration restores
existing spent slots only in the copy and returns all counters to their initial
values; the eight-second idle excerpts contain no resource edits.

- `resource-gems-idle-full-screen-8s.mp4`: native 1366 x 768 view at 85% HUD scale.
- `resource-gems-idle-close-up-8s.mp4`: explicitly enlarged 1200 x 800 detail.
- Both are silent H.264, eight seconds, 240 output frames at 30 fps.
- 107 real idle samples measured level-I halo opacity 0.120063-0.859936 and
  core emission 0.160050-0.739949, with unchanged gem bounds. The observed
  peak-to-peak interval was about 3.64 seconds at the capture sampling cadence.
- Root visual review compared native-size peak and enlarged peak/trough frames;
  no duplicate gems or moving socket art is introduced.

The recording uses real browser frames without motion interpolation; the
encoded 30 fps is not a measurement of gameplay performance. A subsequent
hidden-tab CSS specificity correction does not change visible-tab rendering;
the final browser suite verifies that correction against the final build.

Local validation uses Node 24.16, outside the declared Node 20-22 range; no
Node 22 CI run or general performance benchmark is claimed.
