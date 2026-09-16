# Player HUD revision 4 — 16 September 2026

Implemented only in the existing isolated preview clone. Preview URL remains
`http://127.0.0.1:4276/join`. No service restart, deployment,
campaign conversion, import, passcode/session change, or production database
write. Existing staged work is preserved; changes are local and uncommitted.

## Review changes

- **Dice picker:** fixed the pointer dead zone created by the old side offset.
  Player choices now open in a connected compact grid directly below the d20,
  constrained by viewport width/height and player UI scale. A small More dice
  chevron pins the menu without rolling. Hover, keyboard, Escape and outside
  dismissal work. The seven existing roll actions are retained. The DM still
  uses the original picker implementation and placement.
- **Stats:** Skills / Stats replaces Skills / Abilities / Saves. Clicking a stat
  offers the existing sheet's small Stat / Save choice pattern and CSS, with
  effective bonuses. Opening/dismissing a choice does not consume advantage;
  actually rolling uses the original check/save actions and shared one-shot
  advantage. The DM StatBlock remains untouched.
- **Identity:** removed the angular crest covering the guardian artwork. Name,
  class and level now use restrained title-case serif lettering beside the orb,
  with a small AC shield. The name is a direct character-record button. All
  original orb-holder artwork remains visible and unchanged.
- **Resources:** recognized stored spell levels and class resources are always
  visible as unboxed medallion/jewel clusters. This area has no scrolling window.
  Custom/unrecognized trackers live in a separate collapsible drawer. Only that
  drawer scrolls when needed, and dismisses on outside click/Escape. No rows or
  maxima are generated from class defaults; existing saved counters remain the
  source of truth. All medallions keep full-name/amount hover/focus help and
  open the existing maximum/remaining editor. Extra capacity stays gold-marked.
  The 24 rendered-jewel cap per row and numeric editor for larger values are
  unchanged. There is still no logical custom-row limit.
- **Conditions:** all active labels appear as colored chips in the corner,
  including named concentration. Clicking a chip directly opens the existing
  fully expanded condition picker. Empty characters show No conditions +.
  Conditions are separate from the health/temp-HP drawer. Existing manual
  condition actions, effects and automation are unchanged.

The corner is now useful through direct identity, health/temp-HP, resource edits
and named-condition controls, alongside the established left-edge action icons.
Weapon/spell execution and combat toggles stay in the right-side combat panel.

## Artwork

The image-generation skill was used in built-in mode to create a transparent
sculpted silver/bronze branch matching the existing guardian art. This replaces
the prior SVG window-shaped resource backing, rather than adding another box.

Production asset: `client/public/art/hud/resource-branch-v4.png` (2172×724 RGBA,
739,084 bytes). Original generated output retained; no image-processing edits.
The original orb was a style reference, not an edit target. Dynamic labels and
jewels remain live accessible controls, not baked into a bitmap.

Exact prompt, source path, alpha samples and hash:
[`player-hud-art-revision4.json`](player-hud-art-revision4.json).

## Validation

- Server/client typecheck and client production build passed.
- Unit suite: 53 files, **485 tests passed**.
- Full isolated Chromium suite with installed Chrome: **23 tests passed**.
  New checks exercise a slow hover crossing into all seven dice, disclosure
  without accidental d20 roll, keyboard navigation, narrow bounds at 115% scale,
  unchanged DM dice, Stat / Save choice flow, named-condition editing, resource
  separation, non-scrolling core resources at laptop/860px width, identity/orb
  nonintersection, and saved custom/max/remaining values.
- Visual QA: Druk, Vanec and Varis at 1366×768 and 1920×1080, plus Vanec at
  860×736. No page errors or horizontal combat overflow. Laptop orb/resource
  bounds: width about 366px, height 173–206px depending on saved rows. The open
  custom/condition/check dialogs are transient and outside those base bounds.
- Runtime screenshots: `preview-evidence/revision-4/vanec-laptop.png`,
  `druk-laptop.png`, `varis-laptop.png`, desktop variants, `vanec-narrow.png`,
  `dice-picker-narrow.png`, `stat-save-choice.png`, `conditions.png`,
  `resources-expanded.png`, `resource-adjust.png`, and `layout-checks.json`.
- Tests use disposable databases (E2E port 4099; visual QA port 4281 based only
  on a read-only online backup of the preview copy). User preview was not used
  for test actions. Live port 4000 and preview port 4276 returned healthy.
- This is targeted behavior and visual validation, not a broad performance
  benchmark. Installed Node 24 was used; declared Node 20–22 compatibility was
  not separately tested. Earlier documented dice/damage-key limitations remain
  except focused dice-picker keyboard activation now stops event propagation.

## Remaining review boundaries

The new common metalwork matches the existing material palette; it is not three
new bespoke race-specific resource sculptures. The existing three guardian/orb
artworks remain race/class-specific. No new quick-cast, rest, spending, condition
resolution or rules automation was added. Production rollout is still separate.
