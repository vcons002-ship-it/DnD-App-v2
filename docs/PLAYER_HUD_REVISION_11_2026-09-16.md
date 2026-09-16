# Player HUD revision 11 - life-force liquid refinement

Presentation-only refinement of the existing player health globe. The guardian
art, globe location/size, engraved AC, resource rows/arcs, health controls and
temporary-HP barrier placement are not changed. Campaign HP and resource rules
remain authoritative; no gameplay automation or data conversion is added.

## Material and motion

- A thinner, wet free surface replaces the broad bright cap, with front/back
  depth, a subtle wall meniscus, and smaller independent ripples.
- Irregular layered ruby currents replace regular luminous stripes; warm
  internal threads and sparse carried motes suggest magical life force.
- Liquid transparency follows apparent thickness, with a dense ruby center and
  slightly clearer thin regions. Stationary glass highlights stay distinct.
- Rare, depth-varied bubbles rise to the moving surface and disturb it subtly.
- Damage drains promptly with a small surface surge. Larger hits briefly leave
  a wet trace on the inside glass. Healing refills gently with rising light.
- Impacts scale by the actual HP delta relative to maximum HP, without the old
  minimum wobble. Fill interpolation is monotonic, never overshoots, and drains
  faster than it refills. Maximum-only edits do not trigger impact feedback.
- Zero HP retains neutral glass but no lingering liquid particles or red halo.

The shader remains a single bounded pass, capped at 384 pixels per side and
approximately 30 draws/second. Reduced-motion mode is static and updates only
when needed; hidden pages pause, and unavailable/lost WebGL keeps a static
translucent fallback. More costly true map refraction remains deferred: this
pass reveals the actual map through alpha but does not bend its image.

## Validation and evidence

All mutation-based checks use disposable databases. Motion-helper unit tests,
actual shader pixel/uniform tests, resource geometry, existing temporary-HP
absorption, and active/inactive barrier checks protect functionality.

Passed: client build, server/client typechecks, 17 focused unit tests and all
12 targeted Chromium tests (no skips or flaky retries). Actual WebGL samples
confirmed transparent glass (alpha 25/255), rich liquid (215/255 at the half-fill
sample), a fuller core (221/255) than thin side (203/255), and zero alpha outside
the globe. Empty glass had no red liquid or red CSS halo. The instrumented test
observed 30 draws/second and a 139x139 texture; this is a bound/cadence check on
the current PC, not a GPU timing benchmark. One-HP changes at maximum80 produced
signed impulses of +/-0.03, with no minimum-strength splash.

The isolated visual helper passed all three artworks at 1366x768 and 1920x1080,
with no page errors and identical geometry across temporary HP 12 -> 0 -> 12.

Three-character layout evidence: `preview-evidence/revision-11/`.
The refined recording uses the same isolated damage/heal sequence as the prior
video, written separately to `preview-evidence/orb-motion-refined-2026-09-16/`.
The original videos are preserved. Rendering observations on this PC are not a
laptop GPU benchmark or a broad performance guarantee.

Final capture: 44.97 seconds, silent H.264/30fps, 1349 output frames, no page or
decode errors. The original preview character remained 29/47 HP and0 temporary
HP before and after. The capture used ANGLE/D3D11 on the RTX5090 with a252x252
liquid bitmap. `before-after.mp4` places the original and refined close-ups side
by side; the sequences differ by only a few hundredths of a second at actions.
Surface movement and healing illumination are deliberately restrained, not an
increase in dramatic splashing. Thinner-edge opacity and subdued, irregular
internal movement are easier to judge in the close-up than in a still image.

Local preview only; no production deployment, restart, passcode/session change,
or campaign migration.
