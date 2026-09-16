# Player HUD revision 3 — 16 September 2026

Implemented only in `C:\Users\vcons\DnD-App-v2-player-preview`. The existing
isolated preview is still at `http://127.0.0.1:4276/join`.
The installed campaign checkout, database, service, session codes and passcodes
were not changed. No restart or campaign import is required to view these rebuilt
client assets. Changes remain local, uncommitted and unpushed; existing staged
work was preserved.

## Changes and controls

1. **Independent resizable panels.** Combat uses its bottom-left corner grip;
   chat/roll log uses its top-left grip. Dragging adjusts width and height. Arrow
   keys resize a focused grip; Shift increases the step. Collapse/reopen and page
   refresh retain preferred sizes. Opening chat no longer affects combat size or
   collapse state. Each rectangle is clamped to the available viewport.
2. **Bottom activity feed.** The existing roll/chat overlay spans the bottom lane
   to the right of the orb dock. Collapsed chat is a small bottom-right speech
   bubble with hover/focus help, not a full-width title bar. Opening full chat
   continues to hide the overlay using its existing behavior.
3. **Smaller default interface.** The gear beside top-left zoom/fit opens UI scale
   and exact panel-size controls. Default scale is 85%; supported range 70–115%.
   Width/height inputs accept normal typing, commit on Enter/blur, and revert on
   Escape. Reset restores defaults. Settings are browser-local under
   `dnd:player-layout:v1`, not campaign data. Logical defaults before scaling:
   combat 320×410, chat 420×270. Map coordinates/zoom are not UI-scaled.
4. **Resources in one place.** The duplicate resource trackers are hidden only
   in the compact player combat console. The existing resource-spending handlers,
   weapon/spell selection, upcasts, mastery/maneuver toggles and DM controls remain.
5. **Compact checks.** A 300px logical-width drawer contains Skills, Abilities
   and Saves tabs, one shared existing advantage/disadvantage toggle, and direct
   rolls. Equipped modifiers, proficiency editing and one-shot advantage
   consumption are retained. Arrow/Home/End keys operate its tab list.
6. **Orb-integrated identity/resources.** A name/class/level crest sits over the
   existing race/class guardian orb artwork. AC uses an attached shield. Open
   metalwork replaces the resource panel's standard window shell. Roman I–IX
   spell-level medallions and class-specific engraved SVG symbols replace plain
   labels. Custom resources keep a short visible name and initial medallion.
   Hover or keyboard focus reveals the complete original name and amounts.
   Click a medallion for the existing maximum/remaining editor; jewels keep their
   existing manual behavior. Gold plus-marked extra capacity is preserved even
   when spent. The rack still expands/scrolls and has no fixed logical row limit.

No new rules, resource automation, character conversion, combat calculation,
database migration, RNG or dice-result change was introduced in this revision.
This is a live implementation, not a disconnected visual mockup. The artistic
direction still benefits from user review; it is not claimed to duplicate every
detail of the earlier concept image.

## Art and font provenance

- Existing generated race/class orb holders are unchanged; see the original
  preview handoff and `player-hud-art-prompts.json` for their provenance.
- `HudOrnament.tsx` and `ResourceSigil.tsx` contain original code-native SVG
  metalwork and symbols. They are not copied Diablo assets.
- Cinzel is self-hosted (no runtime font request) from the Google Fonts source:
  <https://github.com/google/fonts/blob/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf>.
  Font SHA256:
  `F4D83D34D1F6C741193E4ACF4B3DFF9531E5A67B6AA65228D00A7DB72A4E0F34`.
  Its SIL Open Font License is bundled as `client/public/fonts/Cinzel-OFL.txt`;
  source: <https://github.com/google/fonts/blob/main/ofl/cinzel/OFL.txt>.

## Verification

- Full server/client typecheck passed.
- Unit suite: **53 files, 485 tests passed**.
- Production client build and server build/typecheck passed.
- Full isolated Playwright suite using installed Chrome: **18 tests passed**.
  Includes independent pointer/keyboard panel resizing, chat/combat independence,
  persistence, scale and viewport clamps, malformed storage fallback, all three
  check types, equipment bonuses, resource glyph accessibility/manual extra-slot
  persistence, existing combat spending, dice and unchanged DM layout.
- Visual QA used `tools/verify-player-layout.cjs`: all three campaign characters
  at 1366×768 and 1920×1080, no page errors or horizontal combat overflow.
  At the 85% default, laptop orb/resource body is approximately 383×173 physical
  pixels (the crest extends above it); desktop body approximately 403×190.
  Combat is 272×349. The existing user preview was not used for test rolls.
- Visual QA opens only the **preview** SQLite DB read-only, makes an online
  backup into an OS temporary `dnd-layout-qa-*` directory, and runs a loopback
  child on 4281. Only that child is stopped afterward. E2E uses a separate
  disposable database on 4099. Never copy test databases into a campaign.
- Live health on port 4000 and preview health on 4276 both returned ok. The
  original PIDs remained 5728 and 25032, respectively; neither was restarted.
- Tests use installed Node 24.16.0; the repository still declares Node 20–22.
  This is not a Node 22 compatibility test or broad performance benchmark.

Runtime screenshots and bounds receipt are local ignored outputs in
`preview-evidence/revision-3/`: character laptop/desktop variants,
`compact-skills.png`, `compact-abilities.png`, `compact-saves.png`,
`interface-settings.png`, `resource-adjust.png`, `resources-expanded.png`,
two-set dice variants and `layout-checks.json`.

## Useful next refinements (not implemented)

- Optional pin/reorder of resource rows so a player can keep Sorcery Points or
  another frequently used custom resource visible without expanding the rack.
- Optional spell/ability search and favorites inside the existing right combat
  panel, without relocating the familiar controls or changing execution.
- Per-character decorative trim variants for the resource branch, after review
  of this smaller layout; retain the current readable medallions/edit controls.

Previously documented dice limits and the pre-existing global damage-prompt
Enter/Space interception are unchanged; see revision 2 notes. Production rollout
and upstream reconciliation still require the separate approved deployment step.
