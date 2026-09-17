# Revision 24 - light inside the resource crystals

Development follow-up to `94cb63f`; supersedes revision 23's halo-heavy balance.

The existing 3.6-second fade now emphasizes light inside the gem rather than
around its socket. The base crystal has a deeper-colored heart instead of a
permanent pale hotspot. A broader luminous core and lower-facet refractions
pulse underneath the crisp surface reflections and metal claws. The light is
clipped to the original cut: no extra gemstone, enlarged button or moving art.

The internal-light opacity ranges from 0.18 to 0.90 at level I and from 0.276
to 0.996 at level IX. Higher levels retain their brighter facets. Outer bloom
is reduced to 0.025-0.16 at level I (0.049-0.224 at IX), with a narrower blur
and footprint. Spend/restore retain their existing finite energy animation,
with the diffuse outer flash subdued to keep the emphasis inside the stone.

There are no gameplay, resource amount, automatic spending, manual editing,
save/schema, layout, HP or damage-timing changes. Spent gems remain dark;
reduced motion remains steady and hidden tabs pause. The visual effect still
animates opacity only, not per-frame React state, geometry or blur size.

## Verification and delivery

This is a client-only update in the existing local preview on port 4276;
refresh the browser to load it. No backend restart or production update is
needed. No production data was changed. Regression fixtures and recordings
use disposable databases.

- Client/server TypeScript checks, client build and all 597 unit tests in
  63 files passed.
- All eight resource-gem browser tests passed in 35.1 seconds. They verify
  manual editing, automatic Magic Missile slot use, spent/restore animation,
  all nine tiers, custom/extra distinctions, both layouts, reduced motion,
  hidden-tab pause and unchanged geometry.
- At native 14.4375-pixel socket width, 54 of 73 sampled pixels inside the cut
  visibly changed across the pulse. The mean maximum-channel change was 34.26
  inside versus 0.095/0.125/0.200 outside on dark/medium/bright map tones.
  This check explicitly tests internal light dominance, not external bloom.
- A real 7.6-second browser sample measured core opacity 0.18-0.90 and the
  subdued outer spill 0.025-0.16 with unchanged socket bounds.
- Browser evidence: `preview-evidence/gem-internal-light-20260917/tests/`.
- Final served client: `index-MqmCqxsZ.js`, `index-CKlsvrGk.css`.

Actual browser recordings and peak/trough frames are in
`preview-evidence/resource-gems-internal-v24-2026-09-16/` (historical recorder
directory date; receipt holds capture time). Root reviewed the native-size
peak and enlarged peak/trough frames: the light change is concentrated inside
the original stones with very little exterior haze. The 106 live idle samples
measured core opacity 0.180008-0.899773, with unchanged socket bounds.

The source was opened read-only; source HP/resources compared unchanged and
the disposable demonstration's counters were restored, with no added rows
or altered maxima. The footage contains actual browser frames, not generated
motion. Capture/encoding cadence is not a gameplay frame-rate benchmark.

Initial local tests used Node 24.16, outside the declared Node 20-22 range.
GitHub Node 22 validation is tracked below; no general performance benchmark
is claimed.

## PR release follow-up

The first GitHub Node 22 / Ubuntu run passed typecheck, build, unit tests and
97 of 98 browser tests. The combined phase-sampling/reduced-motion gem test
still saw test-paused animation objects after switching media preferences;
the separate reduced-motion and hidden-tab tests passed. Local Chrome 153
did not reproduce that retained-object behavior.

The fixture now reloads after deterministic screenshot phase sampling, checks
that untouched CSS animations are naturally running, then switches to reduced
motion and polls for zero actual animations. The computed-style checks still
require every gem animation to be disabled. This separates the browser's
handling of test-owned paused/seeked objects from the real user preference
transition; no application visuals or gameplay code was changed to make CI pass.

The corrected fixture passed all eight local gem tests plus three repeated
runs of the combined tier/reduced-motion case. Local server/client typechecks
and all 597 unit tests were repeated successfully before the follow-up commit.

A subsequent PR check exposed an unrelated existing random miss fixture in
`twoStepDamage.test.ts`: even a -20 attack bonus against AC 40 can hit on a
natural 20. That fixture now controls the random roll during its attack only,
checks a non-critical miss explicitly, and restores the random source before
the remaining tests. The natural-20 gameplay rule is unchanged. The full local
98-test browser rerun passed after the gem fixture correction, including a
damage floater appearing 123 ms after the final damage total was displayed.

The parallel push check also caught a pre-existing mastery fixture accepting
either HIT or CRIT while always expecting the non-critical `5d1` bonus of 5.
Its deterministic coverage now distinguishes ordinary hits from critical hits;
the existing critical-hit doubling rule remains unchanged. These release
follow-ups change test fixtures only, not game rules or production code.
Local server/client typechecks and all 598 unit tests passed after adding
the explicit critical-hit case; the full client/server build also passed.
