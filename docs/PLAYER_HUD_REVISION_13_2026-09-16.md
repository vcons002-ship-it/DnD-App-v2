# Player HUD revision 13 - socketed resource gemstones

Player-only presentation refinement of the existing resource counters. The
aggregate `max`/`used` data, resource:set mutation, automatic spell/ability
spending, corrections, extra-capacity guidance and campaign data are unchanged.

## Art and motion

- Cut gemstones replace the smooth colored beads. Facet planes, a bright inner
  core, recessed seats, small metal claws and aged bronze/gold bezels match the
  guardian frame and resource medallions.
- Palette follows the existing resource classification: amethyst spell slots,
  sorcery magenta, martial amber, nature/healing greens and complementary hues
  for other recognized resources. Unknown custom trackers remain supported.
- Active stones glow from within; spent stones retain dark facets and readable
  sockets. Extra capacity keeps a distinct socket marking, without fraction or
  '+ extra' text on the HUD. Labels and totals remain available on hover/edit.
- Spending releases a short magical stream outward from the affected socket;
  restoration gathers light inward and ignites its core. The animation observes
  the saved active state, never spends or restores a resource itself.
- Initial mounts, reloads, character changes and capacity edits do not invent
  a spend/restore event. Opening a previously hidden drawer does not replay
  changes that occurred while it was closed. Rapid reversals replace the old
  reaction and retain button focus.
- Reduced-motion mode retains the static art and immediate authoritative state.
  Hidden pages cancel reactions without replaying hidden updates on return.
  The rack shares one visibility/media subscription; the gems do not run idle
  animation loops or separate rendering loops.

## Layout and rendering boundaries

Existing 17/18-pixel socket controls, arc centers, resource-symbol baseline,
compact rows, continuation rows, custom drawer, health orb, AC and guardian art
retain their positions and interactions. Effects are pointer-transparent and
do not transform the button or change its hitbox. Glyphs and Roman numerals
remain the existing edit controls.

Dimensional appearance is rendered by lightweight SVG facets and lighting,
not a separate WebGL renderer for every gem. Only finite event effects add
particles/streams; the art component is memoized against unrelated snapshots.

## Validation

The 29 focused resource-preservation, sigil, arc-layout and health-motion unit
tests passed using the repository's disposable database configuration. Client
build and client/server typechecks passed.

All 20 targeted Chromium tests passed on the initial gem-art build. After the
art-only inner-emission refinement, all six gem/sigil tests passed again. The
final stronger-flow build, `index-BywearRc.js`, then passed all six again in
19.1 seconds, with no failures, skips or flaky retries. The existing
health/ward tests were not changed. Resource coverage includes:

- Actual automatic slot spending through the existing Magic Missile handler.
- Single/multi manual spend and restore, rapid reversal, and retained focus.
- Initial/reload/layout/character-change and maximum-edit suppression.
- Unknown custom trackers, preserved extra capacity and editable maxima.
- Static reduced motion, preference changes during effects, and synthetic
  document-visibility cancellation without replay (not an OS-window test).
- Unique SVG gradient IDs, real finite CSS animations, pointer-transparent
  artwork and unchanged socket centers/hitboxes in both layouts.

The old extra-slot '+' markup assertion was intentionally replaced with the
visible engraved-diamond assertion. Accessible extra-slot text, reference
tooltip, capacity persistence and all circle-geometry assertions are retained.

## Visual verification and recording

The isolated layout helper passed all three guardian artworks at 1366x768 and
1920x1080, including the unchanged health/temporary-HP layout round trip. Final
static-art screenshots are in `preview-evidence/revision-13/`.

Normal-size video review caught subpixel energy strands and particles in the
first pass. The final effect uses bright cores with colored outer strokes and
particles that reach full size during travel. At the default 85% UI scale,
read-only browser measurements found 14.4375px controls, 1.083px core strokes,
1.985px colored halos and approximately 1.31-1.82px particle centers during
travel. Ancestor inspection found no clipping; this change strengthens visible
power flow without enlarging sockets, moving circles or covering the map.

