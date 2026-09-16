# Player HUD revision 12 - visible liquid and ward reactions

Addresses the review that revision 11 looked too flat and its health reactions
were difficult to see at normal HUD size. This is a player presentation change,
not a change to HP calculation, temporary-HP absorption, rules or resources.

## Liquid

- Damage sends a travelling crest across the free surface, with three small
  liquid drops following short ballistic paths back into the globe.
- Healing rolls the surface in the opposite direction while a rising internal
  curl and illuminated ruby currents move through the body of the liquid.
- Stronger irregular depth contrast, slope-sensitive highlights and a slightly
  deeper visible surface distinguish wet liquid from a flat color fill.
- Larger losses leave a short wet trace against the inside wall. Glass, orb
  geometry and guardian art remain fixed; the vessel does not bounce or scale.
- Motion still scales with actual HP change relative to maximum HP, with no
  minimum splash for a one-HP change. Full and empty endpoints remain guarded.
- Existing slight transparency, frame/texture bounds, reduced-motion support,
  hidden-page pause and static WebGL fallback remain in place.

## Temporary HP

- A decrease in the saved buffer starts a localized blue-white flare and two
  expanding wavefronts over the spherical ward, plus a brief rim response.
- The last absorbed hit produces a 650 ms dissipating pulse. Blue +X text
  disappears immediately at zero; after that finite pulse no shield remains.
- Repeated decreases restart the cosmetic reaction. Grants, increases, initial
  load and character switches do not manufacture a hit. Reduced-motion or
  hidden pages cancel reactions; they are not replayed when returning.
- This observes the existing saved buffer, so manually reducing temporary HP
  also gives visual feedback. It does not infer damage, change HP or introduce
  a new damage event or server behavior.
- Every effect is absolutely positioned and pointer-transparent. Orb, AC,
  nameplate, resource symbols and controls retain their existing placement.

## Validation and evidence

Client build, client/server typechecks and 17 focused motion/layout unit tests
passed. Browser and normal-size visual checks use disposable databases, never
the active campaign.

All 15 targeted Chromium tests passed against the final build in 31.81 seconds,
without skipped, failed or flaky tests. Coverage includes actual shader output,
temp-HP absorption, rapid hit restart, depletion, no false grant/reload/character
change hits, reduced motion, WebGL loss/fallback, health-control interaction and
resource geometry. Hidden-page behavior uses a documented synthetic visibility
event, not an OS-level background-window integration test.

A fixed-time/fixed-fill replay of the actual compiled shader at 145 pixels
compared impact with idle output: 34.5-42.8% of interior pixels visibly changed,
with no colored pixels outside the sphere. This isolates liquid movement from
merely changing the fill level. Crest-or-droplet silhouette displacement was
8-26 pixels across the tested damage/healing frames; this includes airborne
droplets, not just meniscus height. The live renderer observed approximately
30 draws/second with a 139x139 test bitmap. These are regression measurements,
not a general performance guarantee.

The layout helper passed all three guardians at 1366x768 and 1920x1080, including
temporary HP 12 -> 0 -> 12 with identical orb/AC/identity/resource geometry.
Largest measured resource-circle error was 0.017 CSS pixels. See
`preview-evidence/revision-12/layout-checks.json`.

The final recording is at the default 85% UI scale (107.5 CSS pixel globe), not
an artificially enlarged HUD. It includes two shield hits, two HP losses and
two heals. Post-capture frame samples at 0.1/0.25/0.5/0.8 seconds make the short
reactions inspectable without stalling recording to take screenshots.

- Full scene: `preview-evidence/orb-motion-visible-reactions-final-2026-09-16/orb-effects-full-screen.mp4`
- Enlarged detail: `preview-evidence/orb-motion-visible-reactions-final-2026-09-16/orb-effects-close-up.mp4`
- Evidence: `preview-evidence/orb-motion-visible-reactions-final-2026-09-16/recording-receipt.json`

Both videos fully decoded without errors: H.264, 30 fps, 1378 frames, 45.93
seconds, no audio. Full scene is 1366x768; close-up is 1200x800. Receipt matches
the final client build SHA256, reports no browser errors, and confirms the
source preview character stayed at 29/47 HP and zero temporary HP. The capture
used ANGLE/D3D11 on the RTX 5090; it is not a laptop or sustained GPU benchmark.

The shield handles its own hidden-page pause even when WebGL is unavailable.
Its amount observer resolves before paint, avoiding a blank frame between the
buffer reaching zero and the final dissipating pulse.

Local player preview only. No production restart or deployment, campaign
conversion, new session/passcode, or DM layout change.
