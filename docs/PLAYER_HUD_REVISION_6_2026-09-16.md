# Player HUD revision 6 — 16 September 2026

Implemented only in `C:\Users\vcons\DnD-App-v2-player-preview`. Preview:
`http://127.0.0.1:4276/join`.
No production deployment/restart, campaign migration, character import, passcode,
session, DM layout or gameplay/rules changes. Existing dirty work is preserved;
this revision remains local and uncommitted.

## Orb and resource composition

- Removed visible "+N extra" resource captions; gold/plus jewel markers,
  accessible exact counts, tooltips and manual maximum/remaining editors remain.
- Concentric rails now use the actual health globe's measured center, preserving
  fractional pixels through UI scaling. They start at the art rim + 14px, with
  27px between circles and a shared symbol baseline 42px above the orb base.
- Gems build upward from the fixed Roman/class symbols. Corresponding gems share
  horizontal levels across circles, with X solved from each circle's radius.
  This avoids the staggered look caused by equal arc-length spacing. Spending
  changes lighting only; it does not rotate or reposition resource symbols.
- Thin single rails replace heavy/doubled connectors. Large/non-fitting pools
  remain accessible as full-size compact continuation rows; no saved rows or
  capacity are discarded. Compact rows remain the existing default preference.
- Custom trackers open from a small medallion to the right of the resource arcs.
  Its hover/focus description identifies the drawer and custom-row count; the
  advisory reference link lives inside the drawer. The full + Row editor is
  moved to Character → Resources, preserving custom/spell-slot creation, zero
  capacity, duplicate checks and manual maximum protection. The default DM
  resource editor is unchanged. Conditions stay named and clickable above the
  identity, rather than forming a footer under the resource symbols.
- AC is a shield at the orb base. Temporary HP is a smaller 38px blue vessel
  inset into the upper-right rim, clear of the central HP text and resource arcs.
  Its placement is adjusted for the ranger's differently centered globe.
- Removed the opaque resource/name backings. Existing sculpture PNG holes and
  the liquid/glass compositor expose the map behind them. If the map is fitted
  with a black letterbox under the HUD, that letterbox is still correctly black;
  the QA captures zoom the disposable viewport to put actual map pixels behind it.

## Liquid animation

The existing WebGL orb is enhanced rather than replaced with an engine:

- Genuine alpha compositing in liquid and glass, a more dimensional elliptical
  liquid surface, spherical shading, caustic highlights and sparse rising bubbles.
- Cosmetic damage/heal impulses respond to actual HP deltas, with damped slosh
  and brief red/green illumination. Maximum-only changes do not trigger impacts;
  character mounts do not replay another character's previous effect.
- Existing HP/temporary-HP values and buffer semantics are untouched.
- Bounded approximately 30fps drawing, maximum 384px canvas, hidden-tab suspension.
  Reduced motion draws on state/resize/visibility changes without a continuous
  animation loop. WebGL failure or context loss retains a translucent static fill.
- This is a shader illusion with alpha, not a real fluid simulation or optical
  refraction of the map texture. No map/fog texture is sampled.

## Guardian artwork

Built-in imagegen editing was used. Alpha is preserved, final assets are copied
into the project, and originals plus iterative fighter variants are retained.

- `client/public/art/hud/tiefling-sorcerer-v6.png`: removed the duplicated lower arm.
- `client/public/art/hud/half-elf-ranger-v7.png`: attractive adult female variant;
  bow/string removed, clear quiver on her back and one natural hand holding the
  orb's lower-left rim. Earlier v6 is retained as an intermediate reference.
- `client/public/art/hud/half-orc-fighter-v9.png`: attractive adult female variant,
  fitted feminine armor, smaller shoulder/arm bulk, exposed neckline and upper-arm
  gap. The initially oversized hand was reduced, then modestly enlarged from v8
  in response to review. Character race/class data is not changed.

All three final PNGs are 1254 × 1254 with transparent central holes. The artwork
audit found at most 2-source-pixel horizontal center drift, not a new alignment issue.
Prompts/provenance: [art prompt set](player-hud-art-revision6.json).
Dimensions, alpha sampling and hashes: [art audit](player-hud-art-audit-v6.json).

## Validation and review

- Server/client typecheck and client production build passed.
- Unit suite: **54 files, 497 tests passed** using isolated database configuration.
  One earlier run hit two pre-existing random-dice test assumptions: a natural
  20 doubled a mastery bonus where the assertion expected a normal hit, and
  a natural 20 hit in a test assuming high AC guaranteed a miss. The subsequent
  full run passed; those combat tests and gameplay code were not changed here.
- Full Chromium browser suite: **28 tests passed**. Coverage includes real
  framebuffer alpha, HP-only damage/heal effects, reduced-motion no-loop behavior,
  WebGL loss/fallback, common glyph baseline, shared gem heights, measured DOM
  distance to the orb center, unobstructed symbol/jewel clicks at 1366px/860px,
  unchanged anchors while spending, and preserved maximum/override metadata.
  The moved character-only creation dialog also verifies zero-capacity rows,
  duplicate rejection without overwriting counters, and new spell-row override
  persistence. Its select locators were corrected to target accessible combobox
  names before the final full pass; no gameplay change was needed.
- The first measured-radius check already passed on the previous arc-length
  layout. Shared horizontal gem levels address its perceptual stagger rather
  than claiming a mathematical center defect was reproduced there. Subpixel
  measurement also removes the old whole-pixel offset rounding.
- Both health endpoints returned OK; the installed service remains PID 5728 on
  port 4000 and preview PID 25032 on port 4276. Neither service was restarted.
- Final three-character runtime review passed at laptop/desktop sizes with no
  page errors or main-HP/temporary-HP overlap. All measured resource gem/symbol
  centers were within 0.017 rendered CSS pixels of their intended orb-centered
  circles. The screenshots were captured at 2x device scale for clearer review.

Runtime screenshots and geometry receipts live in `preview-evidence/revision-6/`:
`vanec-map-through-corner.png`, `druk-map-through-corner.png`,
`varis-map-through-corner.png`, full `*-map-through.png`, compact/concentric
comparisons, and `layout-checks.json`. These are runtime captures from a disposable
online backup of the preview copy, never actions against the user's connection
or the production campaign.

The user tab had an active Fireball targeting prompt, so it was not forcibly
refreshed during implementation. Refreshing that preview loads the current build;
the current cast can be reopened using the existing roll-log action if needed.

Possible later visual-only refinements: user controls for orb opacity/animation
strength, optional low-health breathing glow, and a temporary-HP shield ripple.
None introduce rules automation. No new performance benchmark was conducted.
