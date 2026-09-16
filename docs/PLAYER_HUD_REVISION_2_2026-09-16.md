# Player HUD revision 2 — 16 September 2026

Implemented in `C:\Users\vcons\DnD-App-v2-player-preview`, not the installed
campaign checkout. Preview URL remains `http://127.0.0.1:4276/join`.
No server restart, data migration, passcode/session change or deployment was
needed for this revision: the running isolated server serves the rebuilt client.
The existing staged first revision was retained. Changes remain local and
uncommitted; no push/PR was performed.

## Review changes

1. Every supported 3D die (d4, d6, d8, d10, d12, d20, paired-d10 d100) settles
   with its result face parallel to the screen and the engraving upright. The
   landing eases into this pose, with larger/brighter result engraving and dimmer
   neighboring numbers. Percentile comparisons have room for both pairs.
2. Player advantage/disadvantage reveals animate both server-recorded results,
   with Kept/Discarded labels after landing. Complete mixed-dice expressions,
   percentile dice and negative terms retain both recorded sets. The parser
   validates the existing detail text against the kept reveal. Unknown historical
   formats safely retain the original single-result display; no values are invented.
3. Character, Inventory, Spellbook, Checks and Party are purpose-drawn vector
   relief icons in a 42px-wide left-edge rail. Hover and keyboard focus show the
   name plus a short description; accessible button names remain explicit.
4. The orb and attached resource panel form a shorter bottom-left dock. Temporary
   HP is a separate liquid medallion on the orb frame; the character name/class
   and AC share a small nameplate. Resources use compact horizontal jewel rows.
   Labels still open the existing maximum/remaining editor, the rack expands or
   scrolls, custom rows remain unlimited, and extra capacity stays gold-marked.
   The 2024 advisory link is the small information symbol by Resources.
5. Combat docks 6px from the top/right map edges. A single heading carries the
   round. The redundant inner Combat and Your attacks & abilities headings are
   removed in the opt-in player console. Weapons and toggles use compact columns;
   spell/upcast and heal-target controls remain alongside their actions. Secondary
   reference sections retain their saved collapse/order preferences. Zoom/Fit
   moved beside the original top-left dice picker; its popover opens to the right
   of the icon rail so the two menus do not stack over each other.

## Compatibility boundaries

- No combat calculation, RNG, targeting, resource spending, class default, database
  schema or automation change in this revision. Comparison metadata is client
  presentation-only, derived from already-visible server roll details.
- Shared combat widgets and handlers are reused. Compact classes/props are
  opt-in on PlayerView; the DM keeps the original sidebars and combat section.
- The campaign preview that the user was reviewing was not used for test rolls.
  `tools/verify-player-layout.cjs` opens that DB read-only, uses SQLite online backup
  to a disposable `dnd-layout-qa-*` directory, copies its assets, and runs its own
  loopback-only test child on 4281. Only that child is stopped at completion.
  Never copy any test DB back into the campaign.

## Verification

- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — 52 files, 482 tests passed.
- `npm.cmd run build` — passed.
- Full Playwright suite with installed Chrome — 13 tests passed (23.4s).
  Includes all seven face-forward dice, d20 advantage/disadvantage, mixed sets,
  percentile sets, keyboard icon help, manual resource edits surviving reload,
  actual targeted weapon advantage, upcast slot spending, unchanged DM layout,
  and reduced-motion/unavailable-WebGL fallback.
- `node tools/verify-player-layout.cjs` — all three current characters at 1366×768
  and 1920×1080; no page errors or horizontal combat overflow. Editable resource
  popup, expanded rows and two-set dice screenshots captured.
- Laptop HUD bounds: 450×204 (Druk/Varis), 450×215 (Vanec with extra slots).
  Desktop HUD: 474×224. Laptop combat width 304, desktop width 320.
- Health: live port 4000 still PID 5728; isolated preview port 4276 still PID
  25032. Both returned ok. No live service restart or installed-checkout write.
- Validation used installed Node 24.16.0; repository engines still declare Node
  20–22. This is not a Node 22 compatibility or broad performance benchmark.

Artifacts are local ignored QA outputs under `preview-evidence/revision-2/`:
`druk-laptop.png`, `vanec-laptop.png`, `varis-laptop.png`, desktop variants,
icon-tooltip variants, `resource-adjust.png`, `resources-expanded.png`,
`advantage.png`, `disadvantage-mixed.png`, `advantage-percentile.png`, and
`layout-checks.json`. These are runtime screenshots, not concept mockups.

## Suggested next refinements (not implemented)

- Optional pin/reorder of visible resource rows, so class resources such as
  Sorcery Points can remain beside spell slots without increasing HUD size.
- An in-panel spell/ability search and favorites, retaining all combat controls
  on the right and leaving their mechanics untouched.
- An explicit combat-panel resize handle or compact/comfortable density choice.
- Optional longer dice hold/replay-last-result for reading comparison sets.
- Fix the pre-existing damage prompt keyboard shortcut: its global Enter/Space
  handler can intercept activation of another focused action while damage is
  pending. The regression test completes the existing explicit damage step first;
  this revision deliberately does not change that behavior.

Existing dice boundaries: a five-second safety timeout can truncate unusually
long/many-term animations; nonstandard die sizes retain fallback geometry; old
untargeted spell-attack paths without a reveal payload remain log-only.
