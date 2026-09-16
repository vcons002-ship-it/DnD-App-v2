# Player HUD revision 5 — 16 September 2026

Implemented in `C:\Users\vcons\DnD-App-v2-player-preview` only. Preview remains
`http://127.0.0.1:4276/join`. No production deployment, server
restart, campaign migration, import, passcode or session changes. Existing
staged/unstaged work is preserved; this revision is local and uncommitted.

## Review changes

- Player damage actions now render in a common top-centre dock outside the map
  stacking context, above combat/chat/HUD panels. A deliberately opened settings
  dialog still takes precedence, so its controls are not covered. The original
  DM map prompt and panel layout remain in place.
- Weapon damage uses the existing `combat:damage` pending-hit action. Keyboard
  shortcuts no longer steal Enter/Space from focused buttons, links or dialogs.
- Spell follow-up controls now appear in that same dock, with spell name and
  damage/save or remaining-dart information. Fireball still rolls at cast, then
  uses the original click-to-target apply/save flow. Magic Missile still rolls
  each dart on an explicit target click. Opening the prompt is not another cast,
  does not spend a slot, and does not automatically pick targets or apply damage.
  Done/Escape closes targeting; the existing full-log action can reopen it.
  Completed darts are not offered again. No server combat/rules code changed.
- Name, class/level and AC are above the guardian artwork, separated by a clear
  gap. Local Cinzel lettering, a small engraved divider and an SVG relief shield
  replace the name beside the orb. The icon rail clears the new header.
- Visible resource fractions are removed, including custom trackers. Accessible
  labels, hover/focus descriptions and the manual maximum/remaining editor keep
  exact counts. Gold extra-slot jewels and plus markers remain.
- Interface settings → Orb resources offers **Compact rows** (default) and
  **Concentric arcs**, stored in this browser's existing layout preference only.
  Existing preferences without this field safely default to compact.

## The two resource layouts

Compact rows place each Roman level/class sigil directly beside its jewels,
without the old fraction column or large grid cells. At 1366×768 and default
85% scale, the orb/resource base is about **321×173px**, down from about 366px
wide. The identity header occupies a separate ~45px above the artwork; those
base measurements do not include the icon rail or open drawers.

Concentric arcs arrange existing saved rows on engraved curved rails along the
orb's right side. Jewels remain native clickable/focusable buttons. The current
party's ordinary pools fit the curved presentation. To avoid unreadably small
targets, zero-capacity pools, pools above eight jewels and rows beyond the arc
radius budget continue as compact rows, not hidden or discarded. Custom rows
keep their separate expandable drawer; their logical row limit is unchanged.
All nine spell levels, manual extra capacity and existing max/used values remain
supported. The pre-existing 24-rendered-jewel limit and numeric editor for larger
pools are unchanged. Unknown 2024 references remain advisory and labeled.

Existing guardian PNGs and the revision-4 sculpted resource branch are reused.
This revision adds code-native shield/rail ornament, not newly generated raster
art or a replacement character/resource data model.

## Validation and evidence

- Server/client typecheck and production client build passed.
- Unit suite: **53 files, 485 tests passed**, using isolated database config.
- Full Chromium suite: **24 tests passed**. New coverage checks real unobstructed
  damage-button clicks with combat/chat open at 860px width, keyboard activation
  without accidental damage, Fireball/Magic Missile in the same dock, no repeat
  cast/slot consumption from opening/closing, existing log reopening, spent-dart
  handling, resource layout persistence, jewel hit-testing, and unchanged saved
  counters. Expanded-slot overlap found during this run was fixed before passing.
- Visual QA uses a disposable online backup of the preview database, never the
  live campaign or the user's current preview connection. Druk, Vanec and Varis
  were inspected at laptop/desktop sizes; both corner layouts were captured.
  Vanec also has an 860px check. No page errors or horizontal combat overflow.
- Screenshots under `preview-evidence/revision-5/`: `vanec-compact-corner.png`,
  `vanec-concentric-corner.png`, equivalent Druk/Varis views, full laptop/desktop
  views, `spell-damage-dock.png`, editor/conditions/checks views, and a geometry
  receipt in `layout-checks.json`. These are runtime captures, not concept art.
- Port 4000 and 4276 health endpoints both returned `ok: true`; process IDs
  remained 5728 (installed service) and 25032 (preview). No restart was performed.

This is targeted UI/behavior validation, not a new performance benchmark. The
new spell dock does not add a pre-cast damage-confirmation phase or change the
existing spell damage timing. Production rollout remains a separate step.