Final recording: `preview-evidence/resource-gems-faceted-flow-final-2026-09-16/`.

- `resource-gems-full-screen.mp4`: native 1366x768 gameplay framing.
- `resource-gems-close-up.mp4`: enlarged, captioned 1200x800 detail.
- `recording-receipt.json`: exact build SHA256, event snapshots, SVG paint-size
  and clipping diagnostics, control geometry and source-counter comparison.

Both videos fully decoded without errors: H.264, 30fps, 930 frames, 31 seconds,
no audio. Four real resource:set events spend/restore one L1 slot and three
Sorcery Points in a disposable campaign copy. Original preview HP and counters
remained unchanged, and the disposable counters returned to their starting
values. Event effects were visibly distinguishable at normal HUD scale, not
just in the close-up. Source frame-arrival cadence is not a GPU benchmark.

Final visible-flow build: `index-BywearRc.js` / `index-BgZ8Whyg.css`.

Local preview only. No production deployment or restart, DM UI change, new
session/passcode, save conversion or new rules automation.

## Follow-up - spell-level idle glow

Available spell-slot gemstones now increase their steady internal light from
level I through IX. Level I retains its original light; each higher level adds
7% to the illuminated facets' brightness and a small, bounded inner radiance.
Level IX reaches 1.56x facet brightness. Metal sockets and socket positions do
not change, and the light stays inside the cut rather than becoming a large
halo over the map.

The display reads the existing `spellSlots` key (`L1` through `L9`), not the
character's level, the socket's position, or the number of extra slots. All
sockets of the same level share the same intensity, including manually added
capacity. Class/custom resources and spent stones retain their existing look.
Only active idle gems receive the enhancement; the established spend/restore
animations are unchanged, and reduced motion keeps the steady level cue.

Follow-up preview build: `index-Cnk5O8zG.js` / `index-CHFBBV0W.css`.
Client build and client typecheck passed.
All seven gem/sigil Chromium tests passed in 25.5 seconds against the disposable
4099 database, including the new L1-IX progression check in compact and
concentric layouts. Saved counters, same-tier extra capacity, non-spell keys,
spent gems, reaction isolation and reduced-motion behavior were verified.
Both layout screenshots were visually inspected; only 4000 and 4276 remained
listening after test teardown.

### Existing-character video follow-up

`preview-evidence/resource-gems-spell-level-glow-2026-09-16/` contains a new
normal-size and enlarged recording of the same glow build. Unlike the L1-IX
test screenshots, it uses Vanec's existing L1/L2/L3 and Sorcery Points rows;
there are no new resource rows or changed maxima. The recorder's optional
`--spell-levels` mode illuminates existing spent slots only in its disposable
copy, holds the I/II/III comparison, then restores every saved used value.
The source preview is opened read-only for copying and before/after checks.
Both videos passed full FFmpeg decoding: H.264, 30fps, 1402 frames, 46.733
seconds, no audio. The matching-build receipt records six resource events,
unchanged row keys/maxima throughout, exact restored counters, unchanged
source character, and no browser errors. The idle comparison's measured
L1/L2/L3 facet brightness is 1/1.07/1.14, with radiance 0/.065/.13.

The earlier screenshots' upper rows were the existing compact overflow for
the synthetic nine-tier character, not duplicate gems. Concentric geometry
currently admits up to five eligible resource rings; later rows, pools over
eight, and other geometry failures remain in compact continuation. The user
asked about widening the lower art for higher levels. No layout change was
made: the recommendation is a dynamically extended filigree base, preserving
the orb and symbol baseline, with new art sections rather than stretching the
current branch texture. The ring count, geometric x bound, HUD width, custom
expander position and chat-overlay space would need coordinated updates.
